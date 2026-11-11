"use client";
import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import type { Map as MLMap } from "maplibre-gl";
import { BASEMAPS } from "@/lib/basemaps";
import { BASE } from "@/lib/url";

export interface HeroMapHandle { flyTo: (lng: number, lat: number, zoom?: number) => void; setUserPos: (lng: number, lat: number) => void }

/** Carte d'accueil : fond OpenStreetMap (raster) (aucun tracé affiché). */
export const HeroMap = forwardRef<HeroMapHandle>(function HeroMap(_, ref) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const userMarker = useRef<import("maplibre-gl").Marker | null>(null);

  useImperativeHandle(ref, () => ({
    flyTo: (lng, lat, zoom = 11) => map.current?.flyTo({ center: [lng, lat], zoom, essential: false }),
    setUserPos: async (lng, lat) => {
      const ml = await import("maplibre-gl");
      userMarker.current?.remove();
      const dot = document.createElement("div");
      dot.className = "size-4 rounded-full border-2 border-white bg-glacier-500 shadow-[0_0_0_6px_rgb(59_166_201/0.3)]";
      dot.title = "Votre position";
      userMarker.current = new ml.Marker({ element: dot }).setLngLat([lng, lat]).addTo(map.current!);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl(`${location.origin}${BASE}/maplibre/maplibre-gl-worker.mjs`);
      if (cancelled || !el.current) return;
      const m = new ml.Map({
        container: el.current,
        style: {
          version: 8,
          sources: { base: { type: "raster", tiles: [BASEMAPS[0].tiles], tileSize: 256, maxzoom: BASEMAPS[0].maxzoom, attribution: BASEMAPS[0].attribution } },
          layers: [{ id: "bg", type: "background", paint: { "background-color": "#dfe7e2" } }, { id: "base", type: "raster", source: "base", paint: { "raster-saturation": -0.3 } }],
        },
        center: [4.2, 45.6], zoom: 4.6, attributionControl: { compact: true },
        cooperativeGestures: true,
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  return <div ref={el} className="size-full" role="region" aria-label="Carte de France" />;
});
