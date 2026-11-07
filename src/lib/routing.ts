import type { LL } from "./types";
import type { Sport } from "./sports";
import { haversine, inFrance, thin } from "./geo";
import { routeOnPaths } from "./ign";

/**
 * Moteur de tracé multi-sources.
 * Le calcul ne dépend pas du fond de carte affiché : il interroge
 *  - « ign » : graphe BD TOPO de l'IGN (France, piéton) ;
 *  - « osm » : graphe OpenStreetMap via un serveur Valhalla public (monde, piéton ou vélo).
 * En mode « auto », les deux sont interrogés et le résultat le plus direct est retenu :
 * un chemin absent d'une source est ainsi retrouvé dans l'autre.
 */
export type Profile = "foot" | "trail" | "mtb" | "gravel" | "road";
export type Engine = "auto" | "ign" | "osm";
export type Source = "ign" | "osm";

export const ENGINE_LABEL: Record<Engine, string> = { auto: "Automatique (IGN + OpenStreetMap)", ign: "IGN (BD TOPO)", osm: "OpenStreetMap" };
export const SOURCE_LABEL: Record<Source, string> = { ign: "IGN", osm: "OpenStreetMap" };

export const profileForSport = (s: Sport): Profile => ({ trail: "trail", course: "foot", rando: "trail", marche: "foot", vtt: "mtb", gravel: "gravel", velo: "road" } as const)[s];

const VALHALLA = "https://valhalla1.openstreetmap.de";

/** Réglages vérifiés sur le service : `max_hiking_difficulty` vaut 1 par défaut, ce qui exclut les sentiers de montagne. */
export const COSTING: Record<Profile, { costing: "pedestrian" | "bicycle"; options: Record<string, number | string | boolean> }> = {
  foot: { costing: "pedestrian", options: { use_tracks: 0.8, max_hiking_difficulty: 3, sidewalk_factor: 2 } },
  trail: { costing: "pedestrian", options: { use_tracks: 1.0, max_hiking_difficulty: 4, sidewalk_factor: 3, use_living_streets: 0.2 } },
  mtb: { costing: "bicycle", options: { bicycle_type: "Mountain", use_roads: 0.0, use_hills: 0.4, avoid_bad_surfaces: 0.0 } },
  gravel: { costing: "bicycle", options: { bicycle_type: "Cross", use_roads: 0.2, avoid_bad_surfaces: 0.3 } },
  road: { costing: "bicycle", options: { bicycle_type: "Road", use_roads: 0.8, avoid_bad_surfaces: 0.9 } },
};

/** Décodage d'une polyligne encodée (Valhalla : précision 6). */
export function decodePolyline(str: string, precision = 6): LL[] {
  const out: LL[] = []; let i = 0, lat = 0, lng = 0; const f = 10 ** precision;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 31) << shift; shift += 5; } while (b >= 32);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d; else lng += d;
    }
    out.push([lng / f, lat / f]);
  }
  return out;
}

export const lineLength = (l: LL[]) => { let d = 0; for (let i = 1; i < l.length; i++) d += haversine(l[i - 1], l[i]); return d; };

// ── Accès réseau poli : 3 requêtes simultanées au plus, une nouvelle tentative sur erreur serveur ──
let inflight = 0; const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= 3) await new Promise<void>((r) => waiting.push(r));
  inflight++;
  try { return await fn(); } finally { inflight--; waiting.shift()?.(); }
}
/** Échec du service de calcul d'itinéraires (≠ « aucun chemin ») : limite de requêtes, erreur serveur ou service injoignable. */
export class RoutingError extends Error {
  constructor(public kind: "rate" | "server" | "network", public status?: number) { super(`Routage ${kind}${status ? ` (${status})` : ""}`); }
}
async function postJson<T>(path: string, body: unknown, signal?: AbortSignal, strict = false): Promise<T | null> {
  let fail: RoutingError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 25000);
    const onAbort = () => ctrl.abort(); signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const r = await slot(() => fetch(VALHALLA + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal }));
      if (r.ok) return (await r.json()) as T;
      if (r.status === 429 || r.status >= 500) { fail = new RoutingError(r.status === 429 ? "rate" : "server", r.status); }
      else return null; // 400 : aucun chemin / aucun tronçon proche (ce n'est pas une panne)
    } catch (e) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      fail = new RoutingError("network");
    } finally { clearTimeout(t); signal?.removeEventListener("abort", onAbort); }
    if (attempt < 2) await new Promise((ok) => setTimeout(ok, 900 * (attempt + 1) + Math.random() * 300));
  }
  if (strict && fail) throw fail;
  return null;
}

