import type { Sport } from "./sports";

export type Pt = [lng: number, lat: number, ele: number];
export type LL = [lng: number, lat: number];

export type PoiType = "ravito" | "eau" | "controle" | "vue" | "danger" | "secours" | "parking";
/** `danger` = « Passage » (passage délicat ou point de franchissement) : identifiant conservé pour les données déjà enregistrées. */
export const POI_TYPES: Record<PoiType, { label: string; letter: string; color: string }> = {
  ravito: { label: "Ravitaillement", letter: "R", color: "#d9622b" },
  eau: { label: "Point d'eau", letter: "E", color: "#1f8fbf" },
  controle: { label: "Contrôle", letter: "C", color: "#6b4bc4" },
  vue: { label: "Point de vue", letter: "V", color: "#1d7a5a" },
  danger: { label: "Passage", letter: "!", color: "#b8862b" },
  secours: { label: "Poste de secours", letter: "+", color: "#cf2a35" },
  parking: { label: "Parking", letter: "P", color: "#2b4a8c" },
};
/**
 * Compatibilité : l'ancienne catégorie « Départ » n'existe plus (le départ et l'arrivée sont des marqueurs du parcours).
 * Les POI enregistrés avec ce type redeviennent des « Parking » (catégorie dont ils avaient été séparés) ; tout type inconnu devient « Point de vue ».
 */
export const normalizePois = (pois: Poi[] | undefined): Poi[] => (pois ?? []).map((p) => (p.type in POI_TYPES ? p : { ...p, type: (p.type as string) === "depart" ? "parking" : "vue" }));

export interface Poi { id: string; type: PoiType; name: string; lng: number; lat: number }
export interface Waypoint { lng: number; lat: number; /** segment précédent tracé sur chemins (true) ou en ligne droite */ auto: boolean }

export type Visibility = "prive" | "public";
export const TERRAINS = ["Sentier", "Chemin / piste", "Route", "Pierrier", "Neige / glace", "Herbe"] as const;

export interface SavedRoute {
  id: string;
  name: string;
  description: string;
  sport: Sport;
  /** Géométrie de chaque segment entre waypoints[i] et waypoints[i+1] */
  segs: LL[][];
  waypoints: Waypoint[];
  /** Trace complète avec altitude (calculée) */
  coords: Pt[];
  pois: Poi[];
  terrain: string[]; // déclaré par l'auteur
  visibility: Visibility;
  region: string;
  country: string;
  source: "creation" | "import";
  fileName?: string;
  /** Calque d'appartenance (par défaut « mine ») */
  layer?: string;
  /** Lien vers la source d'origine (optionnel) */
  sourceUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
