import { describe, it, expect } from "vitest";
import { computeCarbs, carbBand, carbsBetween } from "../src/lib/nutrition/carbs";
import { measuredSweatRate, estimateSweatRate, computeHydration } from "../src/lib/nutrition/hydration";
import { sweatSodiumMgL, computeSodium, drinkConcentrationMgL } from "../src/lib/nutrition/sodium";
import { caffeineDoseMg, residualMg, computeCaffeine, defaultSchedule } from "../src/lib/nutrition/caffeine";
import { buildPlan, clockAt, kmAt, planPoints } from "../src/lib/nutrition/plan";
import { validateProduct } from "../src/lib/nutrition/products";
import { computeNutrition, validateInput, suggestDurationMin } from "../src/lib/nutrition/engine";
import type { PlanInput, Product } from "../src/lib/nutrition/types";
import { NUTRITION } from "../src/lib/nutrition/constants";

const base = { intensity: "moderee" as const, level: "confirme" as const, tolerance: "bonne" as const, habit: "entrainee" as const };

describe("module A — glucides", () => {
  it("repères par durée", () => {
    expect(carbBand(30)).toMatchObject({ min: 0, max: 0 }); expect(carbBand(60)).toMatchObject({ min: 0, max: 30, optional: true });
    expect(carbBand(90)).toMatchObject({ min: 30, max: 60 }); expect(carbBand(150)).toMatchObject({ min: 60, max: 90 }); expect(carbBand(149)).toMatchObject({ min: 30, max: 60 });
  });
  it("aucun apport sous 45 min, facultatif jusqu'à 75 min", () => {
    expect(computeCarbs({ ...base, durationMin: 40 })).toMatchObject({ gph: 0, totalG: 0, optional: true });
    const r = computeCarbs({ ...base, durationMin: 60 }); expect(r.gph).toBe(0); expect(r.optional).toBe(true); expect(r.notices.some((n) => /facultatif|aucun apport/.test(n.text))).toBe(true);
  });
  it("1 h 15–2 h 30 : 30 à 60 g/h ; total = objectif × durée sans montée progressive", () => {
    const r = computeCarbs({ ...base, durationMin: 120 }); expect(r.gph).toBe(45); expect(r.totalG).toBe(90); expect(r.flatTotalG).toBe(90);
    expect(computeCarbs({ ...base, durationMin: 120, intensity: "elevee" }).gph).toBe(55);
  });
  it("90 g/h jamais attribués à un sportif non entraîné", () => {
    for (const habit of ["aucune", "occasionnelle", "reguliere"] as const) expect(computeCarbs({ ...base, durationMin: 600, intensity: "elevee", habit }).gph).toBeLessThan(90);
    expect(computeCarbs({ ...base, durationMin: 600, intensity: "elevee", tolerance: "moyenne" }).gph).toBeLessThan(90);
    expect(computeCarbs({ ...base, durationMin: 600, intensity: "elevee", level: "intermediaire" }).gph).toBeLessThan(90);
    expect(computeCarbs({ ...base, durationMin: 600, intensity: "elevee" }).gph).toBe(85); // r5(60 + 30 × 0,85) = 85
    const beg = computeCarbs({ durationMin: 300, intensity: "moderee", level: "debutant", tolerance: "faible", habit: "aucune" });
    expect(beg.gph).toBe(45); expect(beg.capBy).toMatch(/habitude|tolérance/); expect(beg.notices.some((n) => n.level === "warn" && /45 g\/h/.test(n.text))).toBe(true);
  });
  it("montée progressive (tolérance faible) : 60 % puis 85 % puis 100 %", () => {
    const r = computeCarbs({ durationMin: 240, intensity: "moderee", level: "confirme", tolerance: "faible", habit: "entrainee" });
    expect(r.gph).toBe(45); expect(r.ramp).toEqual([0.6, 0.85, 1]); expect(r.totalG).toBe(Math.round(45 * 0.6 + 45 * 0.85 + 45 + 45)); expect(r.flatTotalG).toBe(180);
    expect(carbsBetween(60, [0.5, 1], 30, 90)).toBeCloseTo(60 * 0.5 * 0.5 + 60 * 0.5, 6);
  });
  it("saisie manuelle au-dessus du plafond : acceptée avec alerte, bornée à 120", () => {
    const r = computeCarbs({ ...base, durationMin: 300, habit: "occasionnelle", overrideGph: 100 }); expect(r.gph).toBe(100); expect(r.source).toBe("saisie"); expect(r.notices.some((n) => n.level === "alert")).toBe(true);
    expect(computeCarbs({ ...base, durationMin: 300, overrideGph: 500 }).gph).toBe(120);
  });
});