const cache = new Map<string, Promise<LL[] | null>>();
const k5 = (p: LL) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

interface Trip { trip: { legs: { shape: string }[] } }
const loc = (p: LL, radius?: number) => ({ lat: p[1], lon: p[0], ...(radius ? { radius } : {}) });

async function osmRoute(a: LL, b: LL, profile: Profile, radius: number | undefined, signal?: AbortSignal): Promise<LL[] | null> {
  const key = `osm|${profile}|${radius ?? 0}|${k5(a)}>${k5(b)}`;
  let p = cache.get(key);
  if (!p) {
    const c = COSTING[profile];
    p = postJson<Trip>("/route", { locations: [loc(a, radius), loc(b, radius)], costing: c.costing, costing_options: { [c.costing]: c.options }, directions_type: "none" }, signal)
      .then((d) => { const l = d?.trip.legs.flatMap((g) => decodePolyline(g.shape)); return l && l.length > 1 ? l : null; });
    cache.set(key, p);
    p.then((r) => { if (!r) cache.delete(key); }, () => cache.delete(key));
  }
  return p;
}

export interface SegmentResult { line: LL[]; source: Source; lengthM: number }

/** Choisit le meilleur résultat parmi les sources : à égalité (±3 %), OpenStreetMap, plus complet sur les sentiers. */
export function pickBest(ign: LL[] | null, osm: LL[] | null): { line: LL[]; source: Source } | null {
  if (ign && !osm) return { line: ign, source: "ign" };
  if (osm && !ign) return { line: osm, source: "osm" };
  if (!ign || !osm) return null;
  return lineLength(ign) < lineLength(osm) * 0.97 ? { line: ign, source: "ign" } : { line: osm, source: "osm" };
}

export async function routeSegment(a: LL, b: LL, opts: { engine: Engine; profile: Profile; signal?: AbortSignal }): Promise<SegmentResult | null> {
  const { engine, profile, signal } = opts;
  const canIgn = (engine === "auto" || engine === "ign") && (profile === "foot" || profile === "trail") && inFrance(a[0], a[1]) && inFrance(b[0], b[1]);
  const canOsm = engine === "auto" || engine === "osm" || (engine === "ign" && !canIgn);
  const [ign, osm] = await Promise.all([canIgn ? routeOnPaths(a, b, signal) : null, canOsm ? osmRoute(a, b, profile, undefined, signal) : null]);
  let best = pickBest(ign, osm);
  if (!best && canOsm) { // dernier recours : accrochage élargi (le point cliqué est un peu loin d'un chemin)
    const wide = await osmRoute(a, b, profile, 250, signal);
    if (wide) best = { line: wide, source: "osm" };
  }
  if (!best) return null;
  return { line: best.line, source: best.source, lengthM: lineLength(best.line) };
}

/** Adaptateur pour l'éditeur (`Router`). `onSource` reçoit la source retenue pour chaque tronçon. */
export function makeRouter(opts: { engine: Engine; profile: Profile; onSource?: (s: Source) => void }) {
  return async (a: LL, b: LL): Promise<LL[] | null> => {
    const r = await routeSegment(a, b, opts);
    if (r) opts.onSource?.(r.source);
    return r ? r.line : null;
  };
}

// ── Alignement d'une trace sur les chemins (map-matching) ──
/** Découpe en fenêtres de `size` points consécutives (le dernier point d'une fenêtre est le premier de la suivante). */
export function chunkLine<T>(pts: T[], size: number): T[][] {
  if (pts.length <= size) return [pts];
  const out: T[][] = [];
  for (let i = 0; i < pts.length - 1; i += size - 1) out.push(pts.slice(i, Math.min(pts.length, i + size)));
  return out;
}

