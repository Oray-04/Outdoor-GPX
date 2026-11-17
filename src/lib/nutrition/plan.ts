import { carbsBetween } from "./carbs";
import { isCarbSource, isSodiumSource } from "./products";
import type { AidStation, CaffeineDose, Notice, Product } from "./types";

export interface PlanPoint { name: string; km: number | null; tMin: number; water: boolean; food: boolean; estimated: boolean }
export interface PlanItem { productId: string; name: string; qty: number; carbsG: number; sodiumMg: number; caffeineMg: number; volumeMl: number }
export interface Slot {
  kind: "avant" | "course"; tMin: number; clock: string; km: number | null; segment: number;
  /** Objectifs de la prise (période couverte depuis la prise précédente). */
  target: { carbsG: number; waterMl: number; sodiumMg: number; caffeineMg: number };
  items: PlanItem[];
  /** Eau plate (ml), boisson (ml) et apports réels de la prise. */
  plainWaterMl: number; drinkMl: number;
  got: { carbsG: number; waterMl: number; sodiumMg: number; caffeineMg: number };
  /** Caféine prévue non couverte par un produit (café, comprimé…). */
  caffeineOtherMg: number;
  aid: string | null;
}
export interface Segment {
  index: number; from: PlanPoint; to: PlanPoint;
  target: { carbsG: number; waterMl: number; sodiumMg: number; caffeineMg: number };
  got: { carbsG: number; waterMl: number; sodiumMg: number; caffeineMg: number };
  items: PlanItem[];
  /** Liquide à transporter sur le tronçon (ml) et portions de boisson à préparer. */
  carryWaterMl: number; drinkPortions: number; overCapacity: boolean;
}
export interface PlanResult { points: PlanPoint[]; slots: Slot[]; segments: Segment[]; totals: { items: PlanItem[]; drinkPortions: number; got: Slot["got"]; target: Slot["target"]; plainWaterMl: number }; shortages: { name: string; need: number; stock: number }[]; notices: Notice[] }

export interface PlanBuildInput {
  durationMin: number; distanceKm: number | null; startTime: string; intervalMin: number;
  carbs: { gph: number; ramp: number[] }; waterMlH: number; sodiumMgH: number; caffeineDoses: CaffeineDose[];
  aid: AidStation[]; products: Product[]; productIds: string[]; drinkId: string | null; carryMl: number | null; refillAtAid: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Heure (hh:mm) à t minutes du départ ; « J+1 » au-delà de minuit. */
export function clockAt(start: string, tMin: number) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(start); if (!m) return `${tMin < 0 ? "−" : "+"}${Math.floor(Math.abs(tMin) / 60)}h${pad(Math.round(Math.abs(tMin) % 60))}`;
  const t = +m[1] * 60 + +m[2] + Math.round(tMin), day = Math.floor(t / 1440), h = ((t % 1440) + 1440) % 1440;
  return `${pad(Math.floor(h / 60))}:${pad(h % 60)}${day > 0 ? ` (J+${day})` : day < 0 ? " (veille)" : ""}`;
}

