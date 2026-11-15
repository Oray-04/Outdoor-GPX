import { haversine } from "./geo";
import { POST_KINDS, cleanAssignments, positionOnTrack, postsOfRace, proposePosts, type EventModel, type Post, type PostKind, type Race } from "./events";
import type { Poi, PoiType, Pt, SavedRoute } from "./types";

/**
 * POI partagés entre un parcours et la logistique des événements qui l'utilisent.
 *
 * Une seule source pour l'emplacement, le type et le nom : les points d'intérêt du parcours (`route.pois`).
 * Un poste de logistique lié (`post.poiId`) n'ajoute que ce qui est propre à l'organisation (bénévoles nécessaires,
 * barrière horaire, consignes) ; ses champs nom / type / position / km sont une copie tenue à jour ici.
 * Départ et arrivée sont pris aux extrémités du parcours (sauf s'ils ont été déplacés à la main).
 * Toutes les fonctions sont pures et idempotentes : relancées sur le même état, elles ne changent rien.
 */
export const KIND_TO_POI: Partial<Record<PostKind, PoiType>> = { ravito: "ravito", eau: "eau", controle: "controle", secours: "secours", parking: "parking", signaleur: "danger", vue: "vue" };
export const POI_TO_KIND: Record<PoiType, PostKind> = { ravito: "ravito", eau: "eau", controle: "controle", secours: "secours", parking: "parking", danger: "signaleur", vue: "vue" };
export const STAFF_DEFAULT: Record<PostKind, number> = { depart: 4, arrivee: 6, ravito: 4, eau: 1, controle: 2, secours: 2, signaleur: 1, parking: 1, vue: 0 };
export const isEndpoint = (k: PostKind) => k === "depart" || k === "arrivee";
/** Types placés librement (hors du tracé) : jamais aimantés sur la trace. */
export const FREE_KINDS: PostKind[] = ["parking"];
/** En deçà de cette distance du tracé, un poste « sur le parcours » est aimanté sur la trace. */
export const SNAP_M = 60;
/** Identifiants déterministes : deux synchronisations simultanées (deux onglets, synchronisation en ligne) produisent le même poste, jamais un doublon. */
export const poiPostId = (raceId: string, poiId: string) => `${raceId}~${poiId}`;
export const endpointId = (raceId: string, k: "depart" | "arrivee") => `${raceId}~${k}`;

