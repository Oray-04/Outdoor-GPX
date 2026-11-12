import type { LL, Pt } from "./types";
import { cumulative } from "./geo";
import { effortProfile } from "./events";
import { bearing, angleDiff } from "./geo";

/**
 * Météo le long d'un parcours (prévisions Open-Meteo) : température, pluie, vent, et surtout
 * la direction du vent par rapport au sens de déplacement (vent de face / de côté / dans le dos).
 */
export type WindClass = "face" | "dos" | "cote" | "calme";
export const WIND_LABEL: Record<WindClass, string> = { face: "Vent de face", dos: "Vent dans le dos", cote: "Vent de côté", calme: "Vent faible" };
export const WIND_COLOR: Record<WindClass, string> = { face: "#d4202a", dos: "#1e7a58", cote: "#3ba6c9", calme: "#9db0a7" };
/** En dessous de ce vent (km/h), la direction n'a pas d'effet sensible. */
export const CALM_KMH = 8;

export interface Sample { index: number; lng: number; lat: number; distM: number; effortFrac: number; bearing: number }

/** Points d'échantillonnage répartis sur la distance (départ et arrivée inclus), avec le cap de déplacement local. */
export function sampleRoute(coords: Pt[], n: number): Sample[] {
  if (coords.length < 2) return [];
  const cum = cumulative(coords), total = cum[cum.length - 1] || 1;
  const { e } = effortProfile(coords), eTotal = e[e.length - 1] || 1;
  const count = Math.max(2, n), out: Sample[] = [];
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    let i = 0; while (i < cum.length - 1 && cum[i] < target) i++;
    // cap sur une fenêtre d'environ 400 m autour du point
    let a = i, b = i;
    while (a > 0 && cum[i] - cum[a] < 200) a--;
    while (b < coords.length - 1 && cum[b] - cum[i] < 200) b++;
    if (a === b) { if (b < coords.length - 1) b++; else if (a > 0) a--; }
    out.push({ index: i, lng: coords[i][0], lat: coords[i][1], distM: cum[i], effortFrac: e[i] / eTotal, bearing: bearing(coords[a], coords[b]) });
  }
  return out;
}

/** Vent relatif : composante de face (positive = vent de face), composante latérale et catégorie. */
export function relativeWind(windFromDeg: number, speedKmh: number, travelBearing: number) {
  const rel = angleDiff(travelBearing, windFromDeg);           // 0 = le vent vient de devant
  const head = speedKmh * Math.cos((rel * Math.PI) / 180);     // > 0 : face
  const cross = speedKmh * Math.sin((rel * Math.PI) / 180);
  const cls: WindClass = speedKmh < CALM_KMH ? "calme" : Math.abs(rel) < 60 ? "face" : Math.abs(rel) > 120 ? "dos" : "cote";
  return { head, cross, rel, cls };
}

export interface Hourly { time: string[]; temperature_2m: number[]; precipitation: number[]; precipitation_probability: number[]; wind_speed_10m: number[]; wind_direction_10m: number[]; wind_gusts_10m: number[]; weather_code: number[] }
export interface Forecast { hourly: Hourly }
export interface Point { temp: number; precip: number; prob: number; wind: number; dir: number; gust: number; code: number }

/** Heure locale du lieu (« AAAA-MM-JJThh:mm ») → millisecondes comparables (le fuseau est ignoré : on compare des heures murales). */
export const wallMs = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN; };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => (a + angleDiff(a, b) * t + 360) % 360;

/** Valeurs prévues à l'instant `tMs` (heure murale), interpolées entre deux heures. */
export function atTime(h: Hourly, tMs: number): Point | null {
  const t = h.time.map(wallMs); if (!t.length) return null;
  if (tMs < t[0] - 3600e3 || tMs > t[t.length - 1] + 3600e3) return null;
  let i = 0; while (i < t.length - 1 && t[i + 1] <= tMs) i++;
  const j = Math.min(i + 1, t.length - 1), f = t[j] === t[i] ? 0 : Math.min(1, Math.max(0, (tMs - t[i]) / (t[j] - t[i])));
  const v = (arr: number[], d = 0) => lerp(arr[i] ?? d, arr[j] ?? d, f);
  return { temp: v(h.temperature_2m), precip: v(h.precipitation), prob: v(h.precipitation_probability), wind: v(h.wind_speed_10m), dir: lerpAngle(h.wind_direction_10m[i] ?? 0, h.wind_direction_10m[j] ?? 0, f), gust: v(h.wind_gusts_10m), code: h.weather_code[f < 0.5 ? i : j] ?? 0 };
}

export interface Evaluated extends Sample { timeMs: number; w: Point | null; head: number; cross: number; cls: WindClass }
export interface Segment { fromIdx: number; toIdx: number; distM: number; cls: WindClass; head: number }
export interface Exposure { facePct: number; dosPct: number; cotePct: number; calmePct: number; avgHead: number; maxGust: number; tempMin: number; tempMax: number; precipMm: number; precipProbMax: number; windAvg: number }

