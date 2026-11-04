import type { LL, Pt } from "./types";
import { trackStats } from "./geo";
import type { Profile } from "./routing";

/**
 * Génération automatique de boucles.
 * Principe : on place des points de passage sur un cercle passant par le départ, dans N directions ; le routeur
 * (qui privilégie chemins et sentiers selon la pratique) relie ces points ; le rayon est ajusté jusqu'à obtenir la
 * distance voulue ; le dénivelé est ensuite mesuré et les boucles sont classées selon leur écart aux cibles.
 */
export interface GenInput { start: LL; targetKm: number; targetGain: number | null; profile: Profile; count?: number; directions?: number }
export interface Proposal {
  id: string; bearing: number; line: LL[]; coords: Pt[];
  distanceM: number; gainM: number; lossM: number; overlapPct: number; offRoadPct?: number; pathPct?: number; score: number;
  /** D+ mesuré sur le tracé réellement généré, dans la marge acceptée autour de la cible (null = pas de cible). */
  gainOk: boolean | null;
}
/** Marge acceptée sur le dénivelé cible (±20 %). */
export const GAIN_TOLERANCE = 0.2;
export const gainWithinTolerance = (gainM: number, target: number | null, tol = GAIN_TOLERANCE) =>
  target == null ? null : target <= 0 ? gainM <= 100 : Math.abs(gainM - target) <= tol * target;
export interface GenDeps {
  /** Itinéraire passant par les points donnés, ou null s'il n'existe pas. */
  via(points: LL[], profile: Profile, signal?: AbortSignal): Promise<LL[] | null>;
  /** Ajoute l'altitude à chaque point. */
  elevate(line: LL[], signal?: AbortSignal): Promise<Pt[]>;
  /** Part de sentiers (facultatif). */
  surface?(line: LL[], profile: Profile, signal?: AbortSignal): Promise<{ offRoadPct: number; pathPct: number } | null>;
}
export interface Progress { phase: "tracé" | "altitudes" | "analyse"; done: number; total: number }

const R_EARTH = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;

/** Point situé à `distM` mètres de `p` dans la direction `bearingDeg` (0 = nord). */
export function destination(p: LL, bearingDeg: number, distM: number): LL {
  const b = rad(bearingDeg), la = rad(p[1]), lo = rad(p[0]), d = distM / R_EARTH;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
  return [deg(lo2), deg(la2)];
}

/** Facteur de détour initial : en terrain réel le réseau de chemins rallonge beaucoup le cercle idéal. */
export const DETOUR = 2.0;

/** Points de passage d'une boucle : cercle de rayon `radiusM` passant par `start`, centré dans la direction `theta`. */
export function loopWaypoints(start: LL, radiusM: number, theta: number, k = 3): LL[] {
  const c = destination(start, theta, radiusM);
  const pts: LL[] = [start];
  for (let j = 1; j <= k; j++) pts.push(destination(c, theta + 180 + (360 * j) / (k + 1), radiusM));
  pts.push(start);
  return pts;
}

/** Part du parcours qui repasse par des endroits déjà parcourus (retour par le même chemin). */
export function overlapRatio(line: LL[], cellM = 20): number {
  if (line.length < 4) return 0;
  const cell = cellM / 111320, key = (p: LL) => `${Math.round(p[0] / (cell / Math.cos(rad(p[1]))))},${Math.round(p[1] / cell)}`;
  const seen = new Set<string>(); let rep = 0; const n = line.length, skip = Math.floor(n * 0.03);
  for (let i = 0; i < n; i++) {
    const k = key(line[i]);
    let hit = false;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) { const [x, y] = k.split(",").map(Number); if (seen.has(`${x + dx},${y + dy}`)) hit = true; }
    if (hit && i > skip && i < n - skip) rep++;
    // on n'enregistre un point qu'après un petit décalage, pour ne pas compter le tracé contre lui-même
    if (i >= 3) seen.add(key(line[i - 3]));
  }
  return rep / n;
}

export const lineKm = (l: LL[]) => { let d = 0; for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i]; const dx = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2)), dy = rad(b[1] - a[1]); d += Math.hypot(dx, dy) * R_EARTH; } return d / 1000; };

/** Ajuste le rayon jusqu'à ce que la longueur soit dans `tol` de la cible. Renvoie le meilleur essai. */
export async function fitLoop(start: LL, theta: number, targetKm: number, profile: Profile, deps: GenDeps, opts: { tol?: number; maxIter?: number; signal?: AbortSignal } = {}): Promise<{ line: LL[]; km: number } | null> {
  const tol = opts.tol ?? 0.1, maxIter = opts.maxIter ?? 4;
  let radius = (targetKm * 1000) / (2 * Math.PI * DETOUR);
  let best: { line: LL[]; km: number } | null = null;
  for (let it = 0; it < maxIter; it++) {
    const line = await deps.via(loopWaypoints(start, radius, theta), profile, opts.signal);
    if (!line) { radius *= 0.7; continue; } // pas de chemin : on resserre la boucle
    const km = lineKm(line);
    if (!best || Math.abs(km - targetKm) < Math.abs(best.km - targetKm)) best = { line, km };
    if (Math.abs(km - targetKm) / targetKm <= tol) break;
    radius *= Math.min(1.6, Math.max(0.6, Math.pow(targetKm / km, 0.9))); // ajustement amorti
  }
  return best;
}

