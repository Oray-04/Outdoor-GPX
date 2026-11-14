import type { Gap, Metric } from "./plan";
import { isCarbSource, isSodiumSource } from "./products";
import type { PlanInput } from "./types";

/** Pistes concrètes pour combler chaque manque, à partir des produits choisis. */
export function gapFixes(input: PlanInput, totals: Record<Metric, Gap>) {
  const chosen = input.products.filter((p) => input.prefs.productIds.includes(p.id));
  const carb = chosen.filter(isCarbSource), salt = chosen.filter(isSodiumSource);
  const out: { metric: Metric; title: string; unit: string; got: number; target: number; gap: number; pct: number; how: string }[] = [];
  const g = totals.carbsG;
  if (g.status === "short" || g.status === "missing") {
    const best = carb.reduce<typeof carb[number] | null>((a, b) => (!a || b.carbsG > a.carbsG ? b : a), null);
    out.push({ metric: "carbsG", title: "Glucides", unit: "g", got: g.got, target: g.target, gap: g.gap, pct: g.pct, how: best ? `Ajoutez environ ${Math.ceil(g.gap / best.carbsG)} × « ${best.name} » (${best.carbsG} g) en plus, choisissez des produits plus riches ou une boisson glucidique comme boisson principale.` : "Aucun produit glucidique sélectionné : cochez vos gels, barres ou pâtes de fruits à l'étape 4 (ou ajoutez-les au catalogue)." });
  }
  const w = totals.waterMl;
  if (w.status === "short" || w.status === "missing") out.push({ metric: "waterMl", title: "Eau", unit: "ml", got: w.got, target: w.target, gap: w.gap, pct: w.pct, how: "Prévoyez davantage de liquide aux ravitaillements ou un contenant supplémentaire." });
  const na = totals.sodiumMg;
  if (na.status === "short" || na.status === "missing") out.push({ metric: "sodiumMg", title: "Sodium", unit: "mg", got: na.got, target: na.target, gap: na.gap, pct: na.pct, how: salt.length ? `Ajoutez environ ${Math.ceil(na.gap / salt[0].sodiumMg)} × « ${salt[0].name} » (${salt[0].sodiumMg} mg).` : "Ajoutez une boisson d'effort salée comme boisson principale, ou des capsules de sodium (catalogue, étape 4)." });
  return out;
}