/** Points de passage : départ, ravitaillements (heure estimée au prorata de la distance si absente), arrivée. */
export function planPoints(durationMin: number, distanceKm: number | null, aid: AidStation[]): { points: PlanPoint[]; notices: Notice[] } {
  const notices: Notice[] = [], pts: PlanPoint[] = [{ name: "Départ", km: 0, tMin: 0, water: true, food: true, estimated: false }];
  for (const a of aid) {
    let t = a.etaMin, est = false;
    if (t == null && a.km != null && distanceKm) { t = Math.round((a.km / distanceKm) * durationMin); est = true; }
    if (t == null) { notices.push({ level: "warn", text: `Ravitaillement « ${a.name || "sans nom"} » ignoré : indiquez son kilomètre ou son heure de passage.` }); continue; }
    if (a.km != null && distanceKm != null && a.km > distanceKm) { notices.push({ level: "warn", text: `Ravitaillement « ${a.name} » au km ${a.km}, au-delà de la distance de la course (${distanceKm} km) : ignoré.` }); continue; }
    if (t <= 0 || t >= durationMin) { notices.push({ level: "warn", text: `Ravitaillement « ${a.name} » : heure de passage hors de la durée de course, ignoré.` }); continue; }
    pts.push({ name: a.name || "Ravitaillement", km: a.km, tMin: t, water: a.water, food: a.food, estimated: est });
  }
  pts.push({ name: "Arrivée", km: distanceKm, tMin: durationMin, water: true, food: true, estimated: false });
  pts.sort((a, b) => a.tMin - b.tMin);
  for (let k = 1; k < pts.length; k++) if (pts[k].km != null && pts[k - 1].km != null && pts[k].km! < pts[k - 1].km!) notices.push({ level: "warn", text: `Incohérence : « ${pts[k].name} » est atteint après « ${pts[k - 1].name} » mais à un kilomètre inférieur. Vérifiez les distances et les heures.` });
  return { points: pts, notices };
}

/** Kilomètre estimé à l'instant t par interpolation entre les points connus. */
export function kmAt(points: PlanPoint[], tMin: number) {
  const known = points.filter((p) => p.km != null);
  if (known.length < 2) return null;
  for (let k = 1; k < known.length; k++) if (tMin <= known[k].tMin) { const a = known[k - 1], b = known[k]; const f = b.tMin === a.tMin ? 0 : (tMin - a.tMin) / (b.tMin - a.tMin); return Math.round((a.km! + (b.km! - a.km!) * f) * 10) / 10; }
  return known[known.length - 1].km;
}

const zero = () => ({ carbsG: 0, waterMl: 0, sodiumMg: 0, caffeineMg: 0 });
const add = (a: Slot["got"], b: Partial<Slot["got"]>) => { a.carbsG += b.carbsG ?? 0; a.waterMl += b.waterMl ?? 0; a.sodiumMg += b.sodiumMg ?? 0; a.caffeineMg += b.caffeineMg ?? 0; };
function pushItem(list: PlanItem[], p: Product, qty: number) {
  if (qty <= 0) return; const it = list.find((x) => x.productId === p.id);
  if (it) { it.qty += qty; it.carbsG += p.carbsG * qty; it.sodiumMg += p.sodiumMg * qty; it.caffeineMg += p.caffeineMg * qty; it.volumeMl += p.volumeMl * qty; }
  else list.push({ productId: p.id, name: p.name, qty, carbsG: p.carbsG * qty, sodiumMg: p.sodiumMg * qty, caffeineMg: p.caffeineMg * qty, volumeMl: p.volumeMl * qty });
}

/**
 * Module E — plan de course. Découpe la course en prises régulières, répartit les objectifs (glucides avec montée progressive,
 * eau, sodium, caféine) et les traduit en produits du catalogue : boisson principale d'abord, puis portions entières de produits
 * glucidiques (arrondi cumulé : le total suit l'objectif sans dérive), produits caféinés aux heures des prises de caféine,
 * capsules de sodium pour le complément. Totaux par tronçon (entre ravitaillements) et sur la course.
 */
