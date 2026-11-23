import { POST_KINDS, postsOfRace, type EventModel, type PostKind } from "./events";
import { KIND_TO_POI } from "./poi-sync";
import type { Poi, PoiType } from "./types";

/**
 * Carte des coureurs : une vue publique simplifiée, INDÉPENDANTE de la préparation logistique.
 * La logistique garde tous ses postes (signaleurs, chronométrage, bénévoles…) ; ici on choisit seulement ce qui
 * est montré aux participants. Aucun poste n'est modifié ni supprimé par ces réglages.
 */
export interface PublicMapSettings {
  /** types de points montrés aux coureurs */
  kinds?: PostKind[];
  /** exceptions poste par poste : masqué malgré son type, ou montré malgré son type */
  hidden?: string[]; shown?: string[];
  /** carte importée par l'organisateur (image intégrée) et sa légende */
  image?: string; caption?: string;
  /** afficher aussi la carte interactive simplifiée de chaque course (par défaut : oui) */
  interactive?: boolean;
}
/** Point publié : uniquement ce qui sert aux coureurs (pas d'effectifs, de bénévoles ni de consignes internes). */
export interface PublicPoint { id: string; raceId: string; kind: PostKind; name: string; km: number; lng: number; lat: number; cutoffH?: number }
export interface RunnerMap { points: PublicPoint[]; image?: string; caption?: string; interactive: boolean }

/** Utiles aux participants : montrés par défaut. */
export const PUBLIC_KINDS: PostKind[] = ["ravito", "eau", "secours", "parking", "vue"];
/** Organisation interne : masqués par défaut (le passage peut être forcé poste par poste). */
export const INTERNAL_KINDS: PostKind[] = ["signaleur", "controle"];
/** Types réglables (départ et arrivée sont toujours montrés par les drapeaux du tracé). */
export const SETTABLE_KINDS: PostKind[] = (Object.keys(POST_KINDS) as PostKind[]).filter((k) => k !== "depart" && k !== "arrivee");
export const kindsOf = (s?: PublicMapSettings): PostKind[] => (s?.kinds ?? PUBLIC_KINDS).filter((k) => SETTABLE_KINDS.includes(k));

export function isPublic(p: { id: string; kind: PostKind }, s?: PublicMapSettings): boolean {
  if (p.kind === "depart" || p.kind === "arrivee") return false; // drapeaux du tracé
  if (s?.hidden?.includes(p.id)) return false;
  if (s?.shown?.includes(p.id)) return true;
  return kindsOf(s).includes(p.kind);
}
/** Bascule un poste (exception à la règle de son type) ; renvoie de nouveaux réglages. */
export function togglePost(s: PublicMapSettings | undefined, p: { id: string; kind: PostKind }): PublicMapSettings {
  const cur = s ?? {}, byKind = kindsOf(cur).includes(p.kind), visible = isPublic(p, cur);
  const hidden = (cur.hidden ?? []).filter((x) => x !== p.id), shown = (cur.shown ?? []).filter((x) => x !== p.id);
  if (visible) { if (byKind) hidden.push(p.id); } else if (!byKind) shown.push(p.id);
  return { ...cur, hidden, shown };
}
export function toggleKind(s: PublicMapSettings | undefined, k: PostKind): PublicMapSettings {
  const ks = kindsOf(s); return { ...(s ?? {}), kinds: ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k] };
}

const POI_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_POI).map(([k, v]) => [v, k])) as Record<PoiType, PostKind>;

/**
 * Points publics d'un événement, course par course. Source : les postes de la logistique ; pour une course sans aucun
 * poste, les points du parcours (même règle de types). Lecture seule : rien n'est écrit dans l'événement.
 */
export function publicPoints(ev: Pick<EventModel, "races" | "posts" | "publicMap">, routePois: (routeId?: string) => Poi[] = () => []): PublicPoint[] {
  const s = ev.publicMap, out: PublicPoint[] = [];
  for (const r of ev.races) {
    const posts = postsOfRace(ev.posts, r.id);
    if (posts.length) for (const p of posts) { if (p.lng == null || p.lat == null || !isPublic(p, s)) continue; out.push({ id: p.id, raceId: r.id, kind: p.kind, name: p.name, km: Math.round(p.km * 10) / 10, lng: p.lng, lat: p.lat, ...(p.cutoffH != null ? { cutoffH: p.cutoffH } : {}) }); }
    else for (const q of routePois(r.routeId)) { const kind = POI_TO_KIND[q.type]; if (kind && isPublic({ id: q.id, kind }, s)) out.push({ id: q.id, raceId: r.id, kind, name: q.name, km: 0, lng: q.lng, lat: q.lat }); }
  }
  return out;
}

/** Ce que voient les coureurs : calculé ici pour vos événements, reçu tel quel (déjà filtré) pour ceux des autres. */
export function runnerMap(ev: EventModel, routePois?: (routeId?: string) => Poi[]): RunnerMap {
  if (ev.origin === "community") return ev.runnerMap ?? { points: [], interactive: true };
  const s = ev.publicMap;
  return { points: publicPoints(ev, routePois), image: s?.image, caption: s?.caption, interactive: s?.interactive !== false };
}
/** Points d'une course, au format des marqueurs de carte. */
export const poisOf = (m: RunnerMap, raceId: string): Poi[] => m.points.filter((p) => p.raceId === raceId).map((p) => ({ id: p.id, type: KIND_TO_POI[p.kind] ?? "vue", name: p.name, lng: p.lng, lat: p.lat }));

// ── Nettoyage d'une carte reçue de la base publique ──
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_MAP_IMAGE_CHARS = 1_200_000;
export function normalizeRunnerMap(raw: unknown): RunnerMap | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<RunnerMap>, kinds = new Set<PostKind>(SETTABLE_KINDS);
  const points = (Array.isArray(r.points) ? r.points : []).slice(0, 500).filter((p): p is PublicPoint => !!p && typeof p === "object" && kinds.has(p.kind) && Number.isFinite(p.lng) && Number.isFinite(p.lat) && typeof p.raceId === "string")
    .map((p) => ({ id: String(p.id).slice(0, 60), raceId: p.raceId.slice(0, 60), kind: p.kind, name: String(p.name ?? "").slice(0, 120), km: Number.isFinite(p.km) ? p.km : 0, lng: p.lng, lat: p.lat, ...(Number.isFinite(p.cutoffH) ? { cutoffH: p.cutoffH } : {}) }));
  return { points, ...(typeof r.image === "string" && r.image.length <= MAX_MAP_IMAGE_CHARS && IMG.test(r.image) ? { image: r.image } : {}), ...(typeof r.caption === "string" ? { caption: r.caption.slice(0, 300) } : {}), interactive: r.interactive !== false };
}
