import type { LL, Poi, Pt, Waypoint } from "./types";
import { simplifyIndices, simplifyTrack, type SimplifyLevel } from "./geo";

export interface EState { waypoints: Waypoint[]; segs: LL[][]; pois: Poi[] }
export type Router = (a: LL, b: LL) => Promise<LL[] | null>;
export const emptyState = (): EState => ({ waypoints: [], segs: [], pois: [] });

const ll = (w: { lng: number; lat: number }): LL => [w.lng, w.lat];

/**
 * Géométrie d'un segment : tracé sur chemins si demandé et possible, sinon ligne droite.
 * Le tracé calculé n'est PAS forcé à passer par le point cliqué : ses extrémités sont sur le chemin retrouvé,
 * et les points de passage sont ramenés dessus (sinon de faux raccords hors chemin apparaissent).
 */
async function segment(a: Waypoint, b: Waypoint, route: Router): Promise<{ line: LL[]; fallback: boolean; start?: LL; end?: LL }> {
  if (b.auto) {
    const r = await route(ll(a), ll(b));
    if (r && r.length >= 2) return { line: r, fallback: false, start: r[0], end: r[r.length - 1] };
    return { line: [ll(a), ll(b)], fallback: true };
  }
  return { line: [ll(a), ll(b)], fallback: false };
}
const snapTo = (w: Waypoint, p?: LL): Waypoint => (p ? { ...w, lng: p[0], lat: p[1] } : w);

export interface OpResult { state: EState; fallbacks: number }

export async function addWaypoint(s: EState, lng: number, lat: number, auto: boolean, route: Router): Promise<OpResult> {
  const w: Waypoint = { lng, lat, auto };
  if (!s.waypoints.length) return { state: { ...s, waypoints: [w], segs: [] }, fallbacks: 0 };
  const prev = s.waypoints[s.waypoints.length - 1];
  const seg = await segment(prev, w, route);
  const wps = s.waypoints.length === 1 ? [snapTo(prev, seg.start)] : s.waypoints; // premier point : ramené sur le chemin
  return { state: { ...s, waypoints: [...wps, snapTo(w, seg.end)], segs: [...s.segs, seg.line] }, fallbacks: +seg.fallback };
}

export async function moveWaypoint(s: EState, i: number, lng: number, lat: number, route: Router): Promise<OpResult> {
  const wps = s.waypoints.map((w, k) => (k === i ? { ...w, lng, lat } : w));
  const segs = [...s.segs]; let fb = 0;
  if (i > 0) { const r = await segment(wps[i - 1], wps[i], route); segs[i - 1] = r.line; wps[i] = snapTo(wps[i], r.end); fb += +r.fallback; }
  if (i < wps.length - 1) { const r = await segment(wps[i], wps[i + 1], route); segs[i] = r.line; fb += +r.fallback; }
  return { state: { ...s, waypoints: wps, segs }, fallbacks: fb };
}

export async function removeWaypoint(s: EState, i: number, route: Router): Promise<OpResult> {
  const n = s.waypoints.length;
  if (n <= 1) return { state: { ...s, waypoints: [], segs: [] }, fallbacks: 0 };
  const wps = s.waypoints.filter((_, k) => k !== i);
  if (i === 0) return { state: { ...s, waypoints: wps, segs: s.segs.slice(1) }, fallbacks: 0 };
  if (i === n - 1) return { state: { ...s, waypoints: wps, segs: s.segs.slice(0, -1) }, fallbacks: 0 };
  const r = await segment(wps[i - 1], wps[i], route);
  return { state: { ...s, waypoints: wps, segs: [...s.segs.slice(0, i - 1), r.line, ...s.segs.slice(i + 1)] }, fallbacks: +r.fallback };
}

