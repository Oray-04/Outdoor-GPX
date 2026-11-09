/**
 * Marqueurs de départ et d'arrivée d'un parcours (ce ne sont pas des POI) : drapeau vert au départ, drapeau à damier à l'arrivée.
 * Sur une boucle, les deux drapeaux partagent un même pied et s'écartent en V : lisibles sans se recouvrir.
 * Le pied du mât est la position exacte : à utiliser avec `anchor: "bottom"`.
 */
const SHADOW = "filter:drop-shadow(0 2px 3px rgb(8 19 15 / .4));overflow:visible";
const GREEN = "#17a05d", GREEN_DARK = "#0c6b3c", POLE = "#0d1b17";
/** Damier 4×3 dans un fanion ondulé (clip), origine (x,y), taille w×h. */
const checker = (id: string, x: number, y: number, w: number, h: number) => {
  const cw = w / 4, ch = h / 3; let cells = "";
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if ((r + c) % 2 === 0) cells += `<rect x="${(x + c * cw).toFixed(2)}" y="${(y + r * ch).toFixed(2)}" width="${cw.toFixed(2)}" height="${ch.toFixed(2)}" fill="#0d1b17"/>`;
  const wave = `M${x} ${y}c${w * 0.25} ${-h * 0.14} ${w * 0.5} ${h * 0.14} ${w} 0v${h}c${-w * 0.5} ${h * 0.14} ${-w * 0.75} ${-h * 0.14} ${-w} 0z`;
  return `<clipPath id="${id}"><path d="${wave}"/></clipPath><path d="${wave}" fill="#fff"/><g clip-path="url(#${id})">${cells}</g><path d="${wave}" fill="none" stroke="#0d1b17" stroke-width="1.1"/>`;
};
const greenFlag = (x: number, y: number, w: number, h: number) => {
  const wave = `M${x} ${y}c${w * 0.25} ${-h * 0.14} ${w * 0.5} ${h * 0.14} ${w} 0v${h}c${-w * 0.5} ${h * 0.14} ${-w * 0.75} ${-h * 0.14} ${-w} 0z`;
  return `<path d="${wave}" fill="${GREEN}" stroke="${GREEN_DARK}" stroke-width="1.1"/><path d="M${x + 1.5} ${y + h * 0.3}c${w * 0.25} ${-h * 0.12} ${w * 0.45} ${h * 0.12} ${w - 3} 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.2" stroke-linecap="round"/>`;
};
const pole = (x: number, top: number, bottom: number) => `<path d="M${x} ${top}V${bottom}" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/><path d="M${x} ${top}V${bottom}" stroke="${POLE}" stroke-width="2.2" stroke-linecap="round"/><circle cx="${x}" cy="${bottom}" r="2.6" fill="${POLE}" stroke="#fff" stroke-width="1.2"/>`;
let uidN = 0;

export type RouteMarkerKind = "start" | "finish" | "loop";
export const ROUTE_MARKER_LABEL: Record<RouteMarkerKind, string> = { start: "Départ", finish: "Arrivée", loop: "Départ et arrivée (boucle)" };

/** SVG du marqueur. Le pied du mât est au centre-bas de l'image. */
export function routeMarkerSvg(kind: RouteMarkerKind, h = 50): string {
  const id = `ck${++uidN}`;
  if (kind === "loop") {
    // deux mâts en V partant du même pied : vert à gauche, damier à droite
    const w = Math.round((h * 52) / 40);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 52 40" aria-hidden="true" style="${SHADOW}">
<g transform="rotate(-20 26 37)">${greenFlag(8, 4, 17, 12)}${pole(26, 3, 37).replace(/<circle[^>]*>/, "")}</g>
<g transform="rotate(20 26 37)">${checker(id, 27, 4, 17, 12)}${pole(26, 3, 37)}</g></svg>`;
  }
  const w = Math.round((h * 30) / 40);
  // mât au centre (x = 15) pour que l'ancre « bottom » tombe exactement sur le point
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 30 40" aria-hidden="true" style="${SHADOW}">${kind === "start" ? greenFlag(16, 3.5, 13.5, 12.5) : checker(id, 16, 3.5, 13.5, 12.5)}${pole(15, 3, 37)}</svg>`;
}

/** Élément de marqueur (bouton accessible). Aucune transition sur la racine : MapLibre la positionne par `transform`. */
export function routeMarkerEl(kind: RouteMarkerKind, title?: string, h = 50): HTMLButtonElement {
  const el = document.createElement("button"); el.type = "button"; el.className = "group block cursor-pointer bg-transparent p-0 leading-none";
  const inner = document.createElement("span"); inner.className = "block origin-bottom transition-transform duration-150 group-hover:scale-110";
  inner.innerHTML = routeMarkerSvg(kind, h); el.append(inner);
  el.title = title ?? ROUTE_MARKER_LABEL[kind]; el.setAttribute("aria-label", el.title); el.dataset.routeMarker = kind;
  return el;
}
