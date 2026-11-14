import { NUTRITION } from "./constants";
import type { Intensity, Notice, Reliability, Sky, SweatProfile, SweatTest } from "./types";

/** Débit de sudation mesuré (L/h) = (poids avant − poids après + liquide bu − urines) / durée. 1 kg perdu ≈ 1 L d'eau. */
export function measuredSweatRate(t: SweatTest): { lh: number | null; error?: string } {
  if (t.preKg == null || t.postKg == null || t.fluidL == null || t.durationMin == null) return { lh: null, error: "Renseignez poids avant, poids après, liquide bu et durée." };
  if (t.durationMin < 30) return { lh: null, error: "Le test doit durer au moins 30 minutes pour être fiable." };
  const lh = (t.preKg - t.postKg + t.fluidL - (t.urineL ?? 0)) / (t.durationMin / 60);
  const [lo, hi] = NUTRITION.hydration.measuredRange;
  if (!Number.isFinite(lh) || lh < lo || lh > hi) return { lh: null, error: `Résultat incohérent (${Number.isFinite(lh) ? lh.toFixed(2) : "?"} L/h, plage plausible ${lo} à ${hi} L/h) : vérifiez les pesées (en kg) et les volumes (en litres).` };
  return { lh: Math.round(lh * 100) / 100 };
}

export interface SweatEstimateInput { weightKg: number; tempC: number; humidityPct: number; intensity: Intensity; sky: Sky; sweat: SweatProfile }
/**
 * Estimation du débit de sudation sans mesure (hypothèse de calcul, fiabilité faible) : débit de référence du profil,
 * ajusté selon la température, l'humidité, le soleil, l'intensité et le poids (puissance 0,75).
 */
export function estimateSweatRate(i: SweatEstimateInput) {
  const H = NUTRITION.hydration;
  let lh = H.baseSweatLh[i.sweat];
  lh += i.tempC >= H.refTempC ? (i.tempC - H.refTempC) * H.perDegAbove : -(H.refTempC - i.tempC) * H.perDegBelow;
  if (i.tempC > H.humidityFromC && i.humidityPct > 50) lh += ((i.humidityPct - 50) / 100) * H.humidityCoef;
  if (i.sky === "soleil") lh += H.sunExtra;
  lh *= H.intensityFactor[i.intensity] * Math.pow(i.weightKg / H.refWeightKg, H.weightExponent);
  return Math.round(Math.max(H.minSweatLh, Math.min(H.maxSweatLh, lh)) * 100) / 100;
}

export interface HydrationInput { weightKg: number; durationMin: number; sweatLh: number; reliability: Reliability; overrideMlH?: number | null }
export interface HydrationResult {
  sweatLh: number; reliability: Reliability; sweatRange: [number, number];
  /** Objectif d'apport (ml/h) et total (ml). */
  mlh: number; totalMl: number;
  /** Part des pertes compensée, perte de masse prévue (kg et % du poids). */
  replacePct: number; lossKg: number; lossPct: number;
  optional: boolean; source: "calcul" | "saisie";
  notices: Notice[];
}

/**
 * Module B — hydratation. Objectif = part des pertes (65 % par défaut, jamais 100 %), borné entre 300 et 800 ml/h,
 * et toujours inférieur au débit de sudation (prévention de la surhydratation et de l'hyponatrémie).
 */
export function computeHydration(i: HydrationInput): HydrationResult {
  const H = NUTRITION.hydration, notices: Notice[] = [], sweatMlH = i.sweatLh * 1000;
  let mlh = Math.min(H.maxIntakeMlH, Math.max(H.minIntakeMlH, sweatMlH * H.replaceFraction));
  mlh = Math.min(mlh, sweatMlH * H.maxReplaceFraction);
  mlh = Math.round(mlh / 10) * 10;
  let source: HydrationResult["source"] = "calcul";
  if (i.overrideMlH != null && Number.isFinite(i.overrideMlH)) {
    source = "saisie"; const o = Math.max(0, Math.min(H.hardMaxIntakeMlH, i.overrideMlH));
    if (o >= sweatMlH) notices.push({ level: "alert", text: `Apport saisi (${o} ml/h) supérieur ou égal à vos pertes estimées (${Math.round(sweatMlH)} ml/h) : risque de surhydratation et d'hyponatrémie (baisse dangereuse du sodium sanguin). Réduisez-le.` });
    else if (o > H.maxIntakeMlH) notices.push({ level: "warn", text: `Apport saisi au-dessus du plafond de sécurité habituel (${H.maxIntakeMlH} ml/h) : à réserver aux fortes chaleurs, avec un débit de sudation mesuré.` });
    if (i.overrideMlH > H.hardMaxIntakeMlH) notices.push({ level: "warn", text: `Valeur ramenée au maximum accepté (${H.hardMaxIntakeMlH} ml/h).` });
    mlh = o;
  }
  const hours = i.durationMin / 60, optional = i.durationMin < H.optionalBelowMin;
  const lossKg = Math.max(0, (sweatMlH - mlh) / 1000 * hours), lossPct = (lossKg / i.weightKg) * 100;
  if (lossPct > H.lossAlertPct) notices.push({ level: "alert", text: `Perte de masse prévue ≈ ${lossPct.toFixed(1)} % (${lossKg.toFixed(1)} kg) : risque marqué de déshydratation. Réduisez l'intensité, adaptez l'allure à la chaleur et buvez selon la soif aux ravitaillements, sans dépasser vos pertes.` });
  else if (lossPct > H.lossWarnPct) notices.push({ level: "warn", text: `Perte de masse prévue ≈ ${lossPct.toFixed(1)} % : au-delà de 2 %, la performance baisse. Buvez régulièrement selon la soif ; le plafond de ${H.maxIntakeMlH} ml/h reste une limite de sécurité.` });
  if (mlh > sweatMlH * 0.95) notices.push({ level: "alert", text: "L'apport prévu est presque égal aux pertes : ne buvez pas au-delà de la soif, ne prenez jamais de poids pendant l'effort." });
  if (i.reliability === "estimee") notices.push({ level: "info", text: `Débit de sudation estimé (fiabilité faible, ± ${Math.round(H.estimateUncertainty * 100)} %). Un test de pesée avant et après une sortie représentative le rend fiable.` });
  if (optional) notices.push({ level: "info", text: "Effort de moins d'une heure : boire est facultatif, selon la soif et la chaleur." });
  const u = i.reliability === "estimee" ? H.estimateUncertainty : 0.1;
  return { sweatLh: i.sweatLh, reliability: i.reliability, sweatRange: [Math.round(i.sweatLh * (1 - u) * 100) / 100, Math.round(i.sweatLh * (1 + u) * 100) / 100], mlh, totalMl: Math.round(mlh * hours), replacePct: Math.round((mlh / sweatMlH) * 100), lossKg: Math.round(lossKg * 10) / 10, lossPct: Math.round(lossPct * 10) / 10, optional, source, notices };
}