describe("module B — hydratation", () => {
  it("débit de sudation mesuré", () => {
    expect(measuredSweatRate({ preKg: 70, postKg: 68.8, fluidL: 0.5, urineL: 0.1, durationMin: 90 }).lh).toBeCloseTo((1.2 + 0.5 - 0.1) / 1.5, 2);
    expect(measuredSweatRate({ preKg: 70, postKg: 68.8, fluidL: 0.5, urineL: null, durationMin: 60 }).lh).toBe(1.7);
    expect(measuredSweatRate({ preKg: 70, postKg: 60, fluidL: 0, urineL: 0, durationMin: 60 }).lh).toBeNull(); // 10 L/h : incohérent
    expect(measuredSweatRate({ preKg: 70, postKg: 69, fluidL: 0, urineL: 0, durationMin: 20 }).error).toMatch(/30 minutes/);
    expect(measuredSweatRate({ preKg: 70, postKg: null, fluidL: 0, urineL: 0, durationMin: 60 }).lh).toBeNull();
  });
  it("estimation : chaleur, humidité, soleil, intensité et poids augmentent le débit ; bornes", () => {
    const ref = { weightKg: 70, tempC: 15, humidityPct: 50, intensity: "moderee" as const, sky: "couvert" as const, sweat: "moyen" as const };
    expect(estimateSweatRate(ref)).toBe(0.8);
    expect(estimateSweatRate({ ...ref, tempC: 30 })).toBeCloseTo(0.8 + 15 * NUTRITION.hydration.perDegAbove, 2);
    expect(estimateSweatRate({ ...ref, tempC: 30, humidityPct: 90 })).toBeGreaterThan(estimateSweatRate({ ...ref, tempC: 30 }));
    expect(estimateSweatRate({ ...ref, humidityPct: 90 })).toBe(0.8); // humidité sans effet par temps frais
    expect(estimateSweatRate({ ...ref, sky: "soleil" })).toBeGreaterThan(0.8);
    expect(estimateSweatRate({ ...ref, intensity: "elevee" })).toBeGreaterThan(estimateSweatRate({ ...ref, intensity: "facile" }));
    expect(estimateSweatRate({ ...ref, weightKg: 90 })).toBeGreaterThan(0.8);
    expect(estimateSweatRate({ ...ref, tempC: 50, humidityPct: 100, sweat: "eleve", intensity: "elevee", weightKg: 120 })).toBe(2.5);
    expect(estimateSweatRate({ ...ref, tempC: -20, sweat: "faible", intensity: "facile", weightKg: 40 })).toBe(0.25);
  });
  it("jamais 100 % des pertes ; plafond de 800 ml/h ; plancher de 300 ml/h", () => {
    const h = computeHydration({ weightKg: 70, durationMin: 180, sweatLh: 1, reliability: "estimee" }); expect(h.mlh).toBe(650); expect(h.replacePct).toBe(65); expect(h.totalMl).toBe(1950);
    expect(h.lossKg).toBeGreaterThanOrEqual(1); expect(h.lossKg).toBeLessThanOrEqual(1.1); // (1 000 − 650) ml/h × 3 h = 1,05 kg, arrondi au dixième expect(h.lossPct).toBeCloseTo(1.5, 1);
    expect(computeHydration({ weightKg: 70, durationMin: 180, sweatLh: 2, reliability: "mesuree" }).mlh).toBe(800);
    const low = computeHydration({ weightKg: 70, durationMin: 180, sweatLh: 0.3, reliability: "estimee" }); expect(low.mlh).toBe(270); expect(low.mlh).toBeLessThan(300); // ≤ 90 % des pertes, prioritaire sur le plancher
    for (const s of [0.25, 0.5, 1, 1.5, 2.5]) expect(computeHydration({ weightKg: 70, durationMin: 240, sweatLh: s, reliability: "estimee" }).mlh).toBeLessThan(s * 1000);
  });
  it("garde-fous : saisie ≥ pertes = alerte hyponatrémie ; forte perte = alerte", () => {
    const o = computeHydration({ weightKg: 70, durationMin: 240, sweatLh: 0.6, reliability: "estimee", overrideMlH: 700 }); expect(o.notices.some((n) => n.level === "alert" && /hyponatrémie/.test(n.text))).toBe(true);
    const hot = computeHydration({ weightKg: 60, durationMin: 600, sweatLh: 1.8, reliability: "mesuree" }); expect(hot.lossPct).toBeGreaterThan(4); expect(hot.notices.some((n) => n.level === "alert")).toBe(true);
    expect(computeHydration({ weightKg: 70, durationMin: 45, sweatLh: 1, reliability: "estimee" }).optional).toBe(true);
  });
});

