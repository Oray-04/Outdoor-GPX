/**
 * Références scientifiques du planificateur, et distinction entre recommandations établies et hypothèses de calcul.
 * Affichées dans l'outil et dans la fiche PDF.
 */
export const REFERENCES = [
  { id: "thomas2016", text: "Thomas D.T., Erdman K.A., Burke L.M. Position of the Academy of Nutrition and Dietetics, Dietitians of Canada, and the American College of Sports Medicine: Nutrition and Athletic Performance. Med Sci Sports Exerc, 2016." },
  { id: "jeukendrup2014", text: "Jeukendrup A. A step towards personalized sports nutrition: carbohydrate intake during exercise. Sports Med, 2014." },
  { id: "sawka2007", text: "Sawka M.N. et al. American College of Sports Medicine position stand: Exercise and fluid replacement. Med Sci Sports Exerc, 2007." },
  { id: "hewbutler2015", text: "Hew-Butler T. et al. Statement of the Third International Exercise-Associated Hyponatremia Consensus Development Conference. Clin J Sport Med, 2015." },
  { id: "baker2017", text: "Baker L.B. Sweating rate and sweat sodium concentration in athletes: a review of methodology and intra/interindividual variability. Sports Med, 2017." },
  { id: "barnes2019", text: "Barnes K.A. et al. Normative data for sweating rate, sweat sodium concentration, and sweat sodium loss in athletes. J Sports Sci, 2019." },
  { id: "guest2021", text: "Guest N.S. et al. International Society of Sports Nutrition position stand: caffeine and exercise performance. J Int Soc Sports Nutr, 2021." },
  { id: "efsa2015", text: "EFSA Panel on Dietetic Products, Nutrition and Allergies. Scientific Opinion on the safety of caffeine. EFSA Journal, 2015." },
] as const;

export const ESTABLISHED = [
  "Repères glucidiques selon la durée : rien sous 45 min, petites quantités de 45 à 75 min, 30 à 60 g/h jusqu'à 2 h 30, 60 à 90 g/h au-delà avec un entraînement digestif (Jeukendrup 2014 ; Thomas 2016).",
  "Débit de sudation = (poids avant − poids après + liquide bu − urines) / durée ; 1 kg ≈ 1 L (Sawka 2007 ; Baker 2017).",
  "Éviter une perte de masse supérieure à 2 % et ne jamais boire au point de prendre du poids : la surhydratation est la principale cause d'hyponatrémie (Sawka 2007 ; Hew-Butler 2015).",
  "Pertes de sodium = débit de sueur × concentration ; concentration moyenne ≈ 38 mmol/L (≈ 870 mg/L), très variable d'une personne à l'autre (Baker 2017 ; Barnes 2019).",
  "Caféine efficace dès 2 à 3 mg/kg ; au-delà de 6 mg/kg, pas de bénéfice supplémentaire ; dose unique ≤ 200 mg et ≤ 400 mg/jour sans risque chez l'adulte en bonne santé (Guest 2021 ; EFSA 2015).",
];
export const ASSUMPTIONS = [
  "Placement dans la fourchette glucidique selon l'intensité, et plafonds selon l'habitude, la tolérance et le niveau (90 g/h seulement si les trois sont au plus haut).",
  "Montée progressive des glucides heure par heure quand la tolérance est faible ou moyenne.",
  "Débit de sudation estimé sans mesure : référence selon le profil, ajustée par la température, l'humidité, le soleil, l'intensité et le poids (fiabilité ± 40 %).",
  "Objectif d'eau : 65 % des pertes par défaut, borné entre 300 et 800 ml/h, toujours sous 90 % des pertes.",
  "Objectif de sodium : 0 % des pertes sous 1 h 30, 40 % jusqu'à 3 h, 60 % au-delà, plafonné à 1 000 mg/h.",
  "Caféine : répartition proposée des prises (avant le départ pour un effort court, puis en deuxième partie de course pour un effort long).",
  "Intervalle entre les prises = glucides d'une prise ÷ glucides à apporter par heure × 60 (la boisson sucrée est déduite) ; arrondi à 5 min si l'apport reste à ±10 % de l'objectif ; quelques gorgées au moins toutes les 20 min.",
];
export const DISCLAIMER = "Estimations destinées à la planification sportive, pas un avis ni un diagnostic médical. En cas de maladie (cardiaque, rénale, hypertension, diabète…), de grossesse ou de traitement, demandez l'avis d'un médecin. Testez toute stratégie à l'entraînement avant une course.";
