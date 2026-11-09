import { POI_TYPES, type PoiType } from "./types";

/**
 * Pictogrammes des points d'intérêt — dessins originaux, grille 24×24, formes pleines + traits épais (lisibles en petit).
 * `f` = forme pleine, `s` = trait.
 */
export interface Glyph { d: string; kind: "f" | "s" }
export const POI_GLYPHS: Record<PoiType, Glyph[]> = {
  // fourchette + couteau
  ravito: [{ kind: "s", d: "M6 3v5.5a2.5 2.5 0 0 0 5 0V3M8.5 3v18" }, { kind: "f", d: "M14.6 3c2.6.9 4.4 4 4.4 7.6 0 1.5-.7 2.6-2.1 2.6h-.5V21h-1.8z" }],
  // robinet + goutte
  eau: [{ kind: "s", d: "M3.5 9.5H12a4.5 4.5 0 0 1 4.5 4.5v.5M8 9.5V5M5.2 5h5.6" }, { kind: "f", d: "M16.5 16.2c1.5 2 2.3 3.3 2.3 4.2a2.3 2.3 0 0 1-4.600 0c0-.9.8-2.200 2.300-4.200z" }],
  // chronomètre validé
  controle: [{ kind: "s", d: "M12 21.2a7.600 7.600 0 1 0 0-15.200 7.600 7.600 0 0 0 0 15.200zM9.800 2.600h4.400M12 2.600V6" }, { kind: "s", d: "m8.700 13.800 2.300 2.300 4.300-4.700" }],
  // sommets + soleil
  vue: [{ kind: "f", d: "M1.800 20.500 8.800 7.200l3.900 7 2.600-3.700 6.900 10z" }, { kind: "f", d: "M17.600 3.200a2.300 2.300 0 1 1 0 4.600 2.300 2.300 0 0 1 0-4.600z" }],
  // poteau indicateur à deux directions
  danger: [{ kind: "s", d: "M12 2.500v19" }, { kind: "f", d: "M6.200 4.600h9.300l3.300 2.700-3.300 2.700H6.200z" }, { kind: "f", d: "M17.800 12.300H8.500l-3.300 2.700 3.300 2.700h9.300z" }],
  // croix de secours
  secours: [{ kind: "f", d: "M9.300 2.800h5.400v6.500h6.500v5.400h-6.500v6.500H9.300v-6.500H2.800V9.300h6.500z" }],
  // P de stationnement
  parking: [{ kind: "s", d: "M8.300 20.500V3.800h5.200a4.700 4.700 0 0 1 0 9.400H8.300" }],
};
const clean = (d: string) => d.replace(/(\.\d*?)0+(?=\D|$)/g, "$1").replace(/\.(?=\D|$)/g, "");
const glyphSvg = (t: PoiType, color = "#fff") => (POI_GLYPHS[t] ?? POI_GLYPHS.vue).map((g) => g.kind === "f"
  ? `<path d="${clean(g.d)}" fill="${color}"/>`
  : `<path d="${clean(g.d)}" fill="none" stroke="${color}" stroke-width="${t === "parking" ? 3.4 : 2.4}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
/** Tracés nettoyés, pour le rendu React. */
export const glyphPaths = (t: PoiType) => (POI_GLYPHS[t] ?? POI_GLYPHS.vue).map((g) => ({ ...g, d: clean(g.d) }));

/** Pictogramme seul (SVG 24×24). */
export const poiIconSvg = (t: PoiType, px = 16, color = "#fff") => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true">${glyphSvg(t, color)}</svg>`;

/** Épingle de carte : goutte colorée à liseré blanc, pictogramme blanc, ombre portée. Pointe = position exacte. */
export const poiPinSvg = (t: PoiType, w = 34) => {
  const c = (POI_TYPES[t] ?? POI_TYPES.vue).color, h = Math.round((w * 44) / 36);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 36 44" aria-hidden="true" style="filter:drop-shadow(0 3px 4px rgb(8 19 15 / .35));overflow:visible">
<path d="M18 1.200C8.700 1.200 1.200 8.600 1.200 17.800c0 8.800 9.200 17.300 15 23.900a2.400 2.400 0 0 0 3.600 0c5.800-6.600 15-15.100 15-23.900C34.800 8.600 27.300 1.200 18 1.200z" fill="${c}" stroke="#fff" stroke-width="2.200"/>
<path d="M18 4.200c7.600 0 13.700 6 13.700 13.500" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.600" stroke-linecap="round"/>
<g transform="translate(8.200 7.400) scale(.82)">${glyphSvg(t)}</g></svg>`.replace(/(\.\d*?)0+(?=[^\d]|$)/g, "$1");
};

/**
 * Marqueur de carte d'un POI. L'élément racine est positionné par MapLibre (transform) : aucune transition dessus,
 * l'effet de survol est sur l'enveloppe interne. À utiliser avec `anchor: "bottom"`.
 */
export function poiMarkerEl(t: PoiType, label: string, size = 34): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button"; el.className = "group block cursor-pointer bg-transparent p-0 leading-none";
  const inner = document.createElement("span");
  inner.className = "block origin-bottom transition-transform duration-150 group-hover:scale-110 group-focus-visible:scale-110";
  inner.innerHTML = poiPinSvg(t, size);
  el.append(inner); el.title = `${label} (${(POI_TYPES[t] ?? POI_TYPES.vue).label})`; el.setAttribute("aria-label", el.title);
  return el;
}

/** Contenu de la fenêtre d'information d'un POI (texte inséré sans HTML : pas d'injection). */
export function poiPopupEl(t: PoiType, name: string, extra?: string): HTMLElement {
  const m = POI_TYPES[t] ?? POI_TYPES.vue;
  const box = document.createElement("div"); box.className = "text-sm";
  const h = document.createElement("div"); h.className = "font-semibold"; h.textContent = name || m.label;
  const k = document.createElement("div"); k.className = "text-xs"; k.style.color = m.color; k.textContent = m.label;
  box.append(h, k); if (extra) { const x = document.createElement("div"); x.className = "mt-1 text-xs text-gray-500"; x.textContent = extra; box.append(x); }
  return box;
}
