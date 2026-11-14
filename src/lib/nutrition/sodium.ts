import { NUTRITION } from "./constants";
import type { Notice, Reliability, SaltProfile } from "./types";

/** Conversion d'une mesure de sodium de la sueur en mg/L (1 mmol/L de sodium = 23 mg/L). */
export function sweatSodiumMgL(m: { value: number | null; unit: "mgL" | "mmolL" } | null, profile: SaltProfile): { mgL: number; reliability: Reliability; error?: string } {
  const S = NUTRITION.sodium;
  if (m && m.value != null && Number.isFinite(m.value)) {
    const mgL = m.unit === "mmolL" ? m.value * S.mgPerMmol : m.value;
    const [lo, hi] = S.measuredRange;
    if (mgL >= lo && mgL <= hi) return { mgL: Math.round(mgL), reliability: "mesuree" };
    return { mgL: S.sweatMgL[profile], reliability: "estimee", error: `Mesure incohérente (${Math.round(mgL)} mg/L, plage plausible ${lo} à ${hi} mg/L) : vérifiez l'unité (mg/L ou mmol/L). Valeur par défaut utilisée.` };
  }
  return { mgL: S.sweatMgL[profile], reliability: "estimee" };
}

export interface SodiumInput { sweatLh: number; sweatMgL: number; durationMin: number; reliability: Reliability; overrideMgH?: number | null }
export interface SodiumResult {
  /** Pertes (mg/h) = débit de sueur (L/h) × concentration (mg/L) ; total sur la course. */
  lossMgH: number; lossTotalMg: number;
  /** Objectif d'apport (mg/h) et total : une part des pertes, plafonnée. */
  mgh: number; totalMg: number; replacePct: number;
  sweatMgL: number; reliability: Reliability; optional: boolean; source: "calcul" | "saisie";
  notices: Notice[];
}

/** Module C — sodium. Ne pas confondre la concentration d'une boisson (mg/L) et la quantité à absorber (mg/h). */
export function computeSodium(i: SodiumInput): SodiumResult {
  const S = NUTRITION.sodium, notices: Notice[] = [];
  const lossMgH = Math.round(i.sweatLh * i.sweatMgL), hours = i.durationMin / 60;
  const f = (S.replaceFraction.find((x) => i.durationMin < x.maxMin) ?? S.replaceFraction[S.replaceFraction.length - 1]).f;
  let mgh = Math.round(Math.min(S.maxTargetMgH, lossMgH * f) / 10) * 10;
  let source: SodiumResult["source"] = "calcul";
  if (i.overrideMgH != null && Number.isFinite(i.overrideMgH)) {
    source = "saisie"; mgh = Math.max(0, Math.round(i.overrideMgH));
    if (mgh > S.warnMgH) notices.push({ level: "alert", text: `Apport saisi très élevé (${mgh} mg/h) : risque de troubles digestifs, de soif intense et d'élévation de la tension. À n'envisager qu'avec un avis médical et une mesure de votre sueur.` });
    else if (mgh > lossMgH) notices.push({ level: "warn", text: `Apport saisi (${mgh} mg/h) supérieur à vos pertes estimées (${lossMgH} mg/h) : inutile, réduisez-le.` });
  }
  if (f === 0 && source === "calcul") notices.push({ level: "info", text: "Effort de moins d'1 h 30 : un apport de sodium n'est généralement pas nécessaire ; l'alimentation habituelle suffit." });
  if (i.reliability === "estimee") notices.push({ level: "info", text: `Concentration de sodium de la sueur estimée (${i.sweatMgL} mg/L). Elle varie d'un facteur 5 entre individus : une analyse de sueur rend le calcul fiable.` });
  notices.push({ level: "info", text: "Hyponatrémie : le principal risque est de trop boire, pas de manquer de sel. Le sodium ne protège pas d'une surhydratation." });
  return { lossMgH, lossTotalMg: Math.round(lossMgH * hours), mgh, totalMg: Math.round(mgh * hours), replacePct: lossMgH ? Math.round((mgh / lossMgH) * 100) : 0, sweatMgL: i.sweatMgL, reliability: i.reliability, optional: mgh === 0, source, notices };
}

/** Concentration d'une boisson (mg/L) à partir du sodium d'une portion et de son volume. */
export const drinkConcentrationMgL = (sodiumMg: number, volumeMl: number) => (volumeMl > 0 ? Math.round((sodiumMg / volumeMl) * 1000) : 0);
