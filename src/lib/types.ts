import type { Sport } from "./sports";

export type Pt = [lng: number, lat: number, ele: number];
export type LL = [lng: number, lat: number];

export type PoiType = "ravito" | "eau" | "controle" | "vue" | "danger" | "secours" | "parking";
export const POI_TYPES: Record<PoiType, { label: string; letter: string; color: string }> = {
  ravito: { label: "Ravitaillement", letter: "R", color: "#f0612b" },
  eau: { label: "Point d'eau", letter: "E", color: "#3ba6c9" },
  controle: { label: "Point de contrôle", letter: "C", color: "#7a4bd1" },
  vue: { label: "Point de vue", letter: "V", color: "#1e7a58" },
  danger: { label: "Passage délicat", letter: "!", color: "#c8372d" },
  secours: { label: "Poste de secours", letter: "+", color: "#d4202a" },
  parking: { label: "Parking / départ", letter: "P", color: "#36504a" },
};

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
