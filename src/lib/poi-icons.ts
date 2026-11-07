import { POI_TYPES, type PoiType } from "./types";

/** Pictogrammes des points d'intérêt (tracés 24×24, trait arrondi — même famille que les icônes du site). */
export const POI_ICON_PATHS: Record<PoiType, string[]> = {
  ravito: ["M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2", "M7 2v20", "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"],                      // couverts
  eau: ["M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"],                     // goutte
  controle: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "m8.5 12.5 2.5 2.5 4.5-5"],                                                   // pointage validé
  vue: ["m8 3 4 8 5-5 5 15H2L8 3z"],                                                                                                   // montagnes
  danger: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],                         // passage délicat
  secours: ["M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"], // croix
  parking: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M9 17V7h4a3 3 0 0 1 0 6H9"],                  // P
  depart: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],                                                  // drapeau
};

/** Balisage SVG d'un pictogramme (pour les marqueurs de carte, qui sont des éléments DOM). */
export const poiIconSvg = (t: PoiType, px = 16, stroke = "#fff") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${POI_ICON_PATHS[t].map((d) => `<path d="${d}"/>`).join("")}</svg>`;

/**
 * Marqueur de carte : pastille colorée à pictogramme, assez grande pour rester lisible dézoomée.
 * L'élément racine est positionné par MapLibre (transform) : aucune transition dessus, l'effet de survol est sur l'enveloppe interne.
 */
export function poiMarkerEl(t: PoiType, label: string, size = 30): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button"; el.className = "group grid cursor-pointer place-items-center bg-transparent p-0";
  el.style.cssText = `width:${size}px;height:${size}px`;
  const dot = document.createElement("span");
  dot.className = "grid size-full place-items-center rounded-full border-2 border-white shadow-lg ring-1 ring-black/20 transition-transform group-hover:scale-110 group-focus-visible:scale-110";
  dot.style.background = POI_TYPES[t].color; dot.innerHTML = poiIconSvg(t, Math.round(size * 0.58));
  el.append(dot); el.title = `${label} (${POI_TYPES[t].label})`; el.setAttribute("aria-label", el.title);
  return el;
}

/** Contenu de la fenêtre d'information d'un POI (texte inséré sans HTML : pas d'injection). */
export function poiPopupEl(t: PoiType, name: string, extra?: string): HTMLElement {
  const box = document.createElement("div"); box.className = "text-sm";
  const h = document.createElement("div"); h.className = "font-semibold"; h.textContent = name || POI_TYPES[t].label;
  const k = document.createElement("div"); k.className = "text-xs"; k.style.color = POI_TYPES[t].color; k.textContent = POI_TYPES[t].label;
  box.append(h, k); if (extra) { const x = document.createElement("div"); x.className = "mt-1 text-xs text-gray-500"; x.textContent = extra; box.append(x); }
  return box;
}