export function buildPlan(i: PlanBuildInput): PlanResult {
  const notices: Notice[] = [];
  const { points, notices: pn } = planPoints(i.durationMin, i.distanceKm, i.aid); notices.push(...pn);
  const chosen = i.products.filter((p) => i.productIds.includes(p.id));
  const drink = i.drinkId ? i.products.find((p) => p.id === i.drinkId && p.category === "boisson" && p.volumeMl > 0) ?? null : null;
  const carbSrc = chosen.filter((p) => isCarbSource(p) && p.caffeineMg === 0), cafSrc = chosen.filter((p) => isCarbSource(p) && p.caffeineMg > 0), saltSrc = chosen.filter(isSodiumSource);
  // pas du planning calculé (voir interval.ts) : peut être fractionnaire (ex. 12,5 min = un gel toutes les 25 min, boire entre les deux)
  const step = Math.max(5, Math.min(60, i.intervalMin || 20));

  // instants des prises
  const times: number[] = [];
  for (let t = step; t < i.durationMin - step / 3; t += step) times.push(t);
  if (!times.length && i.durationMin > 0) times.push(Math.round(i.durationMin / 2));
  const segOf = (t: number) => { for (let k = 1; k < points.length; k++) if (t <= points[k].tMin) return k - 1; return points.length - 2; };
  const aidAt = (t: number) => points.find((p, k) => k > 0 && k < points.length - 1 && Math.abs(p.tMin - t) < step / 2)?.name ?? null;
  const slots: Slot[] = [];
  for (const d of i.caffeineDoses.filter((d) => d.atMin < 0)) slots.push({ kind: "avant", tMin: d.atMin, clock: clockAt(i.startTime, d.atMin), km: null, segment: -1, target: { ...zero(), caffeineMg: d.mg }, items: [], plainWaterMl: 0, drinkMl: 0, got: zero(), caffeineOtherMg: d.mg, aid: null });
  times.forEach((t, k) => {
    const from = k === 0 ? 0 : times[k - 1], to = k === times.length - 1 ? i.durationMin : t, dt = (to - from) / 60;
    slots.push({ kind: "course", tMin: t, clock: clockAt(i.startTime, t), km: kmAt(points, t), segment: segOf(t), target: { carbsG: carbsBetween(i.carbs.gph, i.carbs.ramp, from, to), waterMl: i.waterMlH * dt, sodiumMg: i.sodiumMgH * dt, caffeineMg: 0 }, items: [], plainWaterMl: 0, drinkMl: 0, got: zero(), caffeineOtherMg: 0, aid: aidAt(t) });
  });
  const run = slots.filter((s) => s.kind === "course");
  for (const d of i.caffeineDoses.filter((d) => d.atMin >= 0)) {
    const s = run.reduce((a, b) => (Math.abs(b.tMin - d.atMin) < Math.abs(a.tMin - d.atMin) ? b : a), run[0]); if (s) s.target.caffeineMg += d.mg;
  }

  // répartition en produits, avec arrondi cumulé (l'écart d'une prise est reporté sur la suivante)
  let cumCarbT = 0, cumCarbG = 0, cumSaltT = 0, cumSaltG = 0, rot = 0;
  for (const s of run) {
    if (drink) { s.drinkMl = s.target.waterMl; const f = s.drinkMl / drink.volumeMl; add(s.got, { waterMl: s.drinkMl, carbsG: drink.carbsG * f, sodiumMg: drink.sodiumMg * f, caffeineMg: drink.caffeineMg * f }); }
    else { s.plainWaterMl = s.target.waterMl; add(s.got, { waterMl: s.plainWaterMl }); }
    // caféine : produits caféinés à l'heure prévue
    let cafLeft = s.target.caffeineMg;
    for (const p of cafSrc) { if (cafLeft <= 0) break; const q = Math.max(0, Math.round(cafLeft / p.caffeineMg)); if (q) { pushItem(s.items, p, q); add(s.got, { carbsG: p.carbsG * q, sodiumMg: p.sodiumMg * q, caffeineMg: p.caffeineMg * q, waterMl: 0 }); cafLeft -= p.caffeineMg * q; } }
    s.caffeineOtherMg = Math.max(0, Math.round(cafLeft));
    // glucides restants
    cumCarbT += s.target.carbsG; cumCarbG += s.got.carbsG;
    if (carbSrc.length) {
      let guard = 0;
      while (guard++ < 20) { const p = carbSrc[rot % carbSrc.length]; if (cumCarbG + p.carbsG / 2 > cumCarbT) break; pushItem(s.items, p, 1); add(s.got, { carbsG: p.carbsG, sodiumMg: p.sodiumMg, caffeineMg: 0 }); cumCarbG += p.carbsG; rot++; }
    }
    // sodium restant
    cumSaltT += s.target.sodiumMg; cumSaltG += s.got.sodiumMg;
    if (saltSrc.length) { const p = saltSrc[0]; let guard = 0; while (guard++ < 10 && cumSaltG + p.sodiumMg / 2 <= cumSaltT) { pushItem(s.items, p, 1); add(s.got, { sodiumMg: p.sodiumMg }); cumSaltG += p.sodiumMg; } }
  }

  // tronçons
  const segments: Segment[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const ss = run.filter((s) => s.segment === k), seg: Segment = { index: k, from: points[k], to: points[k + 1], target: zero(), got: zero(), items: [], carryWaterMl: 0, drinkPortions: 0, overCapacity: false };
    for (const s of ss) { add(seg.target, s.target); add(seg.got, s.got); s.items.forEach((it) => { const p = i.products.find((x) => x.id === it.productId); if (p) pushItem(seg.items, p, it.qty); }); }
    seg.carryWaterMl = Math.round(seg.got.waterMl);
    seg.drinkPortions = drink ? Math.ceil(ss.reduce((a, s) => a + s.drinkMl, 0) / drink.volumeMl - 1e-6) : 0;
    segments.push(seg);
  }
  const water = (k: number) => points[k].water;
  if (i.carryMl && i.carryMl > 0) {
    // sans recharge possible, l'eau de plusieurs tronçons s'additionne jusqu'au prochain point d'eau
    let acc = 0, accFrom = 0;
    segments.forEach((s, k) => {
      if (!i.refillAtAid || !water(k)) acc += s.carryWaterMl; else { acc = s.carryWaterMl; accFrom = k; }
      if (acc > i.carryMl! + 1) { s.overCapacity = true; notices.push({ level: "warn", text: `Entre « ${points[accFrom].name} » et « ${s.to.name} » : ${acc} ml à boire pour ${i.carryMl} ml transportables. Ajoutez un contenant, un point d'eau, ou prévoyez de boire davantage au ravitaillement.` }); }
    });
  }

  // totaux et stock
  const totals = { items: [] as PlanItem[], drinkPortions: segments.reduce((a, s) => a + s.drinkPortions, 0), got: zero(), target: zero(), plainWaterMl: 0 };
  for (const s of slots) { add(totals.got, s.got); add(totals.target, s.target); totals.plainWaterMl += s.plainWaterMl; s.items.forEach((it) => { const p = i.products.find((x) => x.id === it.productId); if (p) pushItem(totals.items, p, it.qty); }); }
  if (!i.refillAtAid) segments.forEach((s) => { s.carryWaterMl = s.index === 0 ? Math.round(totals.got.waterMl) : 0; });
  const shortages: PlanResult["shortages"] = [];
  for (const it of totals.items) { const p = i.products.find((x) => x.id === it.productId); if (p?.stock != null && it.qty > p.stock) shortages.push({ name: p.name, need: it.qty, stock: p.stock }); }
  if (drink?.stock != null && totals.drinkPortions > drink.stock) shortages.push({ name: drink.name, need: totals.drinkPortions, stock: drink.stock });
  for (const sh of shortages) notices.push({ level: "warn", text: `Stock insuffisant : ${sh.need} × « ${sh.name} » nécessaires, ${sh.stock} disponible(s).` });
  if (!carbSrc.length && !cafSrc.length && !drink && i.carbs.gph > 0) notices.push({ level: "info", text: "Aucun produit choisi : le plan indique les quantités à apporter (grammes, millilitres, milligrammes). Ajoutez vos produits au catalogue pour obtenir le nombre exact à emporter." });
  if (drink && i.carbs.gph > 0 && totals.got.carbsG > totals.target.carbsG * 1.15) notices.push({ level: "warn", text: `Avec « ${drink.name} » comme boisson, l'apport de glucides dépasse l'objectif de ${Math.round((totals.got.carbsG / Math.max(1, totals.target.carbsG) - 1) * 100)} % : alternez avec de l'eau plate.` });
  if (totals.target.sodiumMg > 0 && totals.got.sodiumMg < totals.target.sodiumMg * 0.7) notices.push({ level: "info", text: `Sodium couvert à ${Math.round((totals.got.sodiumMg / totals.target.sodiumMg) * 100)} % par les produits choisis : ajoutez une boisson d'effort ou des capsules si besoin.` });
  const otherCaf = slots.reduce((a, s) => a + s.caffeineOtherMg, 0);
  if (otherCaf > 0) notices.push({ level: "info", text: `${otherCaf} mg de caféine prévus hors produits du catalogue (café, comprimé…) : la quantité figure dans le planning.` });
  if (drink && drink.caffeineMg > 0) notices.push({ level: "warn", text: `La boisson « ${drink.name} » contient de la caféine : elle s'ajoute aux prises prévues.` });
  return { points, slots, segments, totals, shortages, notices };
}