/** Emplacement retenu pour un clic ou un déplacement : aimanté sur la trace si proche (et si le type s'y prête), libre sinon. */
export function placeOn(coords: Pt[], kind: PostKind, lng: number, lat: number): { lng: number; lat: number; km: number; offTrackM?: number } {
  if (coords.length < 2) return { lng, lat, km: 0 };
  const pos = positionOnTrack(coords, lng, lat), km = +pos.km.toFixed(2);
  if (!FREE_KINDS.includes(kind) && pos.offTrackM <= SNAP_M) return { lng: coords[pos.index][0], lat: coords[pos.index][1], km };
  return { lng: +lng.toFixed(6), lat: +lat.toFixed(6), km, offTrackM: pos.offTrackM > 15 ? Math.round(pos.offTrackM) : undefined };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clean = (p: Post): Post => { const o = { ...p } as Record<string, unknown>; for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o as unknown as Post; };

interface Occ { raceId: string; poi: Poi; km: number; offTrackM?: number }
const endKm = (coords: Pt[]) => positionOnTrackKm(coords, coords.length - 1);

/** Phase 1, par course : anciens postes sans POI versés dans le parcours ; départ et arrivée aux extrémités (sauf déplacement manuel). Les postes liés à un POI sont laissés à la phase 2. */
function prepareRace(racePosts: Post[], race: Race, route: Pick<SavedRoute, "coords" | "pois">): { posts: Post[]; addPois: Poi[] } {
  const coords = route.coords, pois = route.pois ?? [];
  const total = endKm(coords), addPois: Poi[] = [], claimed = new Set(racePosts.map((p) => p.poiId).filter(Boolean) as string[]), out: Post[] = [];
  const ends: Partial<Record<"depart" | "arrivee", boolean>> = {};
  for (const p0 of racePosts) {
    let p = p0;
    if (!p.poiId && !isEndpoint(p.kind)) {
      const type = KIND_TO_POI[p.kind];
      if (type) {
        let lng = p.lng, lat = p.lat;
        if (lng == null || lat == null) { const t = Math.max(0, Math.min(total, p.km)); let best = 0, bd = Infinity; for (let i = 0; i < coords.length; i++) { const d = Math.abs(positionOnTrackKm(coords, i) - t); if (d < bd) { bd = d; best = i; } } lng = coords[best][0]; lat = coords[best][1]; }
        const near = pois.concat(addPois).find((q) => q.type === type && !claimed.has(q.id) && haversine([q.lng, q.lat], [lng!, lat!]) < 60);
        const poi = near ?? { id: `lp-${p.id}`, type, name: p.name || POST_KINDS[p.kind].label, lng: lng!, lat: lat! };
        if (!near && !pois.some((q) => q.id === poi.id) && !addPois.some((q) => q.id === poi.id)) addPois.push(poi);
        claimed.add(poi.id); p = { ...p, poiId: poi.id };
      }
    }
    if (isEndpoint(p.kind) && !p.poiId) {
      const k = p.kind as "depart" | "arrivee";
      if (ends[k]) { out.push(p); continue; }
      ends[k] = true;
      const c = k === "depart" ? coords[0] : coords[coords.length - 1];
      if (p.pinned && p.lng != null && p.lat != null) { const q = positionOnTrack(coords, p.lng, p.lat); out.push(clean({ ...p, km: +q.km.toFixed(2), offTrackM: q.offTrackM > 15 ? Math.round(q.offTrackM) : undefined })); }
      else out.push(clean({ ...p, pinned: undefined, offTrackM: undefined, lng: c[0], lat: c[1], km: k === "depart" ? 0 : +total.toFixed(2) }));
      continue;
    }
    out.push(p);
  }
  for (const k of ["depart", "arrivee"] as const) if (!ends[k]) { const c = k === "depart" ? coords[0] : coords[coords.length - 1]; out.push({ id: endpointId(race.id, k), raceId: race.id, kind: k, name: POST_KINDS[k].label, km: k === "depart" ? 0 : +total.toFixed(2), lng: c[0], lat: c[1], staffNeeded: STAFF_DEFAULT[k], note: "" }); }
  return { posts: out, addPois };
}

/**
 * Phase 2, pour tout l'événement : un seul poste par POI, même s'il figure sur plusieurs parcours (POI commun).
 * Nom, type et position viennent du POI ; kilomètre propre à chaque course (`shared`) ; doublons fusionnés (bénévoles reportés, effectif le plus grand gardé).
 */
function linkPois(posts: Post[], occ: Map<string, Occ[]>, routed: Set<string>): { posts: Post[]; moved: Map<string, string> } {
  const byPoi = new Map<string, Post[]>(), out: Post[] = [], moved = new Map<string, string>();
  for (const p of posts) { if (p.poiId) byPoi.set(p.poiId, [...(byPoi.get(p.poiId) ?? []), p]); else out.push(p); }
  const shaped = (keep: Post, o: Occ[], staff: number): Post => {
    const prim = o.find((x) => x.raceId === keep.raceId) ?? o[0], kind = POI_TO_KIND[prim.poi.type] ?? keep.kind;
    const shared = o.filter((x) => x !== prim).map((x) => clean({ raceId: x.raceId, km: x.km, offTrackM: x.offTrackM } as unknown as Post) as unknown as { raceId: string; km: number; offTrackM?: number });
    return clean({ ...keep, raceId: prim.raceId, kind, name: prim.poi.name || POST_KINDS[kind].label, lng: prim.poi.lng, lat: prim.poi.lat, km: prim.km, offTrackM: prim.offTrackM, staffNeeded: staff, shared: shared.length ? shared : undefined });
  };
  for (const [poiId, list] of byPoi) {
    const o = occ.get(poiId);
    if (!o) { for (const p of list) if (!routed.has(p.raceId)) out.push(p); continue; } // POI retiré de tous les parcours : poste retiré (course sans parcours : gardé)
    const races = o.map((x) => x.raceId), keep = list.find((p) => races.includes(p.raceId)) ?? list[0];
    for (const d of list) if (d !== keep) moved.set(d.id, keep.id);
    out.push(shaped(keep, o, Math.max(...list.map((p) => p.staffNeeded))));
  }
  for (const [poiId, o] of occ) if (!byPoi.has(poiId)) {
    const kind = POI_TO_KIND[o[0].poi.type]; if (!kind) continue;
    out.push(shaped({ id: poiPostId(o[0].raceId, poiId), raceId: o[0].raceId, kind, name: "", km: 0, staffNeeded: STAFF_DEFAULT[kind], note: "", poiId }, o, STAFF_DEFAULT[kind]));
  }
  return { posts: out, moved };
}

const KIND_ORDER = (p: Post) => (p.kind === "depart" ? -1 : p.kind === "arrivee" ? 1 : 0);
function occurrences(races: Race[], routes: Map<string, Pick<SavedRoute, "coords" | "pois">>): Map<string, Occ[]> {
  const occ = new Map<string, Occ[]>();
  for (const race of races) {
    const rt = race.routeId ? routes.get(race.routeId) : undefined; if (!rt || rt.coords.length < 2) continue;
    for (const poi of rt.pois ?? []) {
      if (!POI_TO_KIND[poi.type] || occ.get(poi.id)?.some((x) => x.raceId === race.id)) continue;
      const q = positionOnTrack(rt.coords, poi.lng, poi.lat);
      occ.set(poi.id, [...(occ.get(poi.id) ?? []), { raceId: race.id, poi, km: +q.km.toFixed(2), offTrackM: q.offTrackM > 15 ? Math.round(q.offTrackM) : undefined }]);
    }
  }
  return occ;
}

/** Postes d'une seule course réalignés sur les POI de son parcours (voir `syncEvent` pour un événement entier). */
export function syncRacePosts(racePosts: Post[], race: Race, route: Pick<SavedRoute, "coords" | "pois">): { posts: Post[]; addPois: Poi[] } {
  if (route.coords.length < 2) return { posts: racePosts, addPois: [] };
  const prep = prepareRace(racePosts, race, route), full = { coords: route.coords, pois: [...(route.pois ?? []), ...prep.addPois] };
  const { posts } = linkPois(prep.posts, occurrences([race], new Map([["r", full]]).set(race.routeId ?? "r", full)), new Set([race.id]));
  return { posts: posts.sort((a, b) => a.km - b.km || KIND_ORDER(a) - KIND_ORDER(b)), addPois: prep.addPois };
}
const kmCache = new WeakMap<Pt[], number[]>();
function positionOnTrackKm(coords: Pt[], i: number) {
  let d = kmCache.get(coords);
  if (!d) { d = [0]; for (let j = 1; j < coords.length; j++) d.push(d[j - 1] + haversine(coords[j - 1], coords[j]) / 1000); kmCache.set(coords, d); }
  return d[i];
}

/**
 * Événement entier réaligné sur les parcours de ses courses. Renvoie le même objet si rien ne change
 * (pas d'écriture inutile, pas de boucle), et les POI à verser dans chaque parcours (migration des anciens postes).
 */
export function syncEvent(ev: EventModel, routes: Pick<SavedRoute, "id" | "coords" | "pois">[]): { ev: EventModel; addPois: Map<string, Poi[]> } {
  const addPois = new Map<string, Poi[]>(), routed = new Set<string>(), rmap = new Map<string, Pick<SavedRoute, "coords" | "pois">>();
  let posts: Post[] = [];
  const raceIdx = new Map(ev.races.map((r, i) => [r.id, i]));
  for (const race of ev.races) {
    const rt = race.routeId ? routes.find((r) => r.id === race.routeId) : undefined; if (!rt || rt.coords.length < 2) continue;
    routed.add(race.id);
    const cur = { coords: rt.coords, pois: [...(rt.pois ?? []), ...(addPois.get(rt.id) ?? [])] };
    const res = prepareRace(ev.posts.filter((p) => p.raceId === race.id), race, cur);
    if (res.addPois.length) addPois.set(rt.id, [...(addPois.get(rt.id) ?? []), ...res.addPois]);
    posts.push(...res.posts);
    rmap.set(rt.id, { coords: rt.coords, pois: [...(rt.pois ?? []), ...(addPois.get(rt.id) ?? [])] });
  }
  if (!routed.size) return { ev, addPois };
  const rest = ev.posts.filter((p) => !routed.has(p.raceId));
  const linked = linkPois(posts, occurrences(ev.races, rmap), routed); // courses sans parcours : postes laissés tels quels
  posts = linked.posts.sort((a, b) => (raceIdx.get(a.raceId)! - raceIdx.get(b.raceId)!) || a.km - b.km || KIND_ORDER(a) - KIND_ORDER(b));
  const next = [...posts, ...rest];
  if (same(next, ev.posts)) return { ev, addPois };
  const volunteers = linked.moved.size ? ev.volunteers.map((v) => (linked.moved.has(v.postId) ? { ...v, postId: linked.moved.get(v.postId)! } : v)) : ev.volunteers;
  return { ev: cleanAssignments({ ...ev, posts: next, volunteers }), addPois };
}

/** Postes proposés automatiquement pour une course : chaque proposition devient un POI du parcours (partagé) et un poste marqué « à vérifier ». Rien n'est dupliqué. */
export function proposeShared(ev: EventModel, race: Race, route: Pick<SavedRoute, "coords" | "pois">, newId: () => string): { pois: Poi[]; posts: Post[] } {
  const existing = postsOfRace(ev.posts, race.id); // postes communs compris : pas de ravitaillement proposé là où un poste commun existe déjà
  const props = proposePosts({ race, coords: route.coords, pois: route.pois, roads: ev.prep?.roads?.[race.id] ?? [], newId })
    .filter((p) => !isEndpoint(p.kind) && !p.poiId && KIND_TO_POI[p.kind])
    .filter((n) => !existing.some((p) => p.kind === n.kind && Math.abs(p.km - n.km) < 0.3));
  const pois: Poi[] = [], posts: Post[] = [];
  for (const p of props) {
    const poi: Poi = { id: newId(), type: KIND_TO_POI[p.kind]!, name: p.name, lng: p.lng!, lat: p.lat! };
    pois.push(poi);
    posts.push(clean({ ...p, id: poiPostId(race.id, poi.id), poiId: poi.id }));
  }
  return { pois, posts };
}

/**
 * Fusion à trois voies des POI d'un parcours ouvert dans l'éditeur pendant qu'ils changent ailleurs (logistique, autre onglet).
 * `base` : POI au chargement (ou au dernier enregistrement) ; `mine` : ceux de l'éditeur ; `theirs` : ceux enregistrés maintenant.
 * Ce qui a changé d'un seul côté est repris ; si les deux côtés ont modifié le même point, l'éditeur l'emporte. Rien n'est perdu en silence.
 */
export function mergePois(base: Poi[], mine: Poi[], theirs: Poi[]): Poi[] {
  const B = new Map(base.map((p) => [p.id, p])), T = new Map(theirs.map((p) => [p.id, p])), M = new Map(mine.map((p) => [p.id, p]));
  const out: Poi[] = [];
  for (const m of mine) {
    const b = B.get(m.id), t = T.get(m.id);
    if (t) out.push(b && same(m, b) ? t : m); // modifié ailleurs seulement → version enregistrée
    else if (!b || !same(m, b)) out.push(m); // ajouté ici, ou supprimé ailleurs mais modifié ici → gardé
    // sinon : supprimé ailleurs, inchangé ici → retiré
  }
  for (const t of theirs) if (!M.has(t.id) && !B.has(t.id)) out.push(t); // ajouté ailleurs
  return out;
}

/**
 * POI communs : après l'enregistrement d'un parcours, ses POI communs sont recopiés (nom, type, position) dans les autres parcours qui les portent.
 * Renvoie les parcours à réécrire. Un POI retiré d'un parcours n'est pas propagé : c'est ce parcours qui quitte l'association.
 */
export function propagateCommon<R extends Pick<SavedRoute, "id" | "pois">>(saved: R, routes: R[]): R[] {
  const common = (saved.pois ?? []).filter((p) => p.common); if (!common.length) return [];
  const out: R[] = [];
  for (const r of routes) {
    if (r.id === saved.id) continue;
    let changed = false;
    const pois = (r.pois ?? []).map((q) => { const c = common.find((x) => x.id === q.id); if (!c || same(c, q)) return q; changed = true; return { ...c }; });
    if (changed) out.push({ ...r, pois });
  }
  return out;
}
/** Parcours (parmi `routes`) qui portent le POI `poiId`. */
export const routesWithPoi = <R extends Pick<SavedRoute, "id" | "pois">>(routes: R[], poiId: string) => routes.filter((r) => (r.pois ?? []).some((q) => q.id === poiId));
