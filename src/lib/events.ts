import type { Sport } from "./sports";
import { haversine, trackStats } from "./geo";
import type { Pt } from "./types";

export type PostKind = "depart" | "arrivee" | "ravito" | "eau" | "controle" | "secours" | "signaleur" | "parking";
export const POST_KINDS: Record<PostKind, { label: string; color: string; letter: string }> = {
  depart: { label: "Départ", color: "#1e7a58", letter: "D" },
  arrivee: { label: "Arrivée", color: "#0d1b17", letter: "A" },
  ravito: { label: "Ravitaillement", color: "#f0612b", letter: "R" },
  eau: { label: "Point d'eau", color: "#3ba6c9", letter: "E" },
  controle: { label: "Point de contrôle", color: "#7a4bd1", letter: "C" },
  secours: { label: "Poste de secours", color: "#d4202a", letter: "+" },
  signaleur: { label: "Signaleur", color: "#c98a0b", letter: "S" },
  parking: { label: "Parking", color: "#36504a", letter: "P" },
};

/** Pictogramme de chaque type de poste : ceux des points d'intérêt du site (même dessin sur les cartes, les listes et les fiches) ; départ et arrivée reprennent les drapeaux des parcours. */
export const POST_ICON: Record<PostKind, import("./types").PoiType | "start" | "finish"> = { depart: "start", arrivee: "finish", ravito: "ravito", eau: "eau", controle: "controle", secours: "secours", signaleur: "danger", parking: "parking" };
export const POST_COLOR: Record<PostKind, string> = { depart: "#1e7a58", arrivee: "#0d1b17", ravito: "#d9622b", eau: "#1f8fbf", controle: "#6b4bc4", secours: "#cf2a35", signaleur: "#b8862b", parking: "#2b4a8c" };

export interface Race { id: string; label: string; sport: Sport; distanceKm: number; gainM: number; startTime: string; maxHours: number; routeId?: string; fee?: string; /** repris du parcours lié */ lossM?: number; minEle?: number; maxEle?: number }

/** Valeurs d'une course reprises du parcours lié (jamais saisies à la main) : distance, dénivelés, altitudes. */
export function raceFactsFromRoute(coords: Pt[]): Pick<Race, "distanceKm" | "gainM" | "lossM" | "minEle" | "maxEle"> {
  const s = trackStats(coords, 3), ele = Number.isFinite(s.minEle) && Number.isFinite(s.maxEle);
  return { distanceKm: +(s.distanceM / 1000).toFixed(1), gainM: Math.round(s.gainM), lossM: Math.round(s.lossM), minEle: ele ? Math.round(s.minEle) : undefined, maxEle: ele ? Math.round(s.maxEle) : undefined };
}
/** Vrai si les valeurs enregistrées de la course ne correspondent plus au parcours lié (parcours modifié depuis). */
export function raceOutOfSync(r: Race, coords: Pt[]): boolean {
  const f = raceFactsFromRoute(coords);
  return r.distanceKm !== f.distanceKm || r.gainM !== f.gainM || r.lossM !== f.lossM || r.minEle !== f.minEle || r.maxEle !== f.maxEle;
}
export interface Post { id: string; raceId: string; kind: PostKind; name: string; km: number; lng?: number; lat?: number; /** heures après le départ */ cutoffH?: number; staffNeeded: number; note: string; /** proposé automatiquement, pas encore vérifié par l'organisateur */ auto?: boolean }
export interface Volunteer { id: string; name: string; phone: string; postId: string; from: string; to: string; instructions: string }
export type Role = "admin" | "logistique" | "benevoles" | "lecture";
export interface Member { id: string; name: string; email: string; role: Role }

export const ROLES: Record<Role, { label: string; can: string[] }> = {
  admin: { label: "Administrateur", can: ["Modifier l'événement", "Gérer les courses et parcours", "Gérer la logistique", "Gérer les bénévoles", "Gérer l'équipe", "Exporter"] },
  logistique: { label: "Responsable logistique", can: ["Gérer la logistique", "Gérer les bénévoles", "Exporter"] },
  benevoles: { label: "Responsable bénévoles", can: ["Gérer les bénévoles", "Exporter les fiches bénévoles"] },
  lecture: { label: "Lecture seule", can: ["Consulter"] },
};