/** Insère un waypoint sur un segment existant sans retracer : on coupe la géométrie au sommet v. */
export function insertOnSegment(s: EState, segIndex: number, v: number): EState {
  const seg = s.segs[segIndex];
  if (!seg || v <= 0 || v >= seg.length - 1) return s;
  const auto = s.waypoints[segIndex + 1].auto;
  const w: Waypoint = { lng: seg[v][0], lat: seg[v][1], auto };
  return {
    ...s,
    waypoints: [...s.waypoints.slice(0, segIndex + 1), w, ...s.waypoints.slice(segIndex + 1)],
    segs: [...s.segs.slice(0, segIndex), seg.slice(0, v + 1), seg.slice(v), ...s.segs.slice(segIndex + 1)],
  };
}

export function reverse(s: EState): EState {
  const n = s.waypoints.length;
  const old = s.waypoints;
  const waypoints = [...old].reverse().map((w, j) => ({ ...w, auto: j === 0 ? w.auto : old[n - j].auto }));
  return { ...s, waypoints, segs: [...s.segs].reverse().map((g) => [...g].reverse()) };
}

export const isClosed = (s: EState, tolDeg = 1e-5) => {
  const w = s.waypoints; if (w.length < 3) return false;
  return Math.abs(w[0].lng - w[w.length - 1].lng) < tolDeg && Math.abs(w[0].lat - w[w.length - 1].lat) < tolDeg;
};

export async function closeLoop(s: EState, auto: boolean, route: Router): Promise<OpResult> {
  if (s.waypoints.length < 2 || isClosed(s)) return { state: s, fallbacks: 0 };
  const f = s.waypoints[0];
  return addWaypoint(s, f.lng, f.lat, auto, route);
}

/** Change le point de départ d'une boucle : le waypoint k devient départ et arrivée. */
export function setStart(s: EState, k: number): EState {
  if (!isClosed(s) || k <= 0 || k >= s.waypoints.length - 1) return s;
  const n = s.waypoints.length - 1; // sans le doublon de fermeture
  const wps = s.waypoints.slice(0, n), segs = s.segs;
  const rotW = [...wps.slice(k), ...wps.slice(0, k)];
  const rotS = [...segs.slice(k), ...segs.slice(0, k)];
  return { ...s, waypoints: [...rotW, { ...rotW[0] }], segs: rotS };
}

/** Division au waypoint i : renvoie [début, fin]. Les POI sont répartis selon le côté le plus proche. */
export function splitAt(s: EState, i: number): [EState, EState] | null {
  if (i <= 0 || i >= s.waypoints.length - 1) return null;
  const a: EState = { waypoints: s.waypoints.slice(0, i + 1), segs: s.segs.slice(0, i), pois: [] };
  const b: EState = { waypoints: s.waypoints.slice(i), segs: s.segs.slice(i), pois: [] };
  const cut = s.waypoints[i];
  for (const p of s.pois) {
    const inA = nearestDist(a, p) <= nearestDist(b, p);
    (inA ? a : b).pois.push(p);
  }
  void cut;
  return [a, b];
}
function nearestDist(s: EState, p: { lng: number; lat: number }) {
  let m = Infinity;
  for (const g of s.segs) for (const q of g) m = Math.min(m, (q[0] - p.lng) ** 2 + (q[1] - p.lat) ** 2);
  return m;
}

/** Fusion : b est ajouté à la suite de a, relié par une ligne droite. */
export function merge(a: EState, b: EState): EState {
  if (!a.waypoints.length) return b;
  if (!b.waypoints.length) return a;
  const lastA = a.waypoints[a.waypoints.length - 1], firstB = b.waypoints[0];
  const same = Math.abs(lastA.lng - firstB.lng) < 1e-6 && Math.abs(lastA.lat - firstB.lat) < 1e-6;
  if (same) return { waypoints: [...a.waypoints, ...b.waypoints.slice(1)], segs: [...a.segs, ...b.segs], pois: [...a.pois, ...b.pois] };
  return { waypoints: [...a.waypoints, { ...firstB, auto: false }, ...b.waypoints.slice(1)], segs: [...a.segs, [ll(lastA), ll(firstB)], ...b.segs], pois: [...a.pois, ...b.pois] };
}

