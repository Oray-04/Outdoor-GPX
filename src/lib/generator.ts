import type { LL, Pt } from "./types";
import { trackStats } from "./geo";
import type { Profile } from "./routing";

/**
 * Génération automatique de boucles.
 * Principe : on place des points de passage sur un cercle passant par le départ, dans N directions ; le routeur
 * (qui privilégie chemins et sentiers selon la pratique) relie ces points ; le rayon est ajusté jusqu'à obtenir la
 * distance voulue ; le dénivelé est ensuite mesuré et les boucles sont classées selon leur écart aux cibles.
 */
/** `maximizeGain` : chercher, pour la distance demandée, les boucles au plus fort dénivelé positif (il n'y a plus de D+ cible). */
export interface GenInput { start: LL; targetKm: number; maximizeGain?: boolean; profile: Profile; count?: number; directions?: number }
export interface Proposal {
  id: string; bearing: number; line: LL[]; coords: Pt[];
  distanceM: number; gainM: number; lossM: number; overlapPct: number; offRoadPct?: number; pathPct?: number; score: number;
  /** Longueur d'allers-retours parasites retirée du tracé brut (m) ; les statistiques sont celles du tracé nettoyé. */
  cleanedM: number;
  /** Plus long saut entre deux points consécutifs (m), pour repérer un tracé incohérent. */
  maxStepM: number;
  /** Part de voies revêtues (%), si connue. */
  pavedPct?: number;
  /** Boucle rallongée (dans la limite de +10 %) parce que la version longue offre un D+ utile supérieur. */
  stretched?: boolean;
  /** Altitudes mesurées au pas large seulement (la mesure fine a échoué) : D+ moins précis. */
  coarse?: boolean;
}
export interface GenDeps {
  /** Itinéraire passant par les points donnés, ou null s'il n'existe pas. */
  via(points: LL[], profile: Profile, signal?: AbortSignal, avoid?: LL[]): Promise<LL[] | null>;
  /** Ajoute l'altitude à chaque point. */
  elevate(line: LL[], signal?: AbortSignal): Promise<Pt[]>;
  /** Altitudes à pas plus large, pour classer rapidement de longues boucles ; les propositions retenues sont toujours re-mesurées avec `elevate`. */
  elevateFast?(line: LL[], signal?: AbortSignal): Promise<Pt[]>;
  /** Part de sentiers (facultatif). */
  surface?(line: LL[], profile: Profile, signal?: AbortSignal): Promise<{ offRoadPct: number; pathPct: number; pavedPct?: number } | null>;
}
/** Cause précise d'un échec de génération (pour un message utile plutôt que générique). */
export class GenerationError extends Error {
  constructor(public kind: "routing" | "elevation", public detail: { status?: number; reason?: "rate" | "server" | "network" } = {}) { super(`Génération impossible : ${kind}`); }
}
export interface Progress { phase: "relief" | "tracé" | "altitudes" | "analyse"; done: number; total: number }

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

const distM = (a: LL, b: LL) => { const dx = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2)), dy = rad(b[1] - a[1]); return Math.hypot(dx, dy) * R_EARTH; };

/**
 * Supprime les allers-retours parasites : portions où le tracé part sur un chemin puis revient exactement par le même
 * (antenne en cul-de-sac autour d'un point de passage imposé). Détection par symétrie autour du point de demi-tour :
 * les sommets avant et après coïncident deux à deux (un moteur d'itinéraire renvoie la même géométrie dans les deux sens).
 * Garde-fous : rien n'est retiré si l'antenne fait moins de `minM` (bruit), ni si son aller-retour dépasse `maxShare` du parcours
 * (un long aller-retour est un vrai choix d'itinéraire, signalé à part) ; les extrémités ne bougent jamais ; le tracé reste continu.
 */