// ── Objectifs non atteints : comparaison prévu / objectif, au total, par tronçon et prise par prise ──
export type Metric = "carbsG" | "waterMl" | "sodiumMg";
export const METRICS: Metric[] = ["carbsG", "waterMl", "sodiumMg"];
export interface Gap { metric: Metric; target: number; got: number; gap: number; pct: number; status: "ok" | "short" | "missing" | "over" }
/** Écart toléré avant de signaler un manque : 10 % de l'objectif, et au moins ces quantités (arrondi des portions). */
export const GAP_TOLERANCE = { ratio: 0.9, minAbs: { carbsG: 8, waterMl: 60, sodiumMg: 80 } as Record<Metric, number>, overRatio: 1.3 };
export function gapOf(metric: Metric, target: number, got: number, slack = 0): Gap {
  const gap = Math.max(0, target - got), pct = target > 0 ? Math.round((got / target) * 100) : 100;
  let status: Gap["status"] = "ok";
  if (target > 0 && got < target * GAP_TOLERANCE.ratio && gap > Math.max(GAP_TOLERANCE.minAbs[metric], slack)) status = pct < 60 ? "missing" : "short";
  else if (target > 0 && got > target * GAP_TOLERANCE.overRatio && got - target > GAP_TOLERANCE.minAbs[metric]) status = "over";
  return { metric, target: Math.round(target), got: Math.round(got), gap: Math.round(gap), pct, status };
}
/**
 * Manques du plan. Prise par prise, on compare les cumuls (et non chaque prise seule) : une portion arrondie à la prise suivante
 * n'est pas un manque, un retard qui s'accumule en est un.
 */