export function scoreProposal(p: { distanceM: number; gainM: number; overlapPct: number }, targetKm: number, targetGain: number | null): number {
  const distErr = Math.abs(p.distanceM / 1000 - targetKm) / targetKm;
  const gainErr = targetGain == null ? 0 : Math.abs(p.gainM - targetGain) / Math.max(targetGain, 150);
  return distErr + 0.7 * gainErr + 1.2 * (p.overlapPct / 100); // les vraies boucles passent devant les allers-retours
}

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** Garde les meilleures propositions en imposant des directions différentes. */
export function pickDistinct<T extends { bearing: number; score: number }>(sorted: T[], count: number, minSepDeg = 50): T[] {
  const out: T[] = [];
  for (const c of sorted) { if (out.length >= count) break; if (out.every((o) => angDiff(o.bearing, c.bearing) >= minSepDeg)) out.push(c); }
  for (const c of sorted) { if (out.length >= count) break; if (!out.includes(c)) out.push(c); } // complète si besoin
  return out.sort((a, b) => a.score - b.score);
}

export async function generateLoops(input: GenInput, deps: GenDeps, opts: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {}): Promise<Proposal[]> {
  const { start, targetKm, targetGain, profile } = input;
  const n = input.directions ?? 12, count = input.count ?? 4;
  const thetas = Array.from({ length: n }, (_, i) => (i * 360) / n);
  const fitted: { theta: number; line: LL[]; km: number }[] = [];
  let done = 0;
  // tracés : 2 boucles en parallèle (le serveur est public, on reste raisonnable)
  const queue = [...thetas];
  await Promise.all([0, 1].map(async () => {
    while (queue.length) {
      const theta = queue.shift()!;
      const r = await fitLoop(start, theta, targetKm, profile, deps, { signal: opts.signal });
      if (r && Math.abs(r.km - targetKm) / targetKm <= 0.25) fitted.push({ theta, ...r });
      opts.onProgress?.({ phase: "tracé", done: ++done, total: n });
    }
  }));
  // altitudes + score : le D+ est celui du tracé réellement généré (altitudes IGN, même calcul que partout sur le site)
  const scored: Proposal[] = []; let e = 0;
  const evaluate = async (f: { theta: number; line: LL[] }) => {
    const coords = await deps.elevate(f.line, opts.signal);
    const st = trackStats(coords, 3), ov = Math.round(overlapRatio(f.line) * 100);
    const base = { id: `g-${Math.round(f.theta)}`, bearing: f.theta, line: f.line, coords, distanceM: st.distanceM, gainM: st.gainM, lossM: st.lossM, overlapPct: ov };
    scored.push({ ...base, gainOk: gainWithinTolerance(st.gainM, targetGain), score: scoreProposal(base, targetKm, targetGain) });
    opts.onProgress?.({ phase: "altitudes", done: ++e, total: fitted.length });
  };
  for (const f of fitted) await evaluate(f);
  // Aucune boucle dans la marge : on explore d'autres directions, classées selon le relief estimé sur le cercle idéal
  // (altitudes du cercle, calibrées sur le rapport D+ réel / D+ estimé des boucles déjà tracées).
  if (targetGain != null && !scored.some((p) => p.gainOk)) {
    const tried = new Set(thetas);
    const extra = Array.from({ length: n }, (_, i) => (i * 360) / n + 180 / n).filter((t) => !tried.has(t));
    const radius = (targetKm * 1000) / (2 * Math.PI * DETOUR);
    const est = async (theta: number) => { const ring = loopWaypoints(start, radius, theta, 11); const c = await deps.elevate(ring, opts.signal).catch(() => null); return c ? trackStats(c, 3).gainM : 0; };
    const ratios: number[] = [];
    for (const p of scored.slice(0, 4)) { const g = await est(p.bearing); if (g > 5) ratios.push(p.gainM / g); }
    const ratio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;
    const ranked: { theta: number; err: number }[] = [];
    for (const t of extra) ranked.push({ theta: t, err: Math.abs((await est(t)) * ratio - targetGain) });
    ranked.sort((a, b) => a.err - b.err);
    const picks = ranked.slice(0, 4).map((r) => r.theta);
    for (const theta of picks) {
      const r = await fitLoop(start, theta, targetKm, profile, deps, { signal: opts.signal });
      if (r && Math.abs(r.km - targetKm) / targetKm <= 0.25) { fitted.push({ theta, ...r }); await evaluate({ theta, line: r.line }); }
    }
  }
  // les boucles dans la marge de D+ passent d'abord, puis le score
  scored.sort((a, b) => (Number(!!b.gainOk) - Number(!!a.gainOk)) || a.score - b.score);
  const top = pickDistinct(scored, count);
  top.sort((a, b) => (Number(!!b.gainOk) - Number(!!a.gainOk)) || a.score - b.score);
  if (deps.surface) {
    let s = 0;
    for (const p of top) { const r = await deps.surface(p.line, profile, opts.signal).catch(() => null); if (r) { p.offRoadPct = r.offRoadPct; p.pathPct = r.pathPct; } opts.onProgress?.({ phase: "analyse", done: ++s, total: top.length }); }
  }
  return top;
}
