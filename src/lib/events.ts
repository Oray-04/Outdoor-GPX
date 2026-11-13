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
export interface Post { id: string; raceId: string; kind: PostKind; name: string; km: number; lng?: number; lat?: number; /** heures après le départ */ cutoffH?: number; staffNeeded: number; note: string }
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
