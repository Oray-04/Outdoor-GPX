import { cumulative, haversine } from "./geo";

type LL = readonly [number, number, ...number[]] | readonly number[];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Cap initial (0–360°, 0 = nord) de a vers b. */
export function bearing(a: LL, b: LL): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
/** Écart signé entre deux caps, dans ]-180, 180]. */
export const angleDiff = (from: number, to: number) => ((to - from + 540) % 360) - 180;

export interface NavState {
  index: number;         // point de la trace le plus proche
  offM: number;          // écart à la trace (m)
  alongM: number;        // distance parcourue sur la trace
  remainM: number;       // distance restante
  targetBearing: number; // cap vers le point situé ~40 m plus loin sur la trace
  hint: Hint;
}
export type Hint = "straight" | "slight-left" | "slight-right" | "left" | "right" | "u-turn";
export const HINT_LABEL: Record<Hint, string> = { straight: "Tout droit", "slight-left": "Légèrement à gauche", "slight-right": "Légèrement à droite", left: "À gauche", right: "À droite", "u-turn": "Faire demi-tour" };

/** `from` : index de départ de la recherche (suivi de progression pour éviter les sauts sur les boucles). */
export function navigate(route: readonly (readonly number[])[], cum: number[], pos: [number, number], from = 0, window = 300): NavState {
  const lo = Math.max(0, from - 20), hi = Math.min(route.length - 1, from + window);
  let bi = lo, bd = Infinity;
  for (let i = lo; i <= hi; i++) { const d = haversine(route[i], pos); if (d < bd) { bd = d; bi = i; } }
  // si on est très loin de la fenêtre, on cherche sur toute la trace
  if (bd > 150) for (let i = 0; i < route.length; i++) { const d = haversine(route[i], pos); if (d < bd) { bd = d; bi = i; } }
  const ahead = (m: number) => { let j = bi; while (j < route.length - 1 && cum[j] - cum[bi] < m) j++; return j; };
  const t1 = ahead(40), t2 = ahead(120);
  const target = bearing(pos, route[t1]);
  const turn = t2 > t1 ? angleDiff(bearing(route[bi], route[t1]), bearing(route[t1], route[t2])) : 0;
  const a = Math.abs(turn);
  const hint: Hint = a > 150 ? "u-turn" : a > 60 ? (turn < 0 ? "left" : "right") : a > 25 ? (turn < 0 ? "slight-left" : "slight-right") : "straight";
  return { index: bi, offM: bd, alongM: cum[bi], remainM: cum[route.length - 1] - cum[bi], targetBearing: target, hint };
}

/** Alerte de sortie de parcours : n relevés consécutifs au-delà du seuil (évite les faux positifs liés au bruit GPS). */
export class OffRouteDetector {
  private n = 0;
  constructor(private thresholdM = 40, private needed = 3) {}
  push(offM: number, accuracyM = 0): boolean {
    const eff = Math.max(this.thresholdM, accuracyM * 1.5);
    this.n = offM > eff ? this.n + 1 : 0;
    return this.n >= this.needed;
  }
  reset() { this.n = 0; }
}

export const cumOf = (route: readonly (readonly number[])[]) => cumulative(route);

export interface Fix { lng: number; lat: number; ele: number; t: number; acc: number }
/** Statistiques d'un enregistrement : relevés trop imprécis ignorés, D+ avec seuil. */
export function recordingStats(fixes: Fix[]) {
  let dist = 0, gain = 0, ref = fixes[0]?.ele ?? 0;
  for (let i = 1; i < fixes.length; i++) {
    dist += haversine([fixes[i - 1].lng, fixes[i - 1].lat], [fixes[i].lng, fixes[i].lat]);
    const d = fixes[i].ele - ref;
    if (Math.abs(d) >= 3) { if (d > 0) gain += d; ref = fixes[i].ele; }
  }
  const durationS = fixes.length > 1 ? (fixes[fixes.length - 1].t - fixes[0].t) / 1000 : 0;
  return { distM: dist, gainM: gain, durationS };
}
/** Accepte un relevé si assez précis et réellement déplacé (filtre le bruit à l'arrêt). */
export function acceptFix(prev: Fix | undefined, next: Fix, maxAccM = 40, minMoveM = 3): boolean {
  if (next.acc > maxAccM) return false;
  if (!prev) return true;
  return haversine([prev.lng, prev.lat], [next.lng, next.lat]) >= minMoveM;
}