describe("module C — sodium", () => {
  it("pertes = débit × concentration ; conversion mmol/L", () => {
    expect(sweatSodiumMgL({ value: 40, unit: "mmolL" }, "inconnu")).toEqual({ mgL: 920, reliability: "mesuree" });
    expect(sweatSodiumMgL({ value: 1100, unit: "mgL" }, "inconnu")).toEqual({ mgL: 1100, reliability: "mesuree" });
    expect(sweatSodiumMgL(null, "eleve")).toEqual({ mgL: 1400, reliability: "estimee" });
    const bad = sweatSodiumMgL({ value: 40, unit: "mgL" }, "moyen"); expect(bad.reliability).toBe("estimee"); expect(bad.error).toMatch(/unité/);
    const s = computeSodium({ sweatLh: 1, sweatMgL: 900, durationMin: 300, reliability: "estimee" }); expect(s.lossMgH).toBe(900); expect(s.lossTotalMg).toBe(4500); expect(s.mgh).toBe(540); expect(s.totalMg).toBe(2700);
  });
  it("aucun apport sous 1 h 30 ; plafond 1 000 mg/h ; saisie excessive signalée", () => {
    expect(computeSodium({ sweatLh: 1, sweatMgL: 900, durationMin: 80, reliability: "estimee" }).mgh).toBe(0);
    expect(computeSodium({ sweatLh: 2.5, sweatMgL: 1400, durationMin: 600, reliability: "mesuree" }).mgh).toBe(1000);
    expect(computeSodium({ sweatLh: 1, sweatMgL: 900, durationMin: 300, reliability: "estimee", overrideMgH: 2000 }).notices.some((n) => n.level === "alert")).toBe(true);
    expect(computeSodium({ sweatLh: 0.5, sweatMgL: 500, durationMin: 300, reliability: "estimee", overrideMgH: 600 }).notices.some((n) => /supérieur à vos pertes/.test(n.text))).toBe(true);
    expect(drinkConcentrationMgL(300, 500)).toBe(600);
  });
});

