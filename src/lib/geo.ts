export type LngLatEle = [lng: number, lat: number, ele: number];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance orthodromique (haversine) en mètres. */
export function haversine(a: readonly number[], b: readonly number[]): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface TrackStats {
  distanceM: number;
  gainM: number;
  lossM: number;
  minEle: number;
  maxEle: number;
}

/** Statistiques d'une trace. Le seuil de 1 m évite de cumuler le bruit d'altitude. */
export function trackStats(coords: LngLatEle[], threshold = 1): TrackStats {
  let distanceM = 0, gainM = 0, lossM = 0;
  let minEle = Infinity, maxEle = -Infinity;
  let ref = coords[0]?.[2] ?? 0;
  for (let i = 0; i < coords.length; i++) {
    const ele = coords[i][2];
    minEle = Math.min(minEle, ele);
    maxEle = Math.max(maxEle, ele);
    if (i > 0) distanceM += haversine(coords[i - 1], coords[i]);
    const d = ele - ref;
    if (Math.abs(d) >= threshold) {
      if (d > 0) gainM += d; else lossM -= d;
      ref = ele;
    }
  }
  return { distanceM, gainM, lossM, minEle, maxEle };
}

export const fmtKm = (m: number) => `${(m / 1000).toFixed(m >= 100000 ? 0 : 1).replace(".", ",")} km`;
export const fmtM = (m: number) => `${Math.round(m).toLocaleString("fr-FR")} m`;
export function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

/** Distances cumulées (m) le long d'une trace. */
export function cumulative(coords: readonly (readonly number[])[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversine(coords[i - 1], coords[i]));
  return out;
}

/** Insère des points pour que l'espacement ne dépasse jamais maxM (interpolation linéaire). */
export function densify(line: [number, number][], maxM: number): [number, number][] {
  if (line.length < 2) return line;
  const out: [number, number][] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const n = Math.ceil(haversine(a, b) / maxM);
    for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    out.push(b);
  }
  return out;
}

/** Ne garde qu'un point tous les minM mètres (premier et dernier conservés). */
export function thin<T extends readonly number[]>(pts: T[], minM: number): T[] {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let last = pts[0];
  for (let i = 1; i < pts.length - 1; i++) if (haversine(last, pts[i]) >= minM) { out.push(pts[i]); last = pts[i]; }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Douglas-Peucker : indices des points conservés (tolérance en mètres, approximation plane). */
export function simplifyIndices(pts: readonly (readonly number[])[], tolM: number, maxPoints = 400): number[] {
  const n = pts.length;
  if (n <= 2) return pts.map((_, i) => i);
  const lat0 = pts[0][1];
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
  const X = pts.map((p) => p[0] * kx), Y = pts.map((p) => p[1] * ky);
  const dist = (i: number, a: number, b: number) => {
    const dx = X[b] - X[a], dy = Y[b] - Y[a];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((X[i] - X[a]) * dx + (Y[i] - Y[a]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(X[i] - (X[a] + t * dx), Y[i] - (Y[a] + t * dy));
  };
  const run = (tol: number) => {
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const stack: [number, number][] = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      let m = -1, md = 0;
      for (let i = a + 1; i < b; i++) { const d = dist(i, a, b); if (d > md) { md = d; m = i; } }
      if (m >= 0 && md > tol) { keep[m] = 1; stack.push([a, m], [m, b]); }
    }
    const idx: number[] = []; keep.forEach((k, i) => k && idx.push(i));
    return idx;
  };
  let tol = tolM, idx = run(tol);
  while (idx.length > maxPoints && tol < 5000) { tol *= 1.6; idx = run(tol); }
  return idx;
}

export const bboxOf = (pts: readonly (readonly number[])[]): [number, number, number, number] => {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of pts) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
  return [w, s, e, n];
};

/** Emprise approximative de la France métropolitaine (Corse incluse). Exclut les territoires d'outre-mer ; déborde légèrement sur les pays voisins. */
export const FRANCE_BBOX: [number, number, number, number] = [-5.5, 41.2, 9.8, 51.2];
export const inFrance = (lng: number, lat: number) => lng >= FRANCE_BBOX[0] && lng <= FRANCE_BBOX[2] && lat >= FRANCE_BBOX[1] && lat <= FRANCE_BBOX[3];

export type SimplifyLevel = "auto" | "light" | "balanced" | "strong";
export interface SimplifyResult { indices: number[]; tolM: number; turns: number; maxDevM: number }

/** Plus grande distance (m) entre les points d'origine et la polyligne simplifiée (qualité de l'approximation). */
export function maxDeviation(pts: readonly (readonly number[])[], idx: number[]): number {
  if (pts.length < 3 || idx.length < 2) return 0;
  const kx = 111320 * Math.cos((pts[0][1] * Math.PI) / 180), ky = 110574;
  let worst = 0;
  for (let s = 0; s < idx.length - 1; s++) {
    const a = idx[s], b = idx[s + 1];
    const ax = pts[a][0] * kx, ay = pts[a][1] * ky, dx = pts[b][0] * kx - ax, dy = pts[b][1] * ky - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * kx - ax, py = pts[i][1] * ky - ay;
      const t = l2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0;
      worst = Math.max(worst, Math.hypot(px - t * dx, py - t * dy));
    }
  }
  return worst;
}

