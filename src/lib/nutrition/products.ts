import type { Product, ProductCategory } from "./types";

/**
 * Catalogue de produits : uniquement ceux saisis par l'utilisateur, avec les valeurs lues sur l'emballage.
 * Aucune valeur nutritionnelle n'est inventée ni pré-remplie (pas de produits de marque fournis par le site).
 */
export const CATEGORY_LABEL: Record<ProductCategory, string> = { gel: "Gel", boisson: "Boisson (par flasque ou bidon)", barre: "Barre", pate: "Pâte de fruits", sel: "Capsule de sodium", autre: "Autre" };
export const CATEGORY_SHORT: Record<ProductCategory, string> = { gel: "Gel", boisson: "Boisson", barre: "Barre", pate: "Pâte de fruits", sel: "Sodium", autre: "Autre" };

const LIMITS = { carbsG: [0, 200], sodiumMg: [0, 3000], volumeMl: [0, 1500], caffeineMg: [0, 400] } as const;

/** Contrôle d'un produit saisi ; renvoie la liste des erreurs (vide si le produit est valable). */
export function validateProduct(p: Partial<Product>): string[] {
  const e: string[] = [];
  if (!p.name || !p.name.trim()) e.push("Le nom est obligatoire.");
  for (const [k, [lo, hi]] of Object.entries(LIMITS) as [keyof typeof LIMITS, readonly [number, number]][]) {
    const v = p[k]; if (v == null || !Number.isFinite(v) || v < lo || v > hi) e.push(`${({ carbsG: "Glucides", sodiumMg: "Sodium", volumeMl: "Volume", caffeineMg: "Caféine" })[k]} : valeur entre ${lo} et ${hi} attendue.`);
  }
  if (p.category === "boisson" && !(p.volumeMl && p.volumeMl > 0)) e.push("Une boisson doit avoir un volume (ml par portion).");
  if (p.stock != null && (!Number.isFinite(p.stock) || p.stock < 0)) e.push("Quantité disponible : nombre positif attendu.");
  if (p.category !== "sel" && p.category !== "boisson" && (p.carbsG ?? 0) === 0 && (p.caffeineMg ?? 0) === 0 && (p.sodiumMg ?? 0) === 0) e.push("Ce produit n'apporte ni glucides, ni sodium, ni caféine.");
  return e;
}

/** Produit solide ou semi-liquide qui sert à couvrir les glucides (gel, barre, pâte de fruits, autre). */
export const isCarbSource = (p: Product) => p.category !== "boisson" && p.category !== "sel" && p.carbsG > 0;
export const isSodiumSource = (p: Product) => p.category === "sel" && p.sodiumMg > 0;