export interface EventModel {
  id: string; name: string; organizer: string; date: string; place: string; region: string; description: string; rules: string; practical: string; registrationUrl: string;
  races: Race[]; posts: Post[]; volunteers: Volunteer[]; team: Member[]; origin: "mine" | "community"; createdAt: number;
  /** Visible par tous (nécessite les comptes) */
  visibility?: "prive" | "public";
  /** Collection regroupant les parcours de l'événement */
  collectionId?: string;
  /** Propriétaire (événements publiés par un membre) */
  ownerId?: string;
  /** Préparation de l'épreuve (effectifs, points cochés, budget) : reste sur cet appareil */
  prep?: import("./race-prep").Prep;
}

// ── Postes et bénévoles : une seule source (le poste noté sur la fiche du bénévole), lue par la carte comme par les fiches ──
/** Numéro de chaque poste tel qu'affiché sur la carte : par course, dans l'ordre des kilomètres. */
export function postNumbers(ev: Pick<EventModel, "races" | "posts">): Map<string, { n: number; race: Race | undefined }> {
  const out = new Map<string, { n: number; race: Race | undefined }>();
  for (const raceId of [...new Set(ev.posts.map((p) => p.raceId))]) {
    const race = ev.races.find((r) => r.id === raceId);
    ev.posts.map((p, i) => ({ p, i })).filter((x) => x.p.raceId === raceId).sort((a, b) => a.p.km - b.p.km || a.i - b.i).forEach((x, k) => out.set(x.p.id, { n: k + 1, race }));
  }
  return out;
}
/** Libellé d'un poste, identique sur la carte et sur les fiches : « Poste 3 — Ravitaillement 1 (km 12,4) ». */
export function postLabel(ev: Pick<EventModel, "races" | "posts">, p: Post, withRace = ev.races.length > 1): string {
  const x = postNumbers(ev).get(p.id);
  return `Poste ${x?.n ?? "?"} — ${p.name || POST_KINDS[p.kind].label} (km ${String(+p.km.toFixed(1)).replace(".", ",")})${withRace && x?.race ? ` · ${x.race.label}` : ""}`;
}
export const volunteersAt = (ev: Pick<EventModel, "volunteers">, postId: string) => ev.volunteers.filter((v) => v.postId === postId);
const normName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
/** Affecte un bénévole à un poste (ou le libère avec ""). Un bénévole n'a qu'un poste : l'ancien est quitté ; un poste inconnu vaut « non affecté ». */
export function assignVolunteer<E extends Pick<EventModel, "posts" | "volunteers">>(ev: E, volunteerId: string, postId: string): E {
  const target = postId && ev.posts.some((p) => p.id === postId) ? postId : "";
  return { ...ev, volunteers: ev.volunteers.map((v) => (v.id === volunteerId ? { ...v, postId: target } : v)) };
}
/** Ajoute un bénévole directement à un poste depuis la carte. Si une fiche porte déjà ce nom, elle est réaffectée : pas de doublon. */
export function addVolunteerAt<E extends Pick<EventModel, "posts" | "volunteers">>(ev: E, name: string, postId: string, newId: string): E {
  const n = name.replace(/\s+/g, " ").trim(); if (!n) return ev;
  const same = ev.volunteers.find((v) => normName(v.name) === normName(n));
  if (same) return assignVolunteer(ev, same.id, postId);
  return assignVolunteer({ ...ev, volunteers: [...ev.volunteers, { id: newId, name: n, phone: "", postId: "", from: "", to: "", instructions: "" }] }, newId, postId);
}
/** Fiches dont le poste n'existe plus : remises à « non affecté » (aucune fiche n'est supprimée). */
export function cleanAssignments<E extends Pick<EventModel, "posts" | "volunteers">>(ev: E): E {
  const ids = new Set(ev.posts.map((p) => p.id));
  return ev.volunteers.some((v) => v.postId && !ids.has(v.postId)) ? { ...ev, volunteers: ev.volunteers.map((v) => (v.postId && !ids.has(v.postId) ? { ...v, postId: "" } : v)) } : ev;
}

/** Distance cumulée (m) et « effort » cumulé (km + D+/100) en chaque point de la trace. */
export function effortProfile(coords: Pt[]) {
  const d = [0], e = [0];
  for (let i = 1; i < coords.length; i++) {
    const step = haversine(coords[i - 1], coords[i]);
    const up = Math.max(0, coords[i][2] - coords[i - 1][2]);
    d.push(d[i - 1] + step); e.push(e[i - 1] + step / 1000 + up / 100);
  }
  return { d, e };
}