const bearingRad = (a: readonly number[], b: readonly number[]) => Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]);

/**
 * Simplification adaptative d'une trace GPS : retire les points redondants ou trop proches tout en gardant la forme.
 * - la tolérance s'adapte à la sinuosité (parcours tortueux/technique → tolérance serrée, ligne droite → plus large) ;
 * - les virages marqués (changement de cap > 45° sur ~±25 m) et les demi-tours sont toujours conservés ;
 * - premier et dernier points inchangés. L'écart maximal réel est mesuré et renvoyé.
 */
export function simplifyTrack(pts: readonly (readonly number[])[], level: SimplifyLevel = "auto"): SimplifyResult {
  const n = pts.length;
  if (n <= 2) return { indices: pts.map((_, i) => i), tolM: 0, turns: 0, maxDevM: 0 };
  const cum = cumulative(pts as [number, number][]);
  const total = cum[n - 1];
  const bb = bboxOf(pts);
  const diag = Math.max(1, haversine([bb[0], bb[1]], [bb[2], bb[3]]));
  const sinuosity = total / diag;
  let tol: number;
  if (level === "light") tol = 3; else if (level === "balanced") tol = 6; else if (level === "strong") tol = 12;
  else tol = sinuosity > 3 ? 3 : sinuosity > 1.8 ? 5 : 8; // virages serrés/technique → fidélité maximale
  // Virages à conserver : cap moyen avant (25 m) vs après (25 m)
  const forced = new Set<number>();
  const WIN = 25;
  for (let i = 1; i < n - 1; i++) {
    let a = i - 1; while (a > 0 && cum[i] - cum[a] < WIN) a--;
    let b = i + 1; while (b < n - 1 && cum[b] - cum[i] < WIN) b++;
    if (cum[i] - cum[a] < 5 || cum[b] - cum[i] < 5) continue; // points trop proches : du bruit, pas un virage
    let d = Math.abs(bearingRad(pts[i], pts[b]) - bearingRad(pts[a], pts[i]));
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > Math.PI / 4) forced.add(i);
  }
  // On ne garde que le sommet le plus marqué d'un même virage (évite 5 points pour un seul coude)
  const turns: number[] = [];
  const sorted = [...forced].sort((x, y) => x - y);
  let cluster: number[] = [];
  const flush = () => {
    if (!cluster.length) return;
    let best = cluster[0], bd = -1;
    for (const i of cluster) {
      let a = i - 1; while (a > 0 && cum[i] - cum[a] < WIN) a--;
      let b = i + 1; while (b < n - 1 && cum[b] - cum[i] < WIN) b++;
      let d = Math.abs(bearingRad(pts[i], pts[b]) - bearingRad(pts[a], pts[i])); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > bd) { bd = d; best = i; }
    }
    turns.push(best); cluster = [];
  };
  for (const i of sorted) { if (cluster.length && cum[i] - cum[cluster[cluster.length - 1]] > WIN) flush(); cluster.push(i); }
  flush();
  // Douglas-Peucker par tronçons délimités par les virages conservés
  const anchors = [0, ...turns, n - 1];
  const keep = new Set<number>(anchors);
  for (let k = 0; k < anchors.length - 1; k++) {
    const a = anchors[k], b = anchors[k + 1];
    if (b - a < 2) continue;
    const sub = pts.slice(a, b + 1);
    simplifyIndices(sub, tol, 100000).forEach((j) => keep.add(a + j));
  }
  let indices = [...keep].sort((x, y) => x - y);
  // Points trop proches (< 8 m) : on retire le point intermédiaire si l'écart reste sous la tolérance
  const out: number[] = [indices[0]];
  for (let k = 1; k < indices.length - 1; k++) {
    const i = indices[k];
    if (haversine(pts[out[out.length - 1]] as [number, number], pts[i] as [number, number]) < 8 && !turns.includes(i)) continue;
    out.push(i);
  }
  out.push(indices[indices.length - 1]);
  indices = out;
  return { indices, tolM: tol, turns: turns.length, maxDevM: maxDeviation(pts, indices) };
}