describe("module D — caféine", () => {
  it("dose = poids × mg/kg ; résiduel = dose × 2^(−t/demi-vie), cumul des prises", () => {
    expect(caffeineDoseMg(70, 3)).toBe(210);
    expect(residualMg([{ atMin: 0, mg: 200 }], 300, 5)).toBeCloseTo(100, 6);
    expect(residualMg([{ atMin: 0, mg: 200 }, { atMin: 300, mg: 100 }], 600, 5)).toBeCloseTo(50 + 50, 6);
    expect(residualMg([{ atMin: 60, mg: 100 }], 30, 5)).toBe(0);
  });
  it("répartition : une prise avant le départ, puis fractionnée sur les efforts longs", () => {
    expect(defaultSchedule(90)).toEqual([{ atMin: -45, share: 1 }]); expect(defaultSchedule(240).map((d) => d.share)).toEqual([0.4, 0.6]);
    const u = defaultSchedule(1200); expect(u.reduce((a, d) => a + d.share, 0)).toBeCloseTo(1, 6); expect(u.every((d) => d.atMin > 0)).toBe(true);
  });
  it("stratégie prudente, sensibilité, cumul et alertes", () => {
    const r = computeCaffeine({ weightKg: 70, durationMin: 240, strategy: "moderee", sensitivity: "normale", habitualMgDay: 200, startTime: "08:00" });
    expect(r.totalMg).toBe(140); expect(r.totalMgKg).toBe(2); expect(r.doses).toHaveLength(2);
    expect(computeCaffeine({ weightKg: 70, durationMin: 240, strategy: "standard", sensitivity: "elevee", habitualMgDay: 200, startTime: "08:00" }).totalMg).toBe(105);
    const big = computeCaffeine({ weightKg: 60, durationMin: 240, strategy: "personnalisee", customMgKg: 9, sensitivity: "normale", habitualMgDay: 0, startTime: "08:00" });
    expect(big.mgPerKg).toBe(6); expect(big.notices.some((n) => /faible/.test(n.text))).toBe(true);
    const manual = computeCaffeine({ weightKg: 60, durationMin: 240, strategy: "standard", sensitivity: "normale", habitualMgDay: 300, startTime: "08:00", doses: [{ id: "a", atMin: 0, mg: 250 }, { id: "b", atMin: 60, mg: 200 }] });
    expect(manual.totalMg).toBe(450); expect(manual.totalMgKg).toBe(7.5); expect(manual.notices.filter((n) => n.level === "alert" || n.level === "warn").length).toBeGreaterThanOrEqual(3);
    expect(computeCaffeine({ weightKg: 70, durationMin: 60, strategy: "aucune", sensitivity: "normale", habitualMgDay: 0, startTime: "08:00" })).toMatchObject({ totalMg: 0, doses: [] });
  });
  it("quantité résiduelle au coucher (course qui finit tard)", () => {
    const r = computeCaffeine({ weightKg: 70, durationMin: 600, strategy: "standard", sensitivity: "normale", habitualMgDay: 200, startTime: "10:00", bedtime: "22:30" });
    expect(r.atBedMg).toBeGreaterThan(50); expect(r.notices.some((n) => /coucher/.test(n.text))).toBe(true);
  });
});

