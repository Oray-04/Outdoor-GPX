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