/**
 * Importance de chaque point (m) : écart qu'entraînerait sa suppression, selon la hiérarchie de Douglas-Peucker.
 * Les virages serrés, changements de direction et — si l'altitude est connue — ruptures de pente ont une importance élevée.
 * Les extrémités valent Infinity. La valeur d'un point ne dépasse jamais celle de son parent : garder les K plus importants donne un tracé cohérent.
 */
export function pointImportance(pts: readonly (readonly number[])[], zFactor = 3): number[] {
  const n = pts.length, imp = new Array<number>(n).fill(0);
  if (!n) return imp; imp[0] = imp[n - 1] = Infinity; if (n < 3) return imp;
  const kx = 111320 * Math.cos((pts[0][1] * Math.PI) / 180), ky = 110574;
  const hasZ = pts.every((p) => Number.isFinite(p[2]));
  const X = pts.map((p) => p[0] * kx), Y = pts.map((p) => p[1] * ky), Z = pts.map((p) => (hasZ ? p[2] * zFactor : 0));
  const stack: [number, number, number][] = [[0, n - 1, Infinity]];
  while (stack.length) {
    const [a, b, cap] = stack.pop()!; if (b - a < 2) continue;
    const dx = X[b] - X[a], dy = Y[b] - Y[a], dz = Z[b] - Z[a], l2 = dx * dx + dy * dy + dz * dz; let m = -1, md = -1;
    for (let i = a + 1; i < b; i++) {
      const px = X[i] - X[a], py = Y[i] - Y[a], pz = Z[i] - Z[a]; const t = l2 ? Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / l2)) : 0;
      const d = Math.hypot(px - t * dx, py - t * dy, pz - t * dz); if (d > md) { md = d; m = i; }
    }
    const v = Math.min(md, cap); imp[m] = v; stack.push([a, m, v], [m, b, v]);
  }
  return imp;
}

export interface RatioResult {
  indices: number[]; before: number; after: number;
  /** Pourcentage réellement supprimé et écart horizontal maximal mesuré (m). */
  removedPct: number; maxDevM: number;
  /** Plus grand pourcentage qui garde l'écart sous `limitM` ; `exceeded` si la demande le dépasse. */
  safePct: number; exceeded: boolean; limitM: number;
}
/**
 * Simplification par pourcentage de points à supprimer (0 à 90 %). Les points sont retirés du moins important au plus important ;
 * départ, arrivée et points `keep` (ex. points de passage placés à la main) sont toujours conservés.
 * Si l'écart au tracé d'origine dépasse `limitM`, le résultat le signale et indique le pourcentage maximal « sûr ».
 */
export function simplifyByRatio(pts: readonly (readonly number[])[], removePct: number, o: { keep?: number[]; limitM?: number } = {}): RatioResult {
  const n = pts.length, limitM = o.limitM ?? 15, pct = Math.max(0, Math.min(90, removePct));
  const all = pts.map((_, i) => i);
  if (n <= 2 || pct === 0) return { indices: all, before: n, after: n, removedPct: 0, maxDevM: 0, safePct: 0, exceeded: false, limitM };
  const imp = pointImportance(pts); for (const k of o.keep ?? []) if (k >= 0 && k < n) imp[k] = Infinity;
  const order = all.filter((i) => imp[i] !== Infinity).sort((a, b) => imp[a] - imp[b]); // du moins au plus important
  const forced = n - order.length;
  const pick = (p: number) => { const remove = Math.min(order.length, Math.round((n * p) / 100)); const drop = new Uint8Array(n); for (let k = 0; k < remove; k++) drop[order[k]] = 1; return all.filter((i) => !drop[i]); };
  const indices = pick(pct), maxDevM = maxDeviation(pts, indices);
  // pourcentage sûr : on peut retirer tous les points dont l'importance (écart 3D) est sous la limite ; vérifié sur l'écart horizontal mesuré
  let safe = Math.floor((order.filter((i) => imp[i] <= limitM).length / n) * 100);
  safe = Math.min(90, Math.max(0, safe)); while (safe > 0 && maxDeviation(pts, pick(safe)) > limitM) safe -= 1;
  return { indices, before: n, after: indices.length, removedPct: Math.round(((n - indices.length) / n) * 100), maxDevM, safePct: safe, exceeded: maxDevM > limitM && pct > safe, limitM: forced >= n ? 0 : limitM };
}

/** Cap (degrés, 0 = nord) de a vers b, et écart d'angle signé (-180..180). */
const deg = (r: number) => (r * 180) / Math.PI;
export function bearing(a: readonly number[], b: readonly number[]): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
/** Écart signé entre deux caps, dans ]-180, 180]. */
export const angleDiff = (from: number, to: number) => ((to - from + 540) % 360) - 180;

