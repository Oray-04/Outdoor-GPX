"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { buildStyle } from "@/lib/basemaps";
import { BASE } from "@/lib/url";

export type ML = typeof import("maplibre-gl");

/** Initialise une carte MapLibre (fonds IGN/OSM). `ready` passe à true quand le style est chargé. */
export function useMap(opts: { center?: [number, number]; zoom?: number; scale?: boolean; preserveBuffer?: boolean } = {}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mlRef = useRef<ML | null>(null);
  const [ready, setReady] = useState(false);
  const o = useRef(opts); o.current = opts;

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl(`${location.origin}${BASE}/maplibre/maplibre-gl-worker.mjs`);
      if (dead || !el.current) return;
      mlRef.current = ml;
      const m = new ml.Map({ container: el.current, style: buildStyle(), center: o.current.center ?? [2.5, 46.6], zoom: o.current.zoom ?? 5.3, attributionControl: { compact: true }, doubleClickZoom: false, canvasContextAttributes: { preserveDrawingBuffer: !!o.current.preserveBuffer } });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      if (o.current.scale !== false) m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
      m.on("style.load", () => { if (!dead) setReady(true); });
      mapRef.current = m;
      try { if (localStorage.getItem("crete:debug")) (window as unknown as { __map?: unknown }).__map = m; } catch { /* stockage indisponible */ }
      ro = new ResizeObserver(() => m.resize());
      ro.observe(el.current);
    })();
    return () => { dead = true; ro?.disconnect(); mapRef.current?.remove(); mapRef.current = null; setReady(false); };
  }, []);

  return { el, map: mapRef, ml: mlRef, ready };
}