/** Évalue la météo vécue en chaque point selon l'heure de départ et la durée totale (répartition au prorata de l'effort). */
export function evaluate(samples: Sample[], forecasts: Forecast[], startMs: number, durationMin: number): { points: Evaluated[]; segments: Segment[]; exposure: Exposure } {
  const points: Evaluated[] = samples.map((s, i) => {
    const timeMs = startMs + s.effortFrac * durationMin * 60e3;
    const w = forecasts[i] ? atTime(forecasts[i].hourly, timeMs) : null;
    const r = w ? relativeWind(w.dir, w.wind, s.bearing) : { head: 0, cross: 0, cls: "calme" as WindClass };
    return { ...s, timeMs, w, head: r.head, cross: r.cross, cls: r.cls };
  });
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], distM = b.distM - a.distM;
    // vent moyen du tronçon (au milieu du déplacement) et cap du tronçon : plus fidèle que le cap d'un seul point
    const mid = a.w && b.w ? { dir: lerpAngle(a.w.dir, b.w.dir, 0.5), wind: (a.w.wind + b.w.wind) / 2 } : a.w ?? b.w;
    const brg = bearing([a.lng, a.lat], [b.lng, b.lat]);
    const r = mid ? relativeWind(mid.dir, mid.wind, brg) : { head: 0, cls: "calme" as WindClass };
    segments.push({ fromIdx: a.index, toIdx: b.index, distM, cls: r.cls, head: r.head });
  }
  const total = segments.reduce((s, x) => s + x.distM, 0) || 1;
  const share = (c: WindClass) => Math.round((100 * segments.filter((s) => s.cls === c).reduce((a, s) => a + s.distM, 0)) / total);
  const ws = points.map((p) => p.w).filter((w): w is Point => !!w);
  const exposure: Exposure = {
    facePct: share("face"), dosPct: share("dos"), cotePct: share("cote"), calmePct: share("calme"),
    avgHead: segments.reduce((a, s) => a + s.head * s.distM, 0) / total,
    maxGust: ws.length ? Math.max(...ws.map((w) => w.gust)) : 0, tempMin: ws.length ? Math.min(...ws.map((w) => w.temp)) : 0, tempMax: ws.length ? Math.max(...ws.map((w) => w.temp)) : 0,
    precipMm: ws.length ? ws.reduce((a, w) => a + w.precip, 0) / ws.length * (durationMin / 60) : 0, precipProbMax: ws.length ? Math.max(...ws.map((w) => w.prob)) : 0,
    windAvg: ws.length ? ws.reduce((a, w) => a + w.wind, 0) / ws.length : 0,
  };
  return { points, segments, exposure };
}

/** Note de confort d'un créneau (plus petit = meilleur) : pluie, vent de face, rafales, températures extrêmes. */
export function comfortScore(x: Exposure): number {
  return x.precipMm * 3 + x.facePct / 12 + Math.max(0, x.avgHead) / 4 + Math.max(0, x.maxGust - 40) / 8 + Math.max(0, 2 - x.tempMin) / 2 + Math.max(0, x.tempMax - 28) / 2;
}
/** Évalue chaque heure de départ d'une journée. */
export function startHourScores(samples: Sample[], forecasts: Forecast[], date: string, durationMin: number): { hour: number; score: number; exposure: Exposure }[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const start = wallMs(`${date}T${String(hour).padStart(2, "0")}:00`);
    const { exposure } = evaluate(samples, forecasts, start, durationMin);
    return { hour, score: comfortScore(exposure), exposure };
  });
}

/** Prévisions pour une liste de points (une seule requête). Fuseau horaire du lieu. */
export async function fetchForecasts(points: LL[], startDate: string, endDate: string, signal?: AbortSignal): Promise<Forecast[]> {
  const q = new URLSearchParams({ latitude: points.map((p) => p[1].toFixed(4)).join(","), longitude: points.map((p) => p[0].toFixed(4)).join(","),
    hourly: "temperature_2m,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code", wind_speed_unit: "kmh", timezone: "auto", start_date: startDate, end_date: endDate });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal });
  if (!r.ok) throw new Error(r.status === 400 ? "Date hors de la période de prévision (16 jours)." : `Service météo indisponible (${r.status}).`);
  const j = await r.json();
  return (Array.isArray(j) ? j : [j]) as Forecast[];
}

export const addDays = (date: string, n: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const WMO: Record<number, string> = { 0: "Ciel dégagé", 1: "Peu nuageux", 2: "Partiellement nuageux", 3: "Couvert", 45: "Brouillard", 48: "Brouillard givrant", 51: "Bruine légère", 53: "Bruine", 55: "Bruine forte", 56: "Bruine verglaçante", 57: "Bruine verglaçante", 61: "Pluie faible", 63: "Pluie", 65: "Pluie forte", 66: "Pluie verglaçante", 67: "Pluie verglaçante", 71: "Neige faible", 73: "Neige", 75: "Neige forte", 77: "Grains de neige", 80: "Averses faibles", 81: "Averses", 82: "Averses violentes", 85: "Averses de neige", 86: "Averses de neige fortes", 95: "Orage", 96: "Orage et grêle", 99: "Orage violent et grêle" };
