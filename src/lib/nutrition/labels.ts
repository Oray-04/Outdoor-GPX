import type { CaffeineStrategy, CarbHabit, Intensity, Level, RaceType, SaltProfile, Sensitivity, Sky, SweatProfile, Tolerance } from "./types";

/** Libellés de l'interface et de la fiche PDF. */
export const LEVEL_LABEL: Record<Level, string> = { debutant: "Débutant", intermediaire: "Intermédiaire", confirme: "Confirmé", elite: "Élite" };
export const TOLERANCE_LABEL: Record<Tolerance, string> = { faible: "Faible", moyenne: "Moyenne", bonne: "Bonne" };
export const HABIT_LABEL: Record<CarbHabit, string> = { aucune: "Ne mange pas pendant l'effort", occasionnelle: "Mange parfois pendant l'effort", reguliere: "Mange régulièrement (≈ 45–60 g/h)", entrainee: "Intestin entraîné (≥ 75 g/h testés)" };
export const INTENSITY_LABEL: Record<Intensity, string> = { facile: "Facile", moderee: "Modérée", soutenue: "Soutenue", elevee: "Élevée" };
export const RACE_LABEL: Record<RaceType, string> = { route: "Course sur route", trail: "Trail", ultra: "Ultra-trail" };
export const SWEAT_LABEL: Record<SweatProfile, string> = { faible: "Faible", moyen: "Moyenne", eleve: "Abondante", inconnu: "Je ne sais pas" };
export const SALT_LABEL: Record<SaltProfile, string> = { faible: "Peu salée", moyen: "Moyenne", eleve: "Très salée (traces blanches)", inconnu: "Je ne sais pas" };
export const SKY_LABEL: Record<Sky, string> = { couvert: "Couvert", soleil: "Plein soleil", pluie: "Pluie", nuit: "Nuit" };
export const SENSITIVITY_LABEL: Record<Sensitivity, string> = { faible: "Peu sensible", normale: "Normale", elevee: "Très sensible" };
export const STRATEGY_LABEL: Record<CaffeineStrategy, string> = { aucune: "Aucune", prudente: "Prudente — 1 mg/kg", moderee: "Modérée — 2 mg/kg", standard: "Standard — 3 mg/kg", personnalisee: "Personnalisée" };

export const fmtDur = (min: number) => { const m = Math.round(min); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };
export const fmtL = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toFixed(1).replace(".", ",")} L` : `${Math.round(ml)} ml`);
export const fmtRel = (min: number) => (min < 0 ? `${-min} min avant le départ` : `${fmtDur(min)} de course`);
