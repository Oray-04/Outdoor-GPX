import { cumulative, haversine, type LngLatEle } from "./geo";

export interface ProfilePoint { d: number; ele: number; grade: number; lng: number; lat: number }

/** Lisse l'altitude (moyenne glissante) pour limiter le bruit des mesures. */
export function smooth(values: number[], radius = 2): number[] {
  return values.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) { s += values[k]; c++; }
    return s / c;
  });
}

/** Profil : distance, altitude lissée et pente (%) calculée sur une fenêtre d'environ windowM mètres. */
export function buildProfile(coords: LngLatEle[], windowM = 100): ProfilePoint[] {
  if (coords.length < 2) return coords.map((c) => ({ d: 0, ele: c[2], grade: 0, lng: c[0], lat: c[1] }));
  const d = cumulative(coords);
  const ele = smooth(coords.map((c) => c[2]));
  return coords.map((c, i) => {
    let a = i, b = i;
    while (a > 0 && d[i] - d[a] < windowM / 2) a--;
    while (b < coords.length - 1 && d[b] - d[i] < windowM / 2) b++;
    const run = d[b] - d[a];
    return { d: d[i], ele: ele[i], grade: run > 5 ? ((ele[b] - ele[a]) / run) * 100 : 0, lng: c[0], lat: c[1] };
  });
}

export function gradeColor(g: number): string {
  const a = Math.abs(g);
  if (g >= 0) return a < 3 ? "#4fb08f" : a < 8 ? "#d9b300" : a < 15 ? "#f0612b" : "#c8372d";
  return a < 3 ? "#7fb8d6" : a < 8 ? "#3ba6c9" : a < 15 ? "#247f9f" : "#17546b";
}

/** Distance (m) de la position d'une POI projetée sur la trace (point de trace le plus proche). */
export function distanceAlong(coords: LngLatEle[], cum: number[], p: { lng: number; lat: number }): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < coords.length; i++) { const h = haversine(coords[i], [p.lng, p.lat]); if (h < bd) { bd = h; best = i; } }
  return cum[best];
}

/** Distance entre une position et la trace (m) + index du point le plus proche. */
export function nearestOnTrack(coords: readonly (readonly number[])[], pos: [number, number]): { dist: number; index: number } {
  let bd = Infinity, bi = 0;
  for (let i = 0; i < coords.length; i++) { const h = haversine(coords[i], pos); if (h < bd) { bd = h; bi = i; } }
  return { dist: bd, index: bi };
}
