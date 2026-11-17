import { NUTRITION } from "./constants";
import type { CaffeineDose, CaffeineStrategy, Notice, Sensitivity } from "./types";

/** Dose (mg) = poids (kg) × dose choisie (mg/kg). */
export const caffeineDoseMg = (weightKg: number, mgPerKg: number) => Math.round(weightKg * mgPerKg);

/** Quantité résiduelle (mg) à l'instant t (min) : Σ dose × 2^(−(t − tprise) / demi-vie), pour les prises déjà faites. */
export function residualMg(doses: Pick<CaffeineDose, "atMin" | "mg">[], tMin: number, halfLifeH: number) {
  return doses.reduce((s, d) => (tMin >= d.atMin ? s + d.mg * Math.pow(2, -(tMin - d.atMin) / 60 / halfLifeH) : s), 0);
}

/** Répartition proposée des prises (min depuis le départ, part de la dose totale). Hypothèse de planification, modifiable. */
export function defaultSchedule(durationMin: number): { atMin: number; share: number }[] {
  if (durationMin <= 120) return [{ atMin: -45, share: 1 }];
  if (durationMin <= 360) return [{ atMin: -45, share: 0.4 }, { atMin: Math.round(durationMin * 0.6 / 5) * 5, share: 0.6 }];
  return [0.5, 0.7, 0.85].map((f, i) => ({ atMin: Math.round(durationMin * f / 5) * 5, share: [0.35, 0.35, 0.3][i] }));
}

export interface CaffeineInput { weightKg: number; durationMin: number; strategy: CaffeineStrategy; customMgKg?: number | null; sensitivity: Sensitivity; habitualMgDay: number | null; halfLifeH?: number | null; doses?: CaffeineDose[] | null; startTime: string; bedtime?: string; newId?: () => string }
export interface CaffeineResult {
  mgPerKg: number; totalMg: number; totalMgKg: number; halfLifeH: number;
  doses: CaffeineDose[];
  /** Pic estimé et instant (min) ; quantité résiduelle à l'arrivée et au coucher. */
  peakMg: number; peakAtMin: number; atFinishMg: number; atBedMg: number | null;
  curve: { tMin: number; mg: number }[];
  notices: Notice[]; precautions: string[];
}

const toMin = (hhmm: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm); return m ? +m[1] * 60 + +m[2] : null; };

/** Module D — caféine. Stratégie prudente par défaut, doses modifiables, cumul et quantité résiduelle (demi-vie configurable). */
export function computeCaffeine(i: CaffeineInput): CaffeineResult {
  const C = NUTRITION.caffeine, notices: Notice[] = [];
  const halfLifeH = Math.min(C.halfLifeRange[1], Math.max(C.halfLifeRange[0], i.halfLifeH ?? C.halfLifeH));
  let mgPerKg = i.strategy === "personnalisee" ? Math.max(0, Math.min(C.maxMgKg, i.customMgKg ?? 0)) : C.strategyMgKg[i.strategy];
  if (i.sensitivity === "elevee" && mgPerKg > C.sensitiveCapMgKg && i.strategy !== "personnalisee") { mgPerKg = C.sensitiveCapMgKg; notices.push({ level: "info", text: `Sensibilité élevée : dose limitée à ${C.sensitiveCapMgKg} mg/kg.` }); }
  let doses: CaffeineDose[];
  if (i.doses && i.doses.length) doses = i.doses.map((d) => ({ ...d, mg: Math.max(0, Math.round(d.mg)) })).sort((a, b) => a.atMin - b.atMin);
  else { const total = caffeineDoseMg(i.weightKg, mgPerKg); let k = 0; doses = total > 0 ? defaultSchedule(i.durationMin).map((s) => ({ id: i.newId ? i.newId() : `c${k++}`, atMin: s.atMin, mg: Math.round(total * s.share) })) : []; }
  const totalMg = doses.reduce((s, d) => s + d.mg, 0), totalMgKg = Math.round((totalMg / i.weightKg) * 10) / 10;
  const from = Math.min(0, ...doses.map((d) => d.atMin)), start = toMin(i.startTime), bed = i.bedtime ? toMin(i.bedtime) : null;
  let bedRel: number | null = null;
  if (start != null && bed != null) { bedRel = bed - start; while (bedRel < i.durationMin) bedRel += 1440; }
  const to = Math.max(i.durationMin, bedRel ?? 0) + 60, curve: CaffeineResult["curve"] = [];
  for (let t = from; t <= to; t += 10) curve.push({ tMin: t, mg: Math.round(residualMg(doses, t, halfLifeH)) });
  const peak = curve.reduce((a, b) => (b.mg > a.mg ? b : a), { tMin: 0, mg: 0 });
  const atFinishMg = Math.round(residualMg(doses, i.durationMin, halfLifeH)), atBedMg = bedRel != null ? Math.round(residualMg(doses, bedRel, halfLifeH)) : null;
  for (const d of doses) {
    if (d.mg > C.singleDoseWarnMg || d.mg / i.weightKg > C.singleDoseWarnMgKg + 1e-9) notices.push({ level: "warn", text: `Prise de ${d.mg} mg (${(d.mg / i.weightKg).toFixed(1)} mg/kg) : au-delà de ${C.singleDoseWarnMg} mg ou ${C.singleDoseWarnMgKg} mg/kg en une prise, les effets indésirables deviennent plus fréquents.` });
  }
  if (totalMgKg > C.maxMgKg) notices.push({ level: "alert", text: `Cumul de ${totalMgKg} mg/kg : au-delà de ${C.maxMgKg} mg/kg, aucun bénéfice supplémentaire et des risques accrus (tachycardie, troubles digestifs, anxiété).` });
  if (totalMg > C.dailyWarnMg) notices.push({ level: "warn", text: `Cumul de ${totalMg} mg sur la journée, au-delà du repère de ${C.dailyWarnMg} mg/jour pour un adulte en bonne santé.` });
  if ((i.habitualMgDay ?? 0) < C.habitualThresholdMg && totalMg > 0) notices.push({ level: "warn", text: "Consommation habituelle faible : testez toujours votre stratégie à l'entraînement avant une course, en commençant par la dose la plus basse." });
  if (atBedMg != null && atBedMg > C.sleepWarnMg) notices.push({ level: "warn", text: `Environ ${atBedMg} mg encore présents à l'heure du coucher : sommeil probablement perturbé (récupération moins bonne).` });
  const precautions = [
    "Déconseillée en cas de trouble du rythme cardiaque, d'hypertension non contrôlée, d'anxiété, de grossesse ou d'allaitement, et avec certains médicaments : demandez un avis médical.",
    "Effets indésirables possibles : palpitations, tremblements, troubles digestifs, envie d'uriner, nervosité, insomnie.",
    "Additionnez toutes les sources : café, gels et boissons caféinés, comprimés, sodas.",
    "Ne testez jamais une nouvelle dose le jour de la course.",
  ];
  return { mgPerKg, totalMg, totalMgKg, halfLifeH, doses, peakMg: peak.mg, peakAtMin: peak.tMin, atFinishMg, atBedMg, curve, notices, precautions };
}
