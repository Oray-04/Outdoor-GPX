/**
 * Constantes scientifiques et paramètres du planificateur nutritionnel.
 * Tout seuil ou coefficient utilisé par le moteur est ici : on peut les ajuster sans toucher aux calculs ni à l'interface.
 * Chaque valeur indique si elle vient d'une recommandation publiée (« établi ») ou d'une hypothèse de calcul (« hypothèse »),
 * voir `references.ts`.
 */
export const NUTRITION = {
  carbs: {
    /** Repères par durée d'effort (g/h). Établi : Jeukendrup 2014 ; Thomas et al. 2016 (position ACSM/AND/DC). */
    bands: [
      { maxMin: 45, min: 0, max: 0, label: "Moins de 45 min : aucun apport nécessaire" },
      { maxMin: 75, min: 0, max: 30, optional: true, label: "45 à 75 min : petites quantités facultatives (ou rinçage de bouche)" },
      { maxMin: 150, min: 30, max: 60, label: "1 h 15 à 2 h 30 : 30 à 60 g/h" },
      { maxMin: Infinity, min: 60, max: 90, label: "Plus de 2 h 30 : 60 à 90 g/h selon l'entraînement digestif" },
    ],
    /** Position dans la fourchette selon l'intensité (0 = bas, 1 = haut). Hypothèse. */
    intensityPos: { facile: 0.3, moderee: 0.5, soutenue: 0.7, elevee: 0.85 },
    /** Plafonds (g/h) : habitude de consommer pendant l'effort, tolérance digestive, niveau. 90 g/h exige les trois au plus haut. Hypothèse prudente. */
    capByHabit: { aucune: 45, occasionnelle: 60, reguliere: 75, entrainee: 90 },
    capByTolerance: { faible: 45, moyenne: 75, bonne: 90 },
    capByLevel: { debutant: 60, intermediaire: 75, confirme: 90, elite: 90 },
    /** Valeur maximale acceptée même en saisie manuelle (g/h). */
    hardMax: 120,
    /** Montée progressive pour une tolérance faible ou moyenne : part de l'objectif heure par heure. Hypothèse. */
    ramp: { faible: [0.6, 0.85, 1], moyenne: [0.85, 1], bonne: [1] },
    round: 5,
  },
  hydration: {
    /** Débit de sudation de référence (L/h) à 15 °C, 50 % d'humidité, intensité modérée, 70 kg. Fourchette observée 0,3–2,4 L/h (Baker 2017 ; Barnes 2019). Hypothèse de calcul. */
    baseSweatLh: { faible: 0.5, moyen: 0.8, eleve: 1.1, inconnu: 0.8 },
    refTempC: 15, perDegAbove: 0.03, perDegBelow: 0.015,
    /** Humidité : supplément au-delà de 50 % quand il fait plus de 18 °C (L/h pour +100 % d'humidité). Hypothèse. */
    humidityCoef: 0.3, humidityFromC: 18,
    intensityFactor: { facile: 0.75, moderee: 1, soutenue: 1.15, elevee: 1.3 },
    sunExtra: 0.08, refWeightKg: 70, weightExponent: 0.75,
    minSweatLh: 0.25, maxSweatLh: 2.5,
    /** Part des pertes compensée par défaut : jamais 100 %. Établi (principe) : Sawka et al. 2007 (ACSM) ; Hew-Butler et al. 2015. Valeur : hypothèse. */
    replaceFraction: 0.65, maxReplaceFraction: 0.9,
    /** Bornes de sécurité de l'apport horaire (ml/h). Plafond contre la surhydratation : hypothèse prudente (repère fréquent 400–800 ml/h). */
    minIntakeMlH: 300, maxIntakeMlH: 800, hardMaxIntakeMlH: 1000,
    /** Perte de masse au-delà de laquelle la performance se dégrade. Établi : Sawka et al. 2007 (> 2 %). */
    lossWarnPct: 2, lossAlertPct: 4,
    /** En dessous de cette durée, boire est facultatif. Hypothèse. */
    optionalBelowMin: 60,
    /** Fourchette d'incertitude d'un débit estimé (± part). Hypothèse. */
    estimateUncertainty: 0.4,
    /** Débit mesuré plausible (L/h). */
    measuredRange: [0.1, 3.5] as [number, number],
  },
  sodium: {
    /** Concentration de sodium de la sueur par défaut (mg/L). Moyenne observée ≈ 38 mmol/L ≈ 870 mg/L, fourchette 10–90 mmol/L (Baker 2017). */
    sweatMgL: { faible: 500, moyen: 900, eleve: 1400, inconnu: 900 },
    mgPerMmol: 23,
    measuredRange: [200, 3000] as [number, number],
    /** Part des pertes à compenser selon la durée. Hypothèse (pas de consensus chiffré). */
    replaceFraction: [{ maxMin: 90, f: 0 }, { maxMin: 180, f: 0.4 }, { maxMin: Infinity, f: 0.6 }],
    /** Plafond de l'objectif horaire (mg/h) et seuil d'alerte en saisie. Hypothèse prudente. */
    maxTargetMgH: 1000, warnMgH: 1500,
    /** Concentration d'une boisson au-delà de laquelle elle devient très salée (mg/L). Hypothèse. */
    salty_drink_mgL: 1500,
  },
  caffeine: {
    /** Doses selon la stratégie (mg/kg). Établi : 3–6 mg/kg efficaces, effets possibles dès ~2 mg/kg (Guest et al. 2021, ISSN). Choix prudent par défaut. */
    strategyMgKg: { aucune: 0, prudente: 1, moderee: 2, standard: 3 },
    /** Seuils de sécurité. Établi : EFSA 2015 (dose unique ≤ 200 mg / ≈ 3 mg/kg, ≤ 400 mg/jour chez l'adulte en bonne santé). */
    singleDoseWarnMg: 200, singleDoseWarnMgKg: 3, dailyWarnMg: 400, maxMgKg: 6,
    /** Demi-vie moyenne (h), très variable (2 à 10 h). Établi (ordre de grandeur) : EFSA 2015 ; Guest et al. 2021. */
    halfLifeH: 5, halfLifeRange: [2, 10] as [number, number],
    /** Sensibilité élevée : plafond de la stratégie (mg/kg). Hypothèse prudente. */
    sensitiveCapMgKg: 1.5,
    /** Quantité résiduelle au coucher au-delà de laquelle le sommeil risque d'être perturbé (mg). Hypothèse. */
    sleepWarnMg: 50,
    /** Consommation habituelle en dessous de laquelle on est « non habitué » (mg/jour). Hypothèse. */
    habitualThresholdMg: 100,
  },
  plan: {
    /** Intervalle entre deux prises par défaut (min). */
    intervalMin: 20,
    /** Vitesse plausible (km/h) pour les contrôles de cohérence. */
    speedRange: [2, 25] as [number, number],
  },
} as const;

export type NutritionConstants = typeof NUTRITION;
