import { haversine } from "./geo";
import { POST_KINDS, cleanAssignments, positionOnTrack, proposePosts, type EventModel, type Post, type PostKind, type Race } from "./events";
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

/**
 * Postes d'une course réalignés sur les POI de son parcours.
 * Renvoie les postes de la course et, s'il a fallu en créer (anciens postes saisis seulement dans la logistique), les POI à ajouter au parcours.
 */
export function syncRacePosts(racePosts: Post[], race: Race, route: Pick<SavedRoute, "coords" | "pois">): { posts: Post[]; addPois: Poi[] } {
  const coords = route.coords, pois = route.pois ?? [], byId = new Map(pois.map((p) => [p.id, p]));
  if (coords.length < 2) return { posts: racePosts, addPois: [] };
  const total = positionOnTrack(coords, coords[coords.length - 1][0], coords[coords.length - 1][1]).km;
  const addPois: Poi[] = [], linked = new Set<string>(), out: Post[] = [];
  const kmOf = (lng: number, lat: number) => { const q = positionOnTrack(coords, lng, lat); return { km: +q.km.toFixed(2), offTrackM: q.offTrackM > 15 ? Math.round(q.offTrackM) : undefined }; };
  const ends: Partial<Record<"depart" | "arrivee", boolean>> = {};

  for (const p0 of racePosts) {
    let p = p0;
    // 1. ancien poste saisi uniquement dans la logistique : rattaché au POI du même type déjà présent à moins de 60 m, sinon versé dans le parcours
    if (!p.poiId && !isEndpoint(p.kind)) {
      const type = KIND_TO_POI[p.kind];
      if (type) {
        let lng = p.lng, lat = p.lat;
        if (lng == null || lat == null) { const t = Math.max(0, Math.min(total, p.km)); let best = 0, bd = Infinity; for (let i = 0; i < coords.length; i++) { const d = Math.abs(positionOnTrackKm(coords, i) - t); if (d < bd) { bd = d; best = i; } } lng = coords[best][0]; lat = coords[best][1]; }
        const near = pois.concat(addPois).find((q) => q.type === type && !linked.has(q.id) && haversine([q.lng, q.lat], [lng!, lat!]) < 60);
        const poi = near ?? { id: `lp-${p.id}`, type, name: p.name || POST_KINDS[p.kind].label, lng: lng!, lat: lat! };
        if (!near && !byId.has(poi.id)) { addPois.push(poi); byId.set(poi.id, poi); }
        p = { ...p, poiId: poi.id };
      }
    }
    // 2. poste lié : nom, type et position repris du POI ; POI supprimé du parcours → poste retiré
    if (p.poiId) {
      const poi = byId.get(p.poiId);
      if (!poi || linked.has(poi.id)) continue; // supprimé dans le parcours, ou doublon
      linked.add(poi.id);
      const kind = POI_TO_KIND[poi.type] ?? p.kind, k = kmOf(poi.lng, poi.lat);
      out.push(clean({ ...p, kind, name: poi.name || POST_KINDS[kind].label, lng: poi.lng, lat: poi.lat, km: k.km, offTrackM: k.offTrackM }));
      continue;
    }
    // 3. départ / arrivée : extrémités du parcours, sauf déplacement manuel
    if (isEndpoint(p.kind)) {
      const k = p.kind as "depart" | "arrivee";
      if (ends[k]) { out.push(p); continue; } // poste supplémentaire du même type : laissé tel quel
      ends[k] = true;
      const c = k === "depart" ? coords[0] : coords[coords.length - 1];
      if (p.pinned && p.lng != null && p.lat != null) { const q = kmOf(p.lng, p.lat); out.push(clean({ ...p, km: q.km, offTrackM: q.offTrackM })); }
      else out.push(clean({ ...p, pinned: undefined, offTrackM: undefined, lng: c[0], lat: c[1], km: k === "depart" ? 0 : +total.toFixed(2) }));
      continue;
    }
    out.push(p); // type sans équivalent de POI (ne devrait pas arriver) : conservé
  }
  // 4. POI du parcours sans poste : poste créé (une seule saisie, faite dans le parcours)
  for (const poi of [...pois, ...addPois]) {
    if (linked.has(poi.id)) continue;
    const kind = POI_TO_KIND[poi.type]; if (!kind) continue;
    const k = kmOf(poi.lng, poi.lat);
    out.push(clean({ id: poiPostId(race.id, poi.id), raceId: race.id, kind, name: poi.name || POST_KINDS[kind].label, km: k.km, lng: poi.lng, lat: poi.lat, staffNeeded: STAFF_DEFAULT[kind], note: "", poiId: poi.id, offTrackM: k.offTrackM }));
    linked.add(poi.id);
  }
  // 5. départ et arrivée toujours présents, à la position du parcours de base
  for (const k of ["depart", "arrivee"] as const) if (!ends[k]) { const c = k === "depart" ? coords[0] : coords[coords.length - 1]; out.push({ id: endpointId(race.id, k), raceId: race.id, kind: k, name: POST_KINDS[k].label, km: k === "depart" ? 0 : +total.toFixed(2), lng: c[0], lat: c[1], staffNeeded: STAFF_DEFAULT[k], note: "" }); }
  out.sort((a, b) => a.km - b.km || (a.kind === "depart" ? -1 : b.kind === "depart" ? 1 : a.kind === "arrivee" ? 1 : b.kind === "arrivee" ? -1 : 0));
  return { posts: out, addPois };
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
  const addPois = new Map<string, Poi[]>(); let posts = ev.posts, changed = false;
  for (const race of ev.races) {
    const rt = race.routeId ? routes.find((r) => r.id === race.routeId) : undefined; if (!rt || rt.coords.length < 2) continue;
    const mine = posts.filter((p) => p.raceId === race.id);
    const res = syncRacePosts(mine, race, { coords: rt.coords, pois: [...(rt.pois ?? []), ...(addPois.get(rt.id) ?? [])] });
    if (res.addPois.length) addPois.set(rt.id, [...(addPois.get(rt.id) ?? []), ...res.addPois]);
    if (!same(res.posts, mine)) { posts = [...posts.filter((p) => p.raceId !== race.id), ...res.posts]; changed = true; }
  }
  if (!changed) return { ev, addPois };
  return { ev: cleanAssignments({ ...ev, posts }), addPois };
}

/** Postes proposés automatiquement pour une course : chaque proposition devient un POI du parcours (partagé) et un poste marqué « à vérifier ». Rien n'est dupliqué. */
export function proposeShared(ev: EventModel, race: Race, route: Pick<SavedRoute, "coords" | "pois">, newId: () => string): { pois: Poi[]; posts: Post[] } {
  const existing = ev.posts.filter((p) => p.raceId === race.id);
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