/** Trace complète : le premier point d'un segment n'est omis que s'il double la fin du précédent. */
export function trackLL(s: EState): LL[] {
  if (!s.waypoints.length) return [];
  if (!s.segs.length) return [ll(s.waypoints[0])];
  const out: LL[] = [];
  s.segs.forEach((g, i) => {
    const last = out[out.length - 1];
    const dup = i > 0 && last && Math.abs(last[0] - g[0][0]) < 1e-7 && Math.abs(last[1] - g[0][1]) < 1e-7;
    out.push(...(i === 0 || dup ? g.slice(i === 0 ? 0 : 1) : g));
  });
  return out;
}

/** Convertit une trace importée en waypoints éditables, en conservant la géométrie d'origine par segment. */
export function fromTrack(coords: Pt[], pois: Poi[], tolM = 12): EState {
  const idx = simplifyIndices(coords, tolM, 300);
  const waypoints: Waypoint[] = idx.map((i) => ({ lng: coords[i][0], lat: coords[i][1], auto: false }));
  const segs: LL[][] = [];
  for (let k = 0; k < idx.length - 1; k++) segs.push(coords.slice(idx[k], idx[k + 1] + 1).map((c) => [c[0], c[1]] as LL));
  return { waypoints, segs, pois };
}

export type Matcher = (line: LL[]) => Promise<LL[] | null>;

/** Aligne chaque segment sur les chemins ; un segment non alignable est conservé tel quel. Les points de passage ne bougent pas. */
export async function alignState(s: EState, match: Matcher, onProgress?: (done: number, total: number) => void): Promise<OpResult & { matched: number }> {
  const segs: LL[][] = []; let matched = 0, kept = 0;
  for (let i = 0; i < s.segs.length; i++) {
    const g = s.segs[i];
    const m = g.length >= 2 ? await match(g) : null;
    if (m && m.length >= 2) { segs.push([g[0], ...m.slice(1, -1), g[g.length - 1]]); matched++; } else { segs.push(g); kept++; }
    onProgress?.(i + 1, s.segs.length);
  }
  return { state: { ...s, segs }, fallbacks: kept, matched };
}

/** Découpe en plusieurs parties aux waypoints donnés (indices intermédiaires). Géométrie et points de passage conservés. */
export function splitMany(s: EState, indices: number[]): EState[] {
  const cuts = [...new Set(indices)].filter((i) => i > 0 && i < s.waypoints.length - 1).sort((a, b) => a - b);
  if (!cuts.length) return [s];
  const bounds = [0, ...cuts, s.waypoints.length - 1];
  const parts: EState[] = [];
  for (let k = 0; k < bounds.length - 1; k++) parts.push({ waypoints: s.waypoints.slice(bounds[k], bounds[k + 1] + 1), segs: s.segs.slice(bounds[k], bounds[k + 1]), pois: [] });
  for (const p of s.pois) {
    let best = 0, bd = Infinity;
    parts.forEach((part, i) => { const d = nearestDist(part, p); if (d < bd) { bd = d; best = i; } });
    parts[best].pois.push(p);
  }
  return parts;
}

export interface SimplifyReport { before: number; after: number; tolM: number; turns: number; maxDevM: number }
/**
 * Baguette magique : simplifie la trace complète (pas seulement les poignées d'édition).
 * Les points conservés deviennent des points de passage éditables ; les points redondants disparaissent.
 * L'altitude des points conservés est reprise (le D+/D− est à recalculer par l'éditeur).
 */
export function simplifyState(s: EState, level: SimplifyLevel = "auto"): { state: EState; report: SimplifyReport } | null {
  const full = trackLL(s);
  if (full.length < 3) return null;
  const r = simplifyTrack(full, level);
  if (r.indices.length >= full.length) return null;
  const pts = r.indices.map((i) => full[i]);
  const waypoints: Waypoint[] = pts.map((p) => ({ lng: p[0], lat: p[1], auto: false }));
  const segs: LL[][] = []; for (let k = 0; k < pts.length - 1; k++) segs.push([pts[k], pts[k + 1]]);
  return { state: { waypoints, segs, pois: s.pois }, report: { before: full.length, after: pts.length, tolM: r.tolM, turns: r.turns, maxDevM: r.maxDevM } };
}
