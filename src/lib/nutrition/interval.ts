import { NUTRITION } from "./constants";
import { isCarbSource } from "./products";
import type { Product } from "./types";

/**
 * Intervalle entre deux prises, calculé (plus de saisie manuelle).
 *
 *   glucides à apporter par les produits (g/h) = objectif horaire − glucides de la boisson principale
 *   intervalle (min) = glucides d'une prise (g) ÷ glucides à apporter (g/h) × 60
 *
 * Exemple : objectif 60 g/h, gel de 30 g, boisson sans glucides → 30 ÷ 60 × 60 = une prise toutes les 30 min.
 * Arrondi à 5 min si l'apport réel reste à ±10 % de l'objectif, sinon à la minute. Bornes : 10 à 90 min (sous 10 min,
 * plusieurs portions par prise). Pour boire régulièrement, le planning garde un point toutes les 20 min au plus :
 * la prise de glucides tombe alors une fois sur deux (ou sur trois…).
 */
export interface IntervalResult {
  /** minutes entre deux prises de glucides */
  carbEveryMin: number;
  /** minutes entre deux points du planning (boire), ≤ carbEveryMin */
  stepMin: number;
  /** portions de produit par prise */
  portions: number;
  /** glucides d'une portion (moyenne des produits choisis), null sans produit */
  servingG: number | null;
  /** g/h apportés par la boisson principale et à apporter par les produits */
  drinkGph: number; solidGph: number;
  /** g/h obtenus avec l'intervalle arrondi (produits + boisson) */
  effectiveGph: number;
  basis: "produits" | "boisson" | "sans-produit" | "aucun-objectif";
}

const MIN = 10, MAX = 90, DRINK_STEP = NUTRITION.plan.intervalMin;

export function autoInterval(i: { gph: number; waterMlH: number; products: Product[]; productIds: string[]; drinkId: string | null }): IntervalResult {
  const chosen = i.products.filter((p) => i.productIds.includes(p.id));
  const drink = i.drinkId ? i.products.find((p) => p.id === i.drinkId && p.category === "boisson" && p.volumeMl > 0) ?? null : null;
  const drinkGph = drink ? Math.min(i.gph, (drink.carbsG * i.waterMlH) / drink.volumeMl) : 0;
  const solidGph = Math.max(0, i.gph - drinkGph);
  const carb = chosen.filter((p) => isCarbSource(p) && p.caffeineMg === 0);
  const pool = carb.length ? carb : chosen.filter(isCarbSource);
  const servingG = pool.length ? pool.reduce((s, p) => s + p.carbsG, 0) / pool.length : null;
  const base = { drinkGph: Math.round(drinkGph), solidGph: Math.round(solidGph), servingG: servingG != null ? Math.round(servingG * 10) / 10 : null };
  if (i.gph <= 0) return { ...base, carbEveryMin: DRINK_STEP, stepMin: DRINK_STEP, portions: 0, effectiveGph: 0, basis: "aucun-objectif" };
  if (solidGph < 1) return { ...base, carbEveryMin: DRINK_STEP, stepMin: DRINK_STEP, portions: 0, effectiveGph: Math.round(drinkGph), basis: "boisson" };
  if (servingG == null) return { ...base, carbEveryMin: DRINK_STEP, stepMin: DRINK_STEP, portions: 0, effectiveGph: Math.round(i.gph), basis: "sans-produit" };
  const raw = (servingG / solidGph) * 60;
  const portions = raw < MIN ? Math.ceil(MIN / raw) : 1;
  const exact = Math.min(MAX, raw * portions);
  const r5 = Math.max(MIN, Math.round(exact / 5) * 5), eff5 = (servingG * portions * 60) / r5;
  const every = Math.abs(eff5 - solidGph) / solidGph <= 0.1 ? r5 : Math.max(MIN, Math.min(MAX, Math.round(exact)));
  const stepMin = every <= DRINK_STEP ? every : every / Math.ceil(every / DRINK_STEP);
  return { ...base, carbEveryMin: every, stepMin, portions, effectiveGph: Math.round((servingG * portions * 60) / every + drinkGph), basis: "produits" };
}