export function removeSpurs(line: LL[], o: { tolM?: number; minM?: number; maxShare?: number } = {}): { line: LL[]; removedM: number; spurs: number } {
  const tol = o.tolM ?? 4, minM = o.minM ?? 20, maxShare = o.maxShare ?? 0.2;
  let cur = line, removedM = 0, spurs = 0;
  for (let pass = 0; pass < 6; pass++) {
    const n = cur.length; if (n < 5) break;
    const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + distM(cur[i - 1], cur[i]));
    const total = cum[n - 1], drop = new Uint8Array(n); let changed = false;
    for (let t = 1; t < n - 1; t++) {
      // t = sommet de rebroussement : les sommets à égale distance avant et après coïncident
      let m = 0; while (t - m - 1 >= 0 && t + m + 1 < n && distM(cur[t - m - 1], cur[t + m + 1]) <= tol) m++;
      if (!m) continue;
      if (t - m === 0 && t + m === n - 1) continue;               // tout le parcours est un aller-retour : ce n'est pas une antenne
      if (t + m === n - 1 || t - m === 0) m--;                     // ne jamais retirer le départ ni l'arrivée
      if (m < 1) continue;
      const len = cum[t] - cum[t - m];
      if (len < minM || 2 * len > maxShare * total) continue;
      for (let k = t - m + 1; k <= t + m; k++) drop[k] = 1;         // on garde le point d'embranchement cur[t-m], on reprend après son doublon cur[t+m]
      removedM += 2 * len; spurs++; changed = true; t += m;
    }
    if (!changed) break;
    cur = cur.filter((_, i) => !drop[i]);
  }
  return { line: cur, removedM, spurs };
}

/** Plus long saut entre deux points consécutifs (m) : un tracé routé n'en a pas de très grand. */
export const maxStepM = (line: LL[]) => { let m = 0; for (let i = 1; i < line.length; i++) m = Math.max(m, distM(line[i - 1], line[i])); return m; };

/** Points régulièrement espacés le long d'une ligne, en ignorant `skipM` mètres à chaque extrémité (au plus `max` points). */
export function samplesAlong(line: LL[], skipM: number, max = 45): LL[] {
  const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
  const total = cum[cum.length - 1], span = total - 2 * skipM; if (span <= 0) return [];
  const n = Math.min(max, Math.max(1, Math.floor(span / 120))), out: LL[] = []; let j = 0;
  for (let k = 0; k < n; k++) { const d = skipM + (span * (k + 0.5)) / n; while (j < line.length - 2 && cum[j + 1] < d) j++; const t = cum[j + 1] > cum[j] ? (d - cum[j]) / (cum[j + 1] - cum[j]) : 0; out.push([line[j][0] + (line[j + 1][0] - line[j][0]) * t, line[j][1] + (line[j + 1][1] - line[j][1]) * t]); }
  return out;
}

/**
 * Boucle « aller puis retour différent » : l'aller (départ → 2 premiers points) est tracé normalement, puis le retour est cherché
 * en interdisant les tronçons déjà empruntés à l'aller (sauf près du départ et du point de jonction, où il faut bien se raccorder).
 * Renvoie null si aucun retour distinct n'existe.
 */
export async function loopWithDistinctReturn(wps: LL[], profile: Profile, deps: GenDeps, signal?: AbortSignal): Promise<LL[] | null> {
  if (wps.length < 4) return null;
  const cut = Math.ceil((wps.length - 1) / 2);
  const out = await deps.via(wps.slice(0, cut + 1), profile, signal); if (!out) return null;
  const avoid = samplesAlong(out, Math.min(400, lineKm(out) * 1000 * 0.12));
  if (!avoid.length) return null;
  const back = await deps.via(wps.slice(cut), profile, signal, avoid); if (!back) return null;
  return [...out, ...back.slice(1)];
}

/** Ajuste le rayon jusqu'à ce que la longueur soit dans `tol` de la cible. Renvoie le meilleur essai. */
export async function fitLoop(start: LL, theta: number, targetKm: number, profile: Profile, deps: GenDeps, opts: { tol?: number; maxIter?: number; signal?: AbortSignal } = {}): Promise<{ line: LL[]; km: number; removedM: number } | null> {
  const tol = opts.tol ?? 0.1, maxIter = opts.maxIter ?? 4;
  let radius = (targetKm * 1000) / (2 * Math.PI * DETOUR);
  let best: { line: LL[]; km: number; removedM: number } | null = null;
  for (let it = 0; it < maxIter; it++) {
    const raw = await deps.via(loopWaypoints(start, radius, theta), profile, opts.signal);
    if (!raw) { radius *= 0.7; continue; } // pas de chemin : on resserre la boucle
    // nettoyage AVANT la mesure : la distance visée est celle du tracé débarrassé de ses antennes
    let { line, removedM } = removeSpurs(raw);
    // trop de chemin commun entre l'aller et le retour : on cherche un retour par d'autres chemins, et on garde le tracé le moins répétitif
    if (overlapRatio(line) > 0.15) {
      try {
        const alt0 = await loopWithDistinctReturn(loopWaypoints(start, radius, theta), profile, deps, opts.signal);
        if (alt0) { const alt = removeSpurs(alt0); if (distM(alt.line[0], alt.line[alt.line.length - 1]) <= 60 && overlapRatio(alt.line) < overlapRatio(line) - 0.05 && lineKm(alt.line) < lineKm(line) * 1.6) { line = alt.line; removedM = alt.removedM; } }
      } catch (e) { if ((e as Error).name === "AbortError") throw e; /* variante facultative */ }
    }
    if (distM(line[0], line[line.length - 1]) > 60) { radius *= 0.85; continue; } // boucle non refermée sur le départ : tracé écarté
    const km = lineKm(line);
    if (!best || Math.abs(km - targetKm) < Math.abs(best.km - targetKm)) best = { line, km, removedM };
    if (Math.abs(km - targetKm) / targetKm <= tol) break;
    radius *= Math.min(1.6, Math.max(0.6, Math.pow(targetKm / km, 0.9))); // ajustement amorti
  }
  return best;
}