const P = (o: Partial<Product>): Product => ({ id: "x", name: "Produit", brand: "", category: "gel", carbsG: 0, sodiumMg: 0, volumeMl: 0, caffeineMg: 0, stock: null, ...o });
describe("module E — plan de course", () => {
  it("heures, kilomètres, points de passage", () => {
    expect(clockAt("08:00", 90)).toBe("09:30"); expect(clockAt("22:00", 180)).toBe("01:00 (J+1)"); expect(clockAt("08:00", -45)).toBe("07:15");
    const { points, notices } = planPoints(300, 50, [{ id: "a", name: "Ravito 1", km: 20, etaMin: null, water: true, food: true }, { id: "b", name: "Trop loin", km: 60, etaMin: null, water: true, food: true }, { id: "c", name: "", km: null, etaMin: null, water: true, food: true }]);
    expect(points.map((p) => [p.name, p.tMin])).toEqual([["Départ", 0], ["Ravito 1", 120], ["Arrivée", 300]]); expect(notices).toHaveLength(2);
    expect(kmAt(points, 60)).toBe(10); expect(kmAt(points, 210)).toBe(35);
  });
  it("totaux du plan égaux aux objectifs (sans produit) ; caféine avant départ", () => {
    const p = buildPlan({ durationMin: 240, distanceKm: 40, startTime: "08:00", intervalMin: 20, carbs: { gph: 60, ramp: [1] }, waterMlH: 600, sodiumMgH: 400, caffeineDoses: [{ id: "c", atMin: -45, mg: 100 }, { id: "d", atMin: 150, mg: 100 }], aid: [], products: [], productIds: [], drinkId: null, carryMl: null, refillAtAid: true });
    const run = p.slots.filter((s) => s.kind === "course"); expect(run).toHaveLength(11); expect(p.slots[0]).toMatchObject({ kind: "avant", clock: "07:15" });
    expect(p.totals.target.carbsG).toBeCloseTo(240, 6); expect(p.totals.target.waterMl).toBeCloseTo(2400, 6); expect(p.totals.target.sodiumMg).toBeCloseTo(1600, 6); expect(p.totals.target.caffeineMg).toBe(200);
    expect(Math.abs(run.find((s) => s.target.caffeineMg > 0)!.tMin - 150)).toBeLessThanOrEqual(10); // prise la plus proche expect(p.totals.got.waterMl).toBeCloseTo(2400, 6);
  });
  it("répartition en produits : portions entières qui suivent l'objectif, caféine, sodium, boisson, stock", () => {
    const products = [P({ id: "g", name: "Gel A", carbsG: 25, sodiumMg: 50 }), P({ id: "gc", name: "Gel caféiné", carbsG: 25, caffeineMg: 50 }), P({ id: "s", name: "Capsule", category: "sel", sodiumMg: 200, stock: 3 }), P({ id: "d", name: "Boisson", category: "boisson", carbsG: 30, sodiumMg: 250, volumeMl: 500 })];
    const p = buildPlan({ durationMin: 240, distanceKm: 40, startTime: "08:00", intervalMin: 20, carbs: { gph: 60, ramp: [1] }, waterMlH: 500, sodiumMgH: 500, caffeineDoses: [{ id: "c", atMin: 120, mg: 100 }], aid: [{ id: "a", name: "Ravito", km: 20, etaMin: null, water: true, food: true }], products, productIds: ["g", "gc", "s", "d"], drinkId: "d", carryMl: 1000, refillAtAid: true });
    const q = (id: string) => p.totals.items.find((x) => x.productId === id)?.qty ?? 0;
    expect(q("gc")).toBe(2); expect(p.totals.got.caffeineMg).toBe(100); // 100 mg / 50 mg par gel
    expect(Math.abs(p.totals.got.carbsG - 240)).toBeLessThanOrEqual(12.5 + 1e-6); // à une demi-portion près
    expect(p.totals.drinkPortions).toBe(4); expect(p.totals.got.waterMl).toBeCloseTo(2000, 6);
    expect(Math.abs(p.totals.got.sodiumMg - 2000)).toBeLessThanOrEqual(100 + 1e-6);
    expect(p.shortages.find((x) => x.name === "Capsule")).toBeTruthy(); expect(p.segments).toHaveLength(2); expect(p.segments[0].carryWaterMl).toBe(1000);
    expect(p.segments.reduce((a, s) => a + (s.items.find((x) => x.productId === "g")?.qty ?? 0), 0)).toBe(q("g"));
  });
  it("capacité de liquide dépassée entre deux points d'eau : signalée", () => {
    const p = buildPlan({ durationMin: 300, distanceKm: 40, startTime: "08:00", intervalMin: 30, carbs: { gph: 0, ramp: [1] }, waterMlH: 600, sodiumMgH: 0, caffeineDoses: [], aid: [{ id: "a", name: "Ravito solide", km: 20, etaMin: null, water: false, food: true }], products: [], productIds: [], drinkId: null, carryMl: 1000, refillAtAid: true });
    expect(p.segments.some((s) => s.overCapacity)).toBe(true); expect(p.notices.some((n) => /transportables/.test(n.text))).toBe(true);
  });
});

