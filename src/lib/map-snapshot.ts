"use client";
import type { StyleSpecification } from "maplibre-gl";
import { buildStyle } from "./basemaps";
import { BASE } from "./url";

/**
 * Image d'une carte pour les documents imprimés, rendue hors écran à la taille voulue :
 * cadrage automatique sur le tracé et sur tous les points (aucun poste ne sort du cadre), nord en haut, haute définition.
 * Les positions des points dans l'image sont renvoyées pour y poser les pictogrammes.
 */
export interface SnapLine { coords: [number, number][]; color: string; width: number; opacity?: number }
export interface SnapOptions {
  /** taille en pixels CSS ; l'image fait `width × ratio` pixels (par défaut 2, plafonné à ~2,4 mégapixels : assez pour l'impression, rapide à produire) */
  width: number; height: number; ratio?: number;
  lines: SnapLine[];
  /** points à faire tenir dans le cadre (tracé + postes) */
  fit: [number, number][];
  /** points dont on veut la position dans l'image */
  points?: [number, number][];
  padding?: { top: number; right: number; bottom: number; left: number };
  maxZoom?: number;
  /** cadrage imposé (ex. mini-carte centrée sur un poste) au lieu du cadrage automatique */
  center?: [number, number]; zoom?: number;
  /** style de la carte affichée à l'écran (même fond) ; à défaut, le fond par défaut du site */
  style?: StyleSpecification;
  timeoutMs?: number;
}
export interface SnapResult { dataUrl: string; width: number; height: number; points: { x: number; y: number }[] }

export async function snapshotMap(o: SnapOptions): Promise<SnapResult> {
  const ml = await import("maplibre-gl");
  ml.setWorkerUrl(`${location.origin}${BASE}/maplibre/maplibre-gl-worker.mjs`);
  const box = document.createElement("div");
  box.style.cssText = `position:fixed;left:-20000px;top:0;width:${o.width}px;height:${o.height}px;pointer-events:none;`;
  box.setAttribute("aria-hidden", "true");
  document.body.appendChild(box);
  const m = new ml.Map({ container: box, style: o.style ?? buildStyle(), interactive: false, attributionControl: false, fadeDuration: 0, pixelRatio: o.ratio ?? Math.min(2, Math.sqrt(2_400_000 / (o.width * o.height))), canvasContextAttributes: { preserveDrawingBuffer: true }, center: o.fit[0] ?? [2.5, 46.6], zoom: 10 });
  try {
    await new Promise<void>((res, rej) => { const t = setTimeout(() => rej(new Error("La carte n'a pas pu être chargée.")), o.timeoutMs ?? 20000); m.once("load", () => { clearTimeout(t); res(); }); });
    o.lines.forEach((l, i) => {
      m.addSource(`snap-${i}`, { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l.coords } } });
      m.addLayer({ id: `snap-c-${i}`, type: "line", source: `snap-${i}`, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": l.width + 3, "line-opacity": l.opacity ?? 1 } });
      m.addLayer({ id: `snap-l-${i}`, type: "line", source: `snap-${i}`, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": l.color, "line-width": l.width, "line-opacity": l.opacity ?? 1 } });
    });
    if (o.center) m.jumpTo({ center: o.center, zoom: o.zoom ?? 15 });
    else if (o.fit.length) {
      let w = 180, s = 90, e = -180, n = -90; for (const [x, y] of o.fit) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
      if (e - w < 0.002) { w -= 0.002; e += 0.002; } if (n - s < 0.002) { s -= 0.002; n += 0.002; }
      m.fitBounds([[w, s], [e, n]], { padding: o.padding ?? { top: 60, right: 40, bottom: 40, left: 40 }, maxZoom: o.maxZoom ?? 16, duration: 0 });
    }
    // tuiles chargées : vérification régulière (plus fiable et plus rapide que l'événement « idle »), 12 s au plus
    const t0 = Date.now();
    await new Promise<void>((res) => { const tick = () => { if ((m.loaded() && m.areTilesLoaded()) || Date.now() - t0 > (o.timeoutMs ?? 12000)) res(); else setTimeout(tick, 150); }; setTimeout(tick, 250); });
    await new Promise<void>((res) => { m.triggerRepaint(); m.once("render", () => res()); setTimeout(res, 400); });
    const points = (o.points ?? []).map((p) => { const q = m.project(p); return { x: q.x, y: q.y }; });
    // encodage asynchrone (la page reste réactive)
    const c = m.getCanvas();
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.9));
    const dataUrl = blob ? await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }) : c.toDataURL("image/jpeg", 0.9);
    return { dataUrl, width: o.width, height: o.height, points };
  } finally { m.remove(); box.remove(); }
}
