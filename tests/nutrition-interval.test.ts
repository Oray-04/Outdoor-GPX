import { describe, it, expect } from "vitest";
import { autoInterval } from "../src/lib/nutrition/interval";
import { computeNutrition } from "../src/lib/nutrition/engine";
import type { PlanInput, Product } from "../src/lib/nutrition/types";

const prod = (id: string, category: Product["category"], carbsG: number, o: Partial<Product> = {}): Product => ({ id, name: id, brand: "", category, carbsG, sodiumMg: 0, volumeMl: 0, caffeineMg: 0, stock: null, ...o });
const gel30 = prod("gel30", "gel", 30), gel25 = prod("gel25", "gel", 25), chew10 = prod("chew10", "pate", 10), bar40 = prod("bar40", "barre", 40);
const drink = prod("iso", "boisson", 30, { volumeMl: 500, sodiumMg: 300 });
const ai = (gph: number, products: Product[], o: { drinkId?: string; waterMlH?: number } = {}) => autoInterval({ gph, waterMlH: o.waterMlH ?? 500, products: [...products, drink], productIds: products.map((p) => p.id).concat(o.drinkId ? [o.drinkId] : []), drinkId: o.drinkId ?? null });

describe("intervalle entre les prises : calculé, plus de saisie", () => {
  it("objectif 60 g/h, gel de 30 g → une prise toutes les 30 min ; on boit entre deux (toutes les 15 min)", () => {
    const r = ai(60, [gel30]); expect(r).toMatchObject({ carbEveryMin: 30, stepMin: 15, portions: 1, servingG: 30, effectiveGph: 60, basis: "produits" });
  });
  it("objectif 75 g/h, gel de 25 g → toutes les 20 min", () => { expect(ai(75, [gel25])).toMatchObject({ carbEveryMin: 20, stepMin: 20, effectiveGph: 75 }); });
  it("la boisson sucrée est déduite : 30 g/h par la boisson, reste 30 g/h → un gel de 30 g par heure, boire toutes les 20 min", () => {
    const r = ai(60, [gel30], { drinkId: "iso" }); expect(r).toMatchObject({ drinkGph: 30, solidGph: 30, carbEveryMin: 60, stepMin: 20, effectiveGph: 60 });
  });
  it("petites portions : plusieurs par prise, jamais moins de 10 min entre deux prises ; l'apport reste proche de l'objectif", () => {
    const r = ai(90, [chew10]); expect(r.portions).toBe(2); expect(r.carbEveryMin).toBeGreaterThanOrEqual(10); expect(Math.abs(r.effectiveGph - 90) / 90).toBeLessThanOrEqual(0.1);
  });
  it("arrondi à 5 min seulement si l'apport reste à ±10 % de l'objectif", () => {
    const r = ai(70, [prod("g22", "gel", 22)]); // 22 / 70 × 60 = 18,9 min → 20 min donnerait 66 g/h (−6 %) : accepté
    expect(r.carbEveryMin).toBe(20); expect(r.effectiveGph).toBe(66);
    const q = ai(50, [bar40]); // 48 min → 50 min (48 g/h, −4 %)
    expect(q.carbEveryMin).toBe(50); expect(q.stepMin).toBeCloseTo(50 / 3, 5);
  });
  it("produits différents : portion moyenne ; produits caféinés réservés à la caféine s'il y a d'autres produits", () => {
    expect(ai(60, [gel30, bar40]).servingG).toBe(35);
    expect(ai(60, [gel30, prod("cafgel", "gel", 25, { caffeineMg: 75 })]).servingG).toBe(30);
  });
  it("sans produit, boisson suffisante ou pas d'objectif : rythme de boisson par défaut, explication adaptée", () => {
    expect(ai(60, []).basis).toBe("sans-produit");
    expect(ai(30, [gel30], { drinkId: "iso" }).basis).toBe("boisson");
    expect(ai(0, [gel30])).toMatchObject({ basis: "aucun-objectif", portions: 0 });
  });
});

describe("plan réel : les prises suivent l'intervalle annoncé et l'objectif horaire", () => {
  const input = (o: Partial<PlanInput["prefs"]> = {}): PlanInput => ({
    athlete: { weightKg: 68, level: "intermediaire", experienceYears: 4, tolerance: "bonne", habit: "reguliere" },
    race: { type: "trail", name: "Test", distanceKm: 30, gainM: 1000, durationMin: 240, intensity: "moderee", startTime: "08:00" },
    weather: { tempC: 18, humidityPct: 50, sky: "couvert", sweat: "moyen" },
    prefs: { carbOverrideGph: 60, intakeOverrideMlH: 500, sodiumOverrideMgH: null, saltProfile: "inconnu", sweatTest: null, sweatSodium: null, caffeine: { strategy: "aucune", customMgKg: null, sensitivity: "normale", habitualMgDay: null, doses: null }, productIds: ["gel30"], drinkId: null, carryMl: null, refillAtAid: true, ...o },
    aid: [], products: [gel30, drink],
  });
  it("60 g/h avec des gels de 30 g : un gel toutes les 30 min, 2 gels par heure, total ≈ objectif", () => {
    const r = computeNutrition(input());
    expect(r.interval).toMatchObject({ carbEveryMin: 30, stepMin: 15 });
    const run = r.plan.slots.filter((s) => s.kind === "course"), eat = run.filter((s) => s.items.length).map((s) => s.tMin);
    const gaps = eat.slice(1).map((t, k) => t - eat[k]); expect(new Set(gaps)).toEqual(new Set([30]));
    const gels = r.plan.totals.items.find((x) => x.productId === "gel30")!.qty; expect(gels).toBeGreaterThanOrEqual(7); expect(gels).toBeLessThanOrEqual(8); // 240 min × 60 g/h = 240 g → 8 gels
    expect(Math.abs(r.plan.totals.got.carbsG - r.carbs.totalG)).toBeLessThanOrEqual(30); // au plus une portion d'écart
    expect(run.every((s) => s.plainWaterMl > 0)).toBe(true); // boire à chaque point (toutes les 15 min)
  });
  it("les anciens réglages (intervalle manuel, préférences alimentaires, demi-vie, coucher) sont ignorés sans erreur", () => {
    const old = input({ intervalMin: 45, foodNotes: "sans gluten", caffeine: { strategy: "prudente", customMgKg: null, sensitivity: "normale", habitualMgDay: 100, halfLifeH: 8, bedtime: "22:00", doses: null } });
    const r = computeNutrition(old); expect(r.interval.carbEveryMin).toBe(30); expect(r.caffeine.notices.some((n) => /coucher|demi-vie/i.test(n.text))).toBe(false);
  });
});
