import { NUTRITION } from "./constants";
import { computeCarbs, type CarbResult } from "./carbs";
import { computeHydration, estimateSweatRate, measuredSweatRate, type HydrationResult } from "./hydration";
import { computeSodium, sweatSodiumMgL, type SodiumResult } from "./sodium";
import { computeCaffeine, type CaffeineResult } from "./caffeine";
import { buildPlan, type PlanResult } from "./plan";
import { autoInterval, type IntervalResult } from "./interval";
import type { Level, Notice, PlanInput, RaceType } from "./types";

/** Erreurs de saisie bloquantes, par étape du parcours et par champ. */
export interface FieldError { step: 1 | 2 | 3 | 4; field: string; text: string }

const inRange = (v: number | null | undefined, lo: number, hi: number) => v != null && Number.isFinite(v) && v >= lo && v <= hi;

/** Durée suggérée (min) à partir de la distance et du dénivelé : km-effort (km + D+/100) à une allure selon le niveau. Estimation à confirmer. */
export function suggestDurationMin(type: RaceType, distanceKm: number | null, gainM: number | null, level: Level): number | null {
  if (!distanceKm || distanceKm <= 0) return null;
  const effortKm = distanceKm + (type === "route" ? 0 : (gainM ?? 0) / 100);
  const kmh = { route: { debutant: 8.5, intermediaire: 10, confirme: 12, elite: 16 }, trail: { debutant: 6, intermediaire: 7, confirme: 8.5, elite: 10.5 }, ultra: { debutant: 5, intermediaire: 6, confirme: 7.2, elite: 9 } }[type][level];
  return Math.round((effortKm / kmh) * 60 / 5) * 5;
}

/** Contrôle des champs obligatoires, des plages et de la cohérence. Aucune valeur manquante n'est remplacée par une valeur fictive. */
export function validateInput(i: PlanInput): { errors: FieldError[]; warnings: Notice[] } {
  const e: FieldError[] = [], w: Notice[] = [];
  if (!inRange(i.athlete.weightKg, 30, 200)) e.push({ step: 1, field: "weightKg", text: "Poids : entre 30 et 200 kg." });
  if (i.athlete.experienceYears != null && !inRange(i.athlete.experienceYears, 0, 70)) e.push({ step: 1, field: "experienceYears", text: "Expérience : entre 0 et 70 ans." });
  if (!inRange(i.race.durationMin, 10, 72 * 60)) e.push({ step: 2, field: "durationMin", text: "Durée estimée : entre 10 min et 72 h." });
  if (i.race.distanceKm != null && !inRange(i.race.distanceKm, 0.5, 400)) e.push({ step: 2, field: "distanceKm", text: "Distance : entre 0,5 et 400 km." });
  if (i.race.gainM != null && !inRange(i.race.gainM, 0, 30000)) e.push({ step: 2, field: "gainM", text: "Dénivelé : entre 0 et 30 000 m." });
  if (!/^\d{1,2}:\d{2}$/.test(i.race.startTime)) e.push({ step: 2, field: "startTime", text: "Heure de départ au format hh:mm." });
  if (!inRange(i.weather.tempC, -20, 50)) e.push({ step: 3, field: "tempC", text: "Température : entre −20 et 50 °C." });
  if (!inRange(i.weather.humidityPct, 0, 100)) e.push({ step: 3, field: "humidityPct", text: "Humidité : entre 0 et 100 %." });
  if (i.prefs.carryMl != null && !inRange(i.prefs.carryMl, 100, 5000)) e.push({ step: 4, field: "carryMl", text: "Liquide transporté : entre 100 et 5 000 ml." });
  if (i.prefs.carbOverrideGph != null && !inRange(i.prefs.carbOverrideGph, 0, 200)) e.push({ step: 4, field: "carbOverrideGph", text: "Objectif glucidique : entre 0 et 200 g/h (plafonné à 120)." });
  if (i.race.distanceKm && i.race.durationMin) {
    const kmh = i.race.distanceKm / (i.race.durationMin / 60), [lo, hi] = NUTRITION.plan.speedRange;
    if (kmh > hi) w.push({ level: "warn", text: `Vitesse moyenne de ${kmh.toFixed(1)} km/h : vérifiez la distance et la durée.` });
    if (kmh < lo && i.race.type !== "ultra") w.push({ level: "warn", text: `Vitesse moyenne de ${kmh.toFixed(1)} km/h, très lente : vérifiez la durée.` });
  }
  if (i.race.type === "route" && (i.race.gainM ?? 0) > 1500) w.push({ level: "info", text: "Fort dénivelé pour une course sur route : le type « trail » donnerait une estimation de durée plus juste." });
  return { errors: e, warnings: w };
}