describe("validation et calcul complet", () => {
  const input = (o: Partial<PlanInput> = {}): PlanInput => ({
    athlete: { weightKg: 68, level: "intermediaire", experienceYears: 4, tolerance: "moyenne", habit: "reguliere" },
    race: { type: "trail", name: "Test", distanceKm: 42, gainM: 2000, durationMin: 330, intensity: "moderee", startTime: "07:00" },
    weather: { tempC: 22, humidityPct: 60, sky: "soleil", sweat: "moyen" },
    prefs: { carbOverrideGph: null, intakeOverrideMlH: null, sodiumOverrideMgH: null, foodNotes: "", saltProfile: "inconnu", sweatTest: null, sweatSodium: null, caffeine: { strategy: "prudente", customMgKg: null, sensitivity: "normale", habitualMgDay: 150, halfLifeH: null, bedtime: "", doses: null }, productIds: [], drinkId: null, intervalMin: 20, carryMl: 1000, refillAtAid: true },
    aid: [], products: [], ...o,
  });
  it("champs obligatoires manquants : erreurs par étape, aucune valeur fictive", () => {
    const v = validateInput(input({ athlete: { ...input().athlete, weightKg: null }, weather: { ...input().weather, tempC: null } }));
    expect(v.errors.map((e) => [e.step, e.field])).toEqual([[1, "weightKg"], [3, "tempC"]]); expect(() => computeNutrition(input({ athlete: { ...input().athlete, weightKg: null } }))).toThrow(/Poids/);
    expect(validateInput(input({ race: { ...input().race, distanceKm: 42, durationMin: 60 } })).warnings.some((w) => /42\.0 km\/h/.test(w.text))).toBe(true);
  });
  it("calcul complet cohérent", () => {
    const r = computeNutrition(input());
    expect(r.carbs.gph).toBe(75); expect(r.carbs.ramp).toEqual([0.85, 1]); expect(r.hydration.reliability).toBe("estimee"); expect(r.hydration.mlh).toBeLessThan(r.hydration.sweatLh * 1000);
    expect(r.sodium.mgh).toBeGreaterThan(0); expect(r.caffeine.totalMg).toBe(68); expect(r.plan.slots.filter((s) => s.kind === "course").length).toBeGreaterThan(10);
    expect(r.plan.totals.target.carbsG).toBeCloseTo(r.carbs.totalG, 0);
    const measured = computeNutrition(input({ prefs: { ...input().prefs, sweatTest: { preKg: 68, postKg: 67, fluidL: 0.6, urineL: 0, durationMin: 80 } } })); expect(measured.hydration.reliability).toBe("mesuree"); expect(measured.hydration.sweatLh).toBe(1.2);
  });
  it("durée suggérée et produits", () => {
    expect(suggestDurationMin("route", 42.195, 0, "intermediaire")).toBe(255); expect(suggestDurationMin("trail", 30, 1500, "intermediaire")).toBe(385); expect(suggestDurationMin("trail", null, 0, "elite")).toBeNull();
    expect(validateProduct(P({ name: "Gel", carbsG: 25 }))).toEqual([]); expect(validateProduct(P({ name: "", carbsG: 500 })).length).toBe(2);
    expect(validateProduct(P({ name: "B", category: "boisson", volumeMl: 0 }))[0]).toMatch(/volume/); expect(validateProduct(P({ name: "Vide" }))[0]).toMatch(/ni glucides/);
  });
});
import { pdfSafe } from "../src/lib/nutrition/pdf";
describe("fiche PDF", () => { it("symboles convertis pour la police intégrée", () => { expect(pdfSafe("≈ 5 L → 3 − 2 ≤ 4")).toBe("env. 5 L > 3 - 2 <= 4"); }); });

