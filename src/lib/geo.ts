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