async function matchChunk(chunk: LL[], profile: Profile, signal?: AbortSignal): Promise<LL[] | null> {
  const c = COSTING[profile];
  // 1re tentative stricte, 2e plus tolérante (tracé dessiné à la main, GPS imprécis)
  for (const t of [{ search_radius: 50, gps_accuracy: 25 }, { search_radius: 100, gps_accuracy: 60 }]) {
    const d = await postJson<Trip>("/trace_route", {
      shape: chunk.map((p) => ({ lat: p[1], lon: p[0] })), costing: c.costing, costing_options: { [c.costing]: c.options },
      shape_match: "map_snap", directions_type: "none", trace_options: { ...t, breakage_distance: 2000 },
    }, signal);
    const l = d?.trip.legs.flatMap((g) => decodePolyline(g.shape));
    if (!l || l.length < 2) continue;
    const ratio = lineLength(l) / Math.max(1, lineLength(chunk));
    if (ratio > 0.6 && ratio < 1.8) return l; // écarte les alignements partiels et les détours absurdes
  }
  return null;
}

export interface SnapResult { line: LL[]; matched: number; kept: number }

/** Aligne une ligne sur les chemins ; toute portion non alignable est conservée telle quelle (jamais d'interruption). */
export async function snapToPaths(line: LL[], profile: Profile, opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<SnapResult> {
  if (line.length < 2) return { line, matched: 0, kept: 0 };
  const pts = thin(line, 12);
  const chunks = chunkLine(pts, 120);
  const out: LL[] = []; let matched = 0, kept = 0;
  for (let i = 0; i < chunks.length; i++) {
    const m = await matchChunk(chunks[i], profile, opts.signal);
    const part = m ?? chunks[i];
    if (m) matched++; else kept++;
    out.push(...(out.length ? part.slice(1) : part));
    opts.onProgress?.(i + 1, chunks.length);
  }
  out[0] = line[0]; out[out.length - 1] = line[line.length - 1]; // extrémités inchangées (points de passage)
  return { line: out, matched, kept };
}

/** Part du parcours hors routes (chemins, sentiers, pistes), mesurée sur le graphe OpenStreetMap. */
export async function surfaceShare(line: LL[], profile: Profile, signal?: AbortSignal): Promise<{ offRoadPct: number; pathPct: number } | null> {
  const c = COSTING[profile];
  const pts = thin(line, Math.max(12, lineLength(line) / 400)).map((p) => ({ lat: p[1], lon: p[0] }));
  const d = await postJson<{ edges?: { use?: string; length?: number }[] }>("/trace_attributes", {
    shape: pts, costing: c.costing, costing_options: { [c.costing]: c.options }, shape_match: "map_snap",
    filters: { attributes: ["edge.use", "edge.length"], action: "include" },
  }, signal);
  const edges = d?.edges; if (!edges?.length) return null;
  const tot = edges.reduce((s, e) => s + (e.length ?? 0), 0); if (!tot) return null;
  const sum = (uses: string[]) => edges.filter((e) => uses.includes(e.use ?? "")).reduce((s, e) => s + (e.length ?? 0), 0);
  return { offRoadPct: Math.round((100 * sum(["path", "footway", "track", "steps", "bridleway", "mountain_bike", "cycleway", "pedestrian"])) / tot), pathPct: Math.round((100 * sum(["path", "footway", "steps", "bridleway", "mountain_bike"])) / tot) };
}

/** Itinéraire passant par plusieurs points (une seule requête, demi-tours autorisés à chaque étape). */
export async function routeVia(points: LL[], profile: Profile, signal?: AbortSignal): Promise<LL[] | null> {
  const c = COSTING[profile];
  const d = await postJson<Trip>("/route", { locations: points.map((p) => loc(p)), costing: c.costing, costing_options: { [c.costing]: c.options }, directions_type: "none" }, signal, true);
  const l = d?.trip.legs.flatMap((g, i) => { const x = decodePolyline(g.shape); return i ? x.slice(1) : x; });
  return l && l.length > 1 ? l : null;
}
