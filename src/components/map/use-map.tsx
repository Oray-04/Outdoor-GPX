"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { buildStyle } from "@/lib/basemaps";
import { BASE } from "@/lib/url";

export type ML = typeof import("maplibre-gl");

/** Textes de l'écran d'aide affiché quand la molette ou un doigt est intercepté (carte intégrée dans une page). */
export const MAP_LOCALE = {
  "CooperativeGesturesHandler.WindowsHelpText": "Ctrl + molette pour zoomer la carte — ou plein écran",
  "CooperativeGesturesHandler.MacHelpText": "⌘ + molette pour zoomer la carte — ou plein écran",
  "CooperativeGesturesHandler.MobileHelpText": "Deux doigts pour déplacer la carte",
};
/**
 * Une carte posée au milieu d'une page qui défile ne doit pas « avaler » la molette : sinon impossible de descendre dans la page.
 * Carte intégrée → la molette fait défiler la page (Ctrl/⌘ + molette pour zoomer, deux doigts sur mobile).
 * Carte d'un espace de travail plein écran, ou carte passée en plein écran → gestes normaux.
 */
export function isEmbeddedMap(e: HTMLElement | null): boolean {
  if (!e || typeof window === "undefined") return false;
  if (e.closest('[data-fullscreen="true"], .fixed.inset-0') || (document.fullscreenElement && document.fullscreenElement.contains(e))) return false;
  const w = e.closest("[data-workspace]");
  if (!w) return true;
  return w.getAttribute("data-workspace") === "scroll" && window.innerWidth < 768;
}
export function syncCooperative(m: { cooperativeGestures: { enable(): void; disable(): void; isEnabled(): boolean } }, e: HTMLElement | null) {
  const want = isEmbeddedMap(e); if (want !== m.cooperativeGestures.isEnabled()) { if (want) m.cooperativeGestures.enable(); else m.cooperativeGestures.disable(); }
}

/** Initialise une carte MapLibre (fonds IGN/OSM). `ready` passe à true quand le style est chargé. */
export function useMap(opts: { center?: [number, number]; zoom?: number; scale?: boolean; preserveBuffer?: boolean } = {}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mlRef = useRef<ML | null>(null);
  const [ready, setReady] = useState(false);
  const o = useRef(opts); o.current = opts;

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null; let fsOff = () => {};
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl(`${location.origin}${BASE}/maplibre/maplibre-gl-worker.mjs`);
      if (dead || !el.current) return;
      mlRef.current = ml;
      const m = new ml.Map({ container: el.current, style: buildStyle(), center: o.current.center ?? [2.5, 46.6], zoom: o.current.zoom ?? 5.3, attributionControl: { compact: true }, doubleClickZoom: false, cooperativeGestures: isEmbeddedMap(el.current), locale: MAP_LOCALE, canvasContextAttributes: { preserveDrawingBuffer: !!o.current.preserveBuffer } });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      if (o.current.scale !== false) m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
      m.on("style.load", () => { if (!dead) setReady(true); });
      mapRef.current = m;
      try { if (localStorage.getItem("crete:debug")) (window as unknown as { __map?: unknown }).__map = m; } catch { /* stockage indisponible */ }
      const sync = () => syncCooperative(m, el.current);
      ro = new ResizeObserver(() => { m.resize(); sync(); });
      document.addEventListener("fullscreenchange", sync); fsOff = () => document.removeEventListener("fullscreenchange", sync);
      ro.observe(el.current);
    })();
    return () => { dead = true; ro?.disconnect(); fsOff(); mapRef.current?.remove(); mapRef.current = null; setReady(false); };
  }, []);

  return { el, map: mapRef, ml: mlRef, ready };
}
