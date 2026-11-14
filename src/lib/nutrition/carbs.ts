import { NUTRITION } from "./constants";
import type { CarbHabit, Intensity, Level, Notice, Tolerance } from "./types";

export interface CarbInput { durationMin: number; intensity: Intensity; level: Level; tolerance: Tolerance; habit: CarbHabit; overrideGph?: number | null }
export interface CarbResult {
  /** Objectif horaire retenu (g/h) une fois la montée progressive terminée. */
  gph: number;
  band: { min: number; max: number; label: string; optional: boolean };
  /** Plafond personnel (habitude, tolérance, niveau) et ce qui le fixe. */
  cap: number; capBy: string;
  /** Part de l'objectif heure par heure (montée progressive). */
  ramp: number[];
  totalG: number;
  /** Objectif « horaire × durée » sans montée progressive (formule de référence). */
  flatTotalG: number;
  optional: boolean;
  source: "calcul" | "saisie";
  notices: Notice[];
}

const r5 = (x: number) => Math.round(x / NUTRITION.carbs.round) * NUTRITION.carbs.round;

/** Fourchette de référence pour une durée d'effort donnée. */
export function carbBand(durationMin: number) {
  const b = NUTRITION.carbs.bands.find((x) => durationMin < x.maxMin) ?? NUTRITION.carbs.bands[NUTRITION.carbs.bands.length - 1];
  return { min: b.min, max: b.max, label: b.label, optional: "optional" in b ? !!b.optional : false };
}

/** Taux à l'instant t (min depuis le départ) en tenant compte de la montée progressive. */
export function carbRateAt(gph: number, ramp: number[], tMin: number) { const h = Math.floor(Math.max(0, tMin) / 60); return gph * (ramp[Math.min(h, ramp.length - 1)] ?? 1); }

/** Quantité (g) entre deux instants (min), par intégration de la montée progressive heure par heure. */
export function carbsBetween(gph: number, ramp: number[], fromMin: number, toMin: number) {
  let g = 0, t = Math.max(0, fromMin); const end = Math.max(t, toMin);
  while (t < end - 1e-9) { const next = Math.min(end, (Math.floor(t / 60) + 1) * 60); g += carbRateAt(gph, ramp, t) * (next - t) / 60; t = next; }
  return g;
}

/**
 * Module A — glucides. Objectif horaire = fourchette de la durée, positionnée selon l'intensité, puis plafonnée par
 * l'habitude de consommer pendant l'effort, la tolérance digestive et le niveau (jamais 90 g/h sans les trois au plus haut).
 * Total = ∫ objectif × montée progressive (formule de référence : objectif horaire × durée).
 */
export function computeCarbs(i: CarbInput): CarbResult {
  const C = NUTRITION.carbs, notices: Notice[] = [], band = carbBand(i.durationMin);
  const caps: [number, string][] = [[C.capByHabit[i.habit], "votre habitude de consommer pendant l'effort"], [C.capByTolerance[i.tolerance], "votre tolérance digestive"], [C.capByLevel[i.level], "votre niveau"]];
  const [cap, capBy] = caps.reduce((a, b) => (b[0] < a[0] ? b : a));
  let gph = band.max === 0 ? 0 : r5(band.min + (band.max - band.min) * C.intensityPos[i.intensity]);
  if (band.optional) gph = 0;
  if (gph > cap) gph = cap;
  if (!band.optional && band.min > 0 && cap < band.min) notices.push({ level: "warn", text: `Objectif limité à ${cap} g/h par ${capBy}, sous le repère de ${band.min} g/h pour cette durée : entraînez progressivement votre système digestif à l'entraînement avant d'augmenter.` });
  let source: CarbResult["source"] = "calcul";
  if (i.overrideGph != null && Number.isFinite(i.overrideGph)) {
    const o = Math.max(0, Math.min(C.hardMax, i.overrideGph)); source = "saisie";
    if (o > cap) notices.push({ level: o > 90 ? "alert" : "warn", text: `Objectif saisi (${o} g/h) au-dessus de votre plafond estimé (${cap} g/h, fixé par ${capBy}) : risque de troubles digestifs. À valider à l'entraînement, avec des mélanges glucose + fructose au-delà de 60 g/h.` });
    if (i.overrideGph > C.hardMax) notices.push({ level: "warn", text: `Valeur ramenée au maximum accepté (${C.hardMax} g/h).` });
    gph = o;
  }
  const ramp = gph > 0 ? [...C.ramp[i.tolerance]] : [1];
  if (gph > 0 && ramp[0] < 1) notices.push({ level: "info", text: `Montée progressive : ${ramp.slice(0, -1).map((f, h) => `${Math.round(gph * f)} g/h la ${h === 0 ? "1re" : `${h + 1}e`} heure`).join(", ")}, puis ${gph} g/h.` });
  if (gph > 60) notices.push({ level: "info", text: "Au-delà de 60 g/h, privilégiez des produits associant glucose (ou maltodextrine) et fructose : ils sont mieux absorbés." });
  if (band.optional) notices.push({ level: "info", text: "Effort court : aucun apport n'est indispensable. Si vous le souhaitez, jusqu'à 30 g/h ou un simple rinçage de bouche avec une boisson sucrée." });
  const totalG = Math.round(carbsBetween(gph, ramp, 0, i.durationMin));
  return { gph, band, cap, capBy, ramp, totalG, flatTotalG: Math.round(gph * i.durationMin / 60), optional: band.optional || gph === 0, source, notices };
}