/** Position d'un point sur la trace : kilomètre et index du point le plus proche. */
export function positionOnTrack(coords: Pt[], lng: number, lat: number) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < coords.length; i++) { const h = haversine(coords[i], [lng, lat]); if (h < bd) { bd = h; bi = i; } }
  const { d } = effortProfile(coords);
  return { km: d[bi] / 1000, index: bi, offTrackM: bd };
}

export interface PassageRow { post: Post; km: number; times: { elapsedMin: number; clock: string }[]; late: boolean[] }

const pad = (n: number) => String(n).padStart(2, "0");
export function clockAt(start: string, addMin: number) {
  const [h, m] = start.split(":").map(Number);
  const t = Math.round(h * 60 + m + addMin);
  return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}${t >= 1440 ? " (+1 j)" : ""}`;
}

/** Temps de passage pour plusieurs scénarios (durée totale en heures). Répartition au prorata de l'effort si la trace est connue, sinon des km. */
export function passageTable(race: Race, posts: Post[], coords: Pt[] | null, finishHours: number[]): PassageRow[] {
  let frac: (p: Post) => number;
  if (coords && coords.length > 1) {
    const { d, e } = effortProfile(coords);
    const total = e[e.length - 1] || 1;
    frac = (p) => {
      const target = p.km * 1000; let i = 0;
      while (i < d.length - 1 && d[i] < target) i++;
      return Math.min(1, e[i] / total);
    };
  } else frac = (p) => Math.min(1, p.km / (race.distanceKm || 1));
  return posts.filter((p) => p.raceId === race.id).sort((a, b) => a.km - b.km).map((post) => {
    const f = frac(post);
    const times = finishHours.map((h) => { const m = h * 60 * f; return { elapsedMin: m, clock: clockAt(race.startTime, m) }; });
    return { post, km: post.km, times, late: times.map((t) => post.cutoffH != null && t.elapsedMin > post.cutoffH * 60) };
  });
}

export interface EventFilters { q: string; sport: string; region: string; minKm: number; maxKm: number; from: string; to: string }
export const DEFAULT_EVENT_FILTERS: EventFilters = { q: "", sport: "", region: "", minKm: 0, maxKm: 300, from: "", to: "" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function filterEvents(events: EventModel[], f: EventFilters): EventModel[] {
  const q = norm(f.q.trim());
  return events.filter((e) => {
    if (q && !norm(`${e.name} ${e.place} ${e.region} ${e.organizer}`).includes(q)) return false;
    if (f.region && e.region !== f.region) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    if (f.sport && !e.races.some((r) => r.sport === f.sport)) return false;
    if (!e.races.some((r) => r.distanceKm >= f.minKm && r.distanceKm <= f.maxKm) && e.races.length) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// ── Logistique proposée automatiquement à partir du parcours ──
const POI_POST: Partial<Record<string, PostKind>> = { ravito: "ravito", eau: "eau", controle: "controle", secours: "secours", parking: "parking", danger: "signaleur" };
export interface ProposeInput { race: Race; coords: Pt[]; pois?: { type: string; name: string; lng: number; lat: number }[]; roads?: { kind: "traversee" | "route"; atM: number; lng: number; lat: number; roadClass: string; name: string; lengthM: number }[]; newId: () => string }
const ROAD_RANKS: Record<string, number> = { motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 1 };
const ROAD_WORD: Record<string, string> = { motorway: "autoroute", trunk: "voie rapide", primary: "route principale", secondary: "route secondaire", tertiary: "route locale", unclassified: "petite route", residential: "rue" };
/**
 * Postes proposés pour une course : départ, arrivée, points d'intérêt déjà placés sur le parcours (repris tels quels, sans ressaisie),
 * ravitaillements espacés selon la distance, ravitaillement et secours à l'arrivée, barrière horaire à mi-course au-delà du marathon,
 * signaleurs aux traversées et passages sur route détectés. Tous marqués `auto` : ce sont des propositions à vérifier sur le terrain.
 */
export function proposePosts({ race, coords, pois = [], roads = [], newId }: ProposeInput): Post[] {
  if (coords.length < 2) return [];
  const { d, e } = effortProfile(coords), totalKm = d[d.length - 1] / 1000, totalE = e[e.length - 1] || 1;
  const at = (km: number) => { const t = Math.max(0, Math.min(d[d.length - 1], km * 1000)); let i = 0; while (i < d.length - 1 && d[i] < t) i++; return { i, lng: coords[i][0], lat: coords[i][1] }; };
  const out: Post[] = [];
  const add = (kind: PostKind, name: string, km: number, staff: number, o: Partial<Post> = {}) => { const p = at(km); out.push({ id: newId(), raceId: race.id, kind, name, km: +km.toFixed(2), lng: p.lng, lat: p.lat, staffNeeded: staff, note: "", auto: true, ...o }); };
  add("depart", "Départ", 0, 4);
  // points d'intérêt du parcours : déjà saisis une fois dans l'éditeur, repris ici
  for (const poi of pois) { const kind = POI_POST[poi.type]; if (!kind) continue; const pos = positionOnTrack(coords, poi.lng, poi.lat); if (pos.offTrackM > 300) continue; out.push({ id: newId(), raceId: race.id, kind, name: poi.name || POST_KINDS[kind].label, km: +pos.km.toFixed(2), lng: poi.lng, lat: poi.lat, staffNeeded: kind === "ravito" ? 4 : kind === "eau" || kind === "parking" ? 1 : 2, note: "Repris des points d'intérêt du parcours", auto: true }); }
  const has = (k: PostKind) => out.some((p) => p.kind === k);
  const ravKm: number[] = out.filter((p) => p.kind === "ravito").map((p) => p.km);
  if (!ravKm.length && totalKm > 12) { const step = totalKm > 80 ? 15 : totalKm > 42 ? 12 : 10, n = Math.max(1, Math.round(totalKm / step) - 1); for (let k = 1; k <= n; k++) { const km = (k * totalKm) / (n + 1); ravKm.push(km); add("ravito", `Ravitaillement ${k}`, km, 4, { note: "Emplacement à ajuster selon l'accès en véhicule" }); } }
  if (!out.some((p) => p.kind === "ravito" && p.km >= totalKm - 0.5)) add("ravito", "Ravitaillement d'arrivée", totalKm, 4, { note: "Boissons, eau, solide" });
  if (!has("secours")) { add("secours", "Poste de secours — arrivée", totalKm, 2); if (totalKm > 21 && ravKm.length) add("secours", "Poste de secours — mi-course", ravKm[Math.floor(ravKm.length / 2)], 2, { note: "À placer avec le responsable des secours, sur un accès véhicule" }); }
  if (totalKm > 42 && !out.some((p) => p.cutoffH != null) && ravKm.length && race.maxHours > 0) { const km = ravKm[Math.floor(ravKm.length / 2)], frac = Math.min(1, e[at(km).i] / totalE); add("controle", "Contrôle et barrière horaire", km, 2, { cutoffH: Math.ceil(race.maxHours * frac * 4) / 4, note: "Barrière calculée au prorata de l'effort sur le temps limite" }); }
  // signaleurs : toutes les routes classées et petites routes, puis les rues jusqu'à 15 postes
  const ranked = [...roads].sort((a, b) => (ROAD_RANKS[b.roadClass] ?? 0) - (ROAD_RANKS[a.roadClass] ?? 0) || a.atM - b.atM), keep = ranked.filter((r, i) => (ROAD_RANKS[r.roadClass] ?? 0) >= 2 || i < 15).slice(0, 25).sort((a, b) => a.atM - b.atM);
  for (const r of keep) { if (out.some((p) => p.kind === "signaleur" && Math.abs(p.km - r.atM / 1000) < 0.15)) continue; const rank = ROAD_RANKS[r.roadClass] ?? 0; out.push({ id: newId(), raceId: race.id, kind: "signaleur", name: `${r.kind === "traversee" ? "Traversée" : "Entrée sur route"} — ${r.name || ROAD_WORD[r.roadClass] || "route"}`, km: +(r.atM / 1000).toFixed(2), lng: r.lng, lat: r.lat, staffNeeded: rank >= 3 ? 2 : 1, note: r.kind === "route" && r.lengthM > 0 ? `Le parcours suit la route sur ${r.lengthM >= 1000 ? `${(r.lengthM / 1000).toFixed(1).replace(".", ",")} km` : `${r.lengthM} m`}` : `Traversée d'une ${ROAD_WORD[r.roadClass] ?? "route"}`, auto: true }); }
  add("arrivee", "Arrivée", totalKm, 6);
  return out.sort((a, b) => a.km - b.km);
}
