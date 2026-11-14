/** Types partagés du planificateur nutritionnel (paramètres utilisateur et résultats). */
export type Level = "debutant" | "intermediaire" | "confirme" | "elite";
export type Tolerance = "faible" | "moyenne" | "bonne";
export type CarbHabit = "aucune" | "occasionnelle" | "reguliere" | "entrainee";
export type Intensity = "facile" | "moderee" | "soutenue" | "elevee";
export type SweatProfile = "faible" | "moyen" | "eleve" | "inconnu";
export type SaltProfile = "faible" | "moyen" | "eleve" | "inconnu";
export type RaceType = "route" | "trail" | "ultra";
export type Sky = "couvert" | "soleil" | "pluie" | "nuit";
export type CaffeineStrategy = "aucune" | "prudente" | "moderee" | "standard" | "personnalisee";
export type Sensitivity = "faible" | "normale" | "elevee";
export type ProductCategory = "gel" | "boisson" | "barre" | "pate" | "sel" | "autre";

export interface Athlete { weightKg: number | null; level: Level; experienceYears: number | null; tolerance: Tolerance; habit: CarbHabit }
export interface Race { type: RaceType; name: string; distanceKm: number | null; gainM: number | null; durationMin: number | null; intensity: Intensity; startTime: string; routeId?: string }
export interface Weather { tempC: number | null; humidityPct: number | null; sky: Sky; sweat: SweatProfile }
/** Test de sudation : pesée avant/après une sortie représentative. */
export interface SweatTest { preKg: number | null; postKg: number | null; fluidL: number | null; urineL: number | null; durationMin: number | null }
export interface CaffeineDose { id: string; atMin: number; mg: number }
export interface Preferences {
  carbOverrideGph: number | null;
  intakeOverrideMlH: number | null;
  sodiumOverrideMgH: number | null;
  foodNotes: string;
  saltProfile: SaltProfile;
  sweatTest: SweatTest | null;
  /** Mesure individuelle de sodium de la sueur. */
  sweatSodium: { value: number | null; unit: "mgL" | "mmolL" } | null;
  caffeine: { strategy: CaffeineStrategy; customMgKg: number | null; sensitivity: Sensitivity; habitualMgDay: number | null; halfLifeH: number | null; bedtime: string; doses: CaffeineDose[] | null };
  /** Produits utilisés pendant la course (identifiants du catalogue) et boisson principale. */
  productIds: string[];
  drinkId: string | null;
  intervalMin: number;
  /** Capacité de liquide transportée (ml) et recharge aux ravitaillements. */
  carryMl: number | null;
  refillAtAid: boolean;
}
export interface AidStation { id: string; name: string; km: number | null; etaMin: number | null; water: boolean; food: boolean }
export interface Product { id: string; name: string; brand: string; category: ProductCategory; carbsG: number; sodiumMg: number; volumeMl: number; caffeineMg: number; stock: number | null }

export interface PlanInput { athlete: Athlete; race: Race; weather: Weather; prefs: Preferences; aid: AidStation[]; products: Product[] }

export type Reliability = "mesuree" | "estimee";
export interface Notice { level: "info" | "warn" | "alert"; text: string }