/** Dépassement de distance maximal accepté quand on maximise le dénivelé (+10 %). */
export const DISTANCE_OVER = 0.10;
/** Distance acceptable ? En mode « maximiser le dénivelé » : de −15 % à +10 % de la distance demandée ; sinon ±25 %. */
export const distanceAllowed = (km: number, targetKm: number, maximize: boolean) =>
  maximize ? km <= targetKm * (1 + DISTANCE_OVER) + 1e-9 && km >= targetKm * 0.85 : Math.abs(km - targetKm) / targetKm <= 0.25;

/**
 * D+ « utile » d'une boucle : le dénivelé positif réellement mesuré, diminué de la part gagnée en repassant par le même chemin.
 * Un aller-retour sur la même pente donne du D+ mais pas un itinéraire intéressant : il est donc déclassé, jamais masqué.
 */
export const usefulGain = (p: { gainM: number; overlapPct: number }) => p.gainM * (1 - 0.7 * Math.min(1, p.overlapPct / 100));

/**
 * Classement (plus petit = meilleur). Mode normal : proximité de la distance demandée, vraies boucles d'abord.
 * Mode « maximiser le dénivelé » : D+ utile le plus élevé d'abord ; la distance est déjà bornée par `distanceAllowed`.
 */
export function scoreProposal(p: { distanceM: number; gainM: number; overlapPct: number }, targetKm: number, maximize: boolean): number {
  const distErr = Math.abs(p.distanceM / 1000 - targetKm) / targetKm;
  if (!maximize) return distErr + 1.2 * (p.overlapPct / 100);
  return -usefulGain(p) / Math.max(1, targetKm * 10) + 0.05 * distErr;
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
  const { start, targetKm, profile } = input, maximize = !!input.maximizeGain;
  const n = input.directions ?? 12, count = input.count ?? 4;
  const quick = deps.elevateFast ?? deps.elevate;
  // Maximiser le dénivelé : on mesure d'abord le relief sur le cercle idéal de 24 directions (une requête d'altitudes par direction),
  // puis on ne trace que les directions les plus montantes. Le D+ final est toujours celui du tracé réellement obtenu.
  const ringGain = new Map<number, number>();
  let thetas = Array.from({ length: n }, (_, i) => (i * 360) / n);
  if (maximize) {
    const pool = Array.from({ length: n * 2 }, (_, i) => (i * 360) / (n * 2)), ringRadius = (targetKm * 1000) / (2 * Math.PI * DETOUR); let r = 0;
    for (const t of pool) {
      try { ringGain.set(t, trackStats(await quick(loopWaypoints(start, ringRadius, t, 23), opts.signal), 3).gainM); } catch (e) { if ((e as Error).name === "AbortError") throw e; /* direction ignorée */ }
      opts.onProgress?.({ phase: "relief", done: ++r, total: pool.length });
    }
    if (ringGain.size >= n) thetas = [...ringGain.keys()].sort((a, b) => ringGain.get(b)! - ringGain.get(a)!).slice(0, n);
  }
  const fitted: { theta: number; line: LL[]; km: number; removedM: number }[] = [];
  let done = 0, svcErr: unknown = null, elevErr: unknown = null;
  const kindOf = (e: unknown) => { const x = e as { kind?: "rate" | "server" | "network"; status?: number }; return { reason: x?.kind ?? "network", status: x?.status }; };
  // tracés : 2 boucles en parallèle (le serveur est public, on reste raisonnable)
  const queue = [...thetas];
  await Promise.all([0, 1].map(async () => {
    while (queue.length) {
      const theta = queue.shift()!;
      try {
        const r = await fitLoop(start, theta, targetKm, profile, deps, { signal: opts.signal });
        if (r && distanceAllowed(r.km, targetKm, maximize)) fitted.push({ theta, ...r });
      } catch (e) { if ((e as Error).name === "AbortError") throw e; svcErr = e; } // une direction en échec n'arrête pas les autres
      opts.onProgress?.({ phase: "tracé", done: ++done, total: n });
    }
  }));
  // Aucun tracé obtenu parce que le service de calcul est en panne (et non parce qu'aucun chemin n'existe) : on le dit précisément
  if (!fitted.length && svcErr) throw new GenerationError("routing", kindOf(svcErr));
  // altitudes + score : le D+ est celui du tracé réellement généré (mêmes altitudes et même calcul que partout sur le site)
  const scored: Proposal[] = []; let nEval = 0;
  const evaluate = async (f: { theta: number; line: LL[]; removedM: number }) => {
    let coords: Pt[];
    try { coords = await quick(f.line, opts.signal); } catch (e) { if ((e as Error).name === "AbortError") throw e; elevErr = e; opts.onProgress?.({ phase: "altitudes", done: ++nEval, total: fitted.length }); return; }
    const st = trackStats(coords, 3), ov = Math.round(overlapRatio(f.line) * 100);
    const base = { id: `g-${Math.round(f.theta)}`, bearing: f.theta, line: f.line, coords, distanceM: st.distanceM, gainM: st.gainM, lossM: st.lossM, overlapPct: ov };
    scored.push({ ...base, cleanedM: Math.round(f.removedM), maxStepM: Math.round(maxStepM(f.line)), score: scoreProposal(base, targetKm, maximize) });
    opts.onProgress?.({ phase: "altitudes", done: ++nEval, total: fitted.length });
  };
  let consecutive = 0;
  for (const f of fitted) {
    const before = scored.length; await evaluate(f);
    consecutive = scored.length === before ? consecutive + 1 : 0;
    if (consecutive >= 2 && !scored.length) break; // le service d'altitudes ne répond pas : inutile d'essayer les autres boucles
  }
  if (!scored.length && elevErr) throw new GenerationError("elevation", kindOf(elevErr));
  // Maximiser : les meilleures boucles sont essayées un peu plus longues (jamais plus de +10 %) ; la version longue n'est gardée que si
  // son D+ utile mesuré est réellement supérieur — pas de détour artificiel pour gonfler le chiffre.
  if (maximize) {
    const best = [...scored].sort((a, b) => a.score - b.score).slice(0, 3);
    for (const p of best) {
      if (p.distanceM / 1000 >= targetKm * 1.04) continue;
      try {
        const r = await fitLoop(start, p.bearing, targetKm * 1.07, profile, deps, { signal: opts.signal, tol: 0.025, maxIter: 3 });
        if (!r || !distanceAllowed(r.km, targetKm, true) || r.km <= p.distanceM / 1000) continue;
        const before = scored.length; await evaluate({ theta: p.bearing, line: r.line, removedM: r.removedM });
        if (scored.length > before) { const q = scored.pop()!; if (usefulGain(q) > usefulGain(p) * 1.02) scored[scored.indexOf(p)] = { ...q, stretched: true }; }
      } catch (e) { if ((e as Error).name === "AbortError") throw e; }
    }
  }
  scored.sort((a, b) => a.score - b.score);
  // Maximiser : une direction nettement plus plate que la meilleure n'est pas proposée pour « faire nombre »
  const pool2 = maximize && scored.length ? scored.filter((p) => usefulGain(p) >= usefulGain(scored[0]) * 0.5) : scored;
  const top = pickDistinct(pool2, Math.min(count, pool2.length));
  // Mesure définitive : les propositions retenues sont re-mesurées au pas fin (mêmes altitudes et même calcul que dans l'éditeur)
  if (deps.elevateFast) for (const p of top) {
    try { const c = await deps.elevate(p.line, opts.signal); const st = trackStats(c, 3); p.coords = c; p.distanceM = st.distanceM; p.gainM = st.gainM; p.lossM = st.lossM; p.score = scoreProposal(p, targetKm, maximize); }
    catch (e) { if ((e as Error).name === "AbortError") throw e; p.coarse = true; }
  }
  top.sort((a, b) => a.score - b.score);
  if (deps.surface) {
    let s = 0;
    for (const p of top) { const r = await deps.surface(p.line, profile, opts.signal).catch(() => null); if (r) { p.offRoadPct = r.offRoadPct; p.pathPct = r.pathPct; p.pavedPct = r.pavedPct; } opts.onProgress?.({ phase: "analyse", done: ++s, total: top.length }); }
  }
  return top;
}