export function shortfalls(p: PlanResult) {
  const run = p.slots.filter((s) => s.kind === "course");
  const totals = Object.fromEntries(METRICS.map((m) => [m, gapOf(m, p.totals.target[m], p.totals.got[m])])) as Record<Metric, Gap>;
  const cum = { carbsG: [0, 0], waterMl: [0, 0], sodiumMg: [0, 0] } as Record<Metric, [number, number]>;
  // une portion entière peut être reportée à la prise suivante : tolérance de 60 % de la plus grosse portion utilisée
  const per = (m: "carbsG" | "sodiumMg") => Math.max(0, ...p.totals.items.map((it) => (it.qty ? it[m] / it.qty : 0)));
  const slack: Record<Metric, number> = { carbsG: per("carbsG") * 0.6, waterMl: 0, sodiumMg: per("sodiumMg") * 0.6 };
  const slots = run.map((s) => Object.fromEntries(METRICS.map((m) => { cum[m][0] += s.target[m]; cum[m][1] += s.got[m]; const g = gapOf(m, cum[m][0], cum[m][1], slack[m]); return [m, { behind: g.status === "short" || g.status === "missing", behindBy: g.gap }]; })) as Record<Metric, { behind: boolean; behindBy: number }>);
  const segments = p.segments.map((g) => Object.fromEntries(METRICS.map((m) => [m, gapOf(m, g.target[m], g.got[m])])) as Record<Metric, Gap>);
  const any = METRICS.some((m) => totals[m].status === "short" || totals[m].status === "missing");
  return { totals, slots, segments, any };
}
