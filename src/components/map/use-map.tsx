"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { BASEMAPS, buildStyle } from "@/lib/basemaps";
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
    })();
    return () => { dead = true; mapRef.current?.remove(); mapRef.current = null; setReady(false); };
  }, []);

  return { el, map: mapRef, ml: mlRef, ready };
}

export function setBasemap(map: MLMap, id: string) {
  for (const b of BASEMAPS) map.setLayoutProperty(`base-${b.id}`, "visibility", b.id === id ? "visible" : "none");
}

export function BasemapPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <label className="rounded-lg bg-white/95 px-2 py-1 text-xs shadow">
      <span className="sr-only">Fond de carte</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent font-medium">
        {BASEMAPS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
      </select>
    </label>
  );
}