export interface NutritionResult { interval: IntervalResult; carbs: CarbResult; hydration: HydrationResult; sodium: SodiumResult; caffeine: CaffeineResult; plan: PlanResult; warnings: Notice[]; sweatError?: string; sodiumError?: string }

/** Calcul complet : quatre modules, puis plan de course. Lève une erreur si la saisie n'est pas valide (à appeler après `validateInput`). */
export function computeNutrition(i: PlanInput, newId?: () => string): NutritionResult {
  const v = validateInput(i); if (v.errors.length) throw new Error(v.errors.map((x) => x.text).join(" "));
  const weightKg = i.athlete.weightKg!, durationMin = i.race.durationMin!;
  const carbs = computeCarbs({ durationMin, intensity: i.race.intensity, level: i.athlete.level, tolerance: i.athlete.tolerance, habit: i.athlete.habit, overrideGph: i.prefs.carbOverrideGph });
  const test = i.prefs.sweatTest ? measuredSweatRate(i.prefs.sweatTest) : null, measured = test?.lh ?? null;
  const sweatLh = measured ?? estimateSweatRate({ weightKg, tempC: i.weather.tempC!, humidityPct: i.weather.humidityPct!, intensity: i.race.intensity, sky: i.weather.sky, sweat: i.weather.sweat });
  const hydration = computeHydration({ weightKg, durationMin, sweatLh, reliability: measured != null ? "mesuree" : "estimee", overrideMlH: i.prefs.intakeOverrideMlH });
  if (measured != null && i.weather.tempC != null) hydration.notices.push({ level: "info", text: "Débit de sudation mesuré : il vaut pour des conditions proches de celles du test (température, intensité). Refaites un test par temps chaud si la course l'est." });
  const na = sweatSodiumMgL(i.prefs.sweatSodium, i.prefs.saltProfile);
  const sodium = computeSodium({ sweatLh, sweatMgL: na.mgL, durationMin, reliability: na.reliability, overrideMgH: i.prefs.sodiumOverrideMgH });
  const c = i.prefs.caffeine;
  const caffeine = computeCaffeine({ weightKg, durationMin, strategy: c.strategy, customMgKg: c.customMgKg, sensitivity: c.sensitivity, habitualMgDay: c.habitualMgDay, doses: c.doses, startTime: i.race.startTime, newId });
  // intervalle entre les prises calculé à partir de l'objectif horaire et des produits choisis (plus de saisie)
  const interval = autoInterval({ gph: carbs.gph, waterMlH: hydration.mlh, products: i.products, productIds: i.prefs.productIds, drinkId: i.prefs.drinkId });
  const plan = buildPlan({ durationMin, distanceKm: i.race.distanceKm, startTime: i.race.startTime, intervalMin: interval.stepMin, carbs: { gph: carbs.gph, ramp: carbs.ramp }, waterMlH: hydration.mlh, sodiumMgH: sodium.mgh, caffeineDoses: caffeine.doses, aid: i.aid, products: i.products, productIds: i.prefs.productIds, drinkId: i.prefs.drinkId, carryMl: i.prefs.carryMl, refillAtAid: i.prefs.refillAtAid });
  return { interval, carbs, hydration, sodium, caffeine, plan, warnings: v.warnings, sweatError: test?.error, sodiumError: na.error };
}