describe("cas limites de bout en bout", () => {
  const mk = (durationMin: number, tempC: number, o: Partial<PlanInput["race"]> = {}): PlanInput => ({
    athlete: { weightKg: 60, level: "intermediaire", experienceYears: null, tolerance: "moyenne", habit: "reguliere" },
    race: { type: "trail", name: "", distanceKm: null, gainM: null, durationMin, intensity: "moderee", startTime: "20:00", ...o },
    weather: { tempC, humidityPct: 50, sky: "couvert", sweat: "inconnu" },
    prefs: { carbOverrideGph: null, intakeOverrideMlH: null, sodiumOverrideMgH: null, foodNotes: "", saltProfile: "inconnu", sweatTest: null, sweatSodium: null, caffeine: { strategy: "prudente", customMgKg: null, sensitivity: "normale", habitualMgDay: 100, halfLifeH: null, bedtime: "", doses: null }, productIds: [], drinkId: null, intervalMin: 30, carryMl: null, refillAtAid: true },
    aid: [], products: [],
  });
  it("course de 40 min : ni glucides ni sodium, eau facultative, plan cohérent", () => {
    const r = computeNutrition(mk(40, 15)); expect(r.carbs.totalG).toBe(0); expect(r.sodium.mgh).toBe(0); expect(r.hydration.optional).toBe(true);
    expect(r.plan.slots.filter((s) => s.kind === "course")).toHaveLength(1); expect(r.plan.totals.got.carbsG).toBe(0);
  });
  it("ultra de 30 h de nuit : heures après minuit, caféine fractionnée, totaux finis", () => {
    const r = computeNutrition(mk(1800, 8, { type: "ultra", distanceKm: 170 }));
    expect(r.plan.slots.some((s) => /J\+1/.test(s.clock))).toBe(true); expect(r.caffeine.doses).toHaveLength(3); expect(r.caffeine.totalMgKg).toBeCloseTo(1, 1);
    expect(r.carbs.gph).toBeLessThanOrEqual(75); expect(Number.isFinite(r.plan.totals.got.waterMl)).toBe(true); expect(r.plan.totals.target.carbsG).toBeCloseTo(r.carbs.totalG, 0);
  });
  it("canicule : apport plafonné à 800 ml/h et toujours sous les pertes, alerte de perte de masse", () => {
    const r = computeNutrition(mk(300, 38, { distanceKm: 40 })); expect(r.hydration.mlh).toBeLessThanOrEqual(800); expect(r.hydration.mlh).toBeLessThan(r.hydration.sweatLh * 1000);
    expect([...r.hydration.notices].some((n) => n.level !== "info" && /Perte de masse/.test(n.text))).toBe(true);
  });
  it("froid : sudation plancher, apport jamais supérieur aux pertes", () => { const r = computeNutrition(mk(240, -15)); expect(r.hydration.sweatLh).toBeGreaterThanOrEqual(0.25); expect(r.hydration.mlh).toBeLessThan(r.hydration.sweatLh * 1000); });
});

import { gapOf, shortfalls } from "../src/lib/nutrition/plan";
describe("objectifs non atteints", () => {
  it("écart et statut", () => {
    expect(gapOf("carbsG", 60, 40)).toMatchObject({ gap: 20, pct: 67, status: "short" });
    expect(gapOf("carbsG", 60, 20)).toMatchObject({ gap: 40, status: "missing" });
    expect(gapOf("carbsG", 60, 55)).toMatchObject({ status: "ok" }); // dans la tolérance de 10 %
    expect(gapOf("carbsG", 30, 24)).toMatchObject({ status: "ok" }); // 6 g : moins d'une demi-portion
    expect(gapOf("sodiumMg", 1000, 1500)).toMatchObject({ status: "over", gap: 0 });
    expect(gapOf("carbsG", 0, 0)).toMatchObject({ status: "ok", pct: 100 });
  });
  it("plan sans produit glucidique : manque total signalé ; prise par prise, retard cumulé", () => {
    const p = buildPlan({ durationMin: 180, distanceKm: 30, startTime: "08:00", intervalMin: 30, carbs: { gph: 60, ramp: [1] }, waterMlH: 500, sodiumMgH: 400, caffeineDoses: [], aid: [], products: [P({ id: "g", name: "Gel", carbsG: 25 })], productIds: [], drinkId: null, carryMl: null, refillAtAid: true });
    const s = shortfalls(p); expect(s.any).toBe(true); expect(s.totals.carbsG).toMatchObject({ target: 180, got: 0, status: "missing" }); expect(s.totals.waterMl.status).toBe("ok");
    expect(s.slots.every((x) => x.carbsG.behind)).toBe(true); expect(s.segments[0].sodiumMg.status).toBe("missing");
    const q = buildPlan({ durationMin: 180, distanceKm: 30, startTime: "08:00", intervalMin: 30, carbs: { gph: 60, ramp: [1] }, waterMlH: 500, sodiumMgH: 0, caffeineDoses: [], aid: [], products: [P({ id: "g", name: "Gel", carbsG: 25 })], productIds: ["g"], drinkId: null, carryMl: null, refillAtAid: true });
    const t = shortfalls(q); expect(t.totals.carbsG.status).toBe("ok"); expect(t.slots.filter((x) => x.carbsG.behind)).toHaveLength(0); expect(t.any).toBe(false);
  });
});
