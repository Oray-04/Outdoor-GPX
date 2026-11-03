export type Sport = "trail" | "course" | "rando" | "marche" | "vtt" | "velo" | "gravel";

export const SPORTS: Record<Sport, { label: string; kmh: number; climbMPerH: number }> = {
  trail: { label: "Trail", kmh: 8, climbMPerH: 600 },
  course: { label: "Course à pied", kmh: 10.5, climbMPerH: 800 },
  rando: { label: "Randonnée", kmh: 4.2, climbMPerH: 350 },
  marche: { label: "Marche", kmh: 5, climbMPerH: 400 },
  vtt: { label: "VTT", kmh: 14, climbMPerH: 500 },
  velo: { label: "Vélo de route", kmh: 24, climbMPerH: 700 },
  gravel: { label: "Gravel", kmh: 19, climbMPerH: 600 },
};

/** Estimation simple : temps à plat + temps de montée, pondérés (en minutes). */
export function estimateMinutes(sport: Sport, distanceM: number, gainM: number) {
  const s = SPORTS[sport];
  return (distanceM / 1000 / s.kmh) * 60 * 0.8 + (gainM / s.climbMPerH) * 60 * 0.6 + 0;
}

export type Difficulty = "facile" | "modere" | "difficile" | "expert";

/** Indice d'effort = km + dénivelé/100 (principe « km-effort »). */
export function difficultyOf(distanceM: number, gainM: number): Difficulty {
  const effort = distanceM / 1000 + gainM / 100;
  if (effort < 15) return "facile";
  if (effort < 35) return "modere";
  if (effort < 65) return "difficile";
  return "expert";
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  facile: "Facile",
  modere: "Modéré",
  difficile: "Difficile",
  expert: "Expert",
};
