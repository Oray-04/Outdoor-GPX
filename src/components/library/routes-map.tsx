"use client";
import { useEffect, useRef } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { useMap } from "@/components/map/use-map";
import { bboxOf } from "@/lib/geo";
import { fmtKm, fmtM } from "@/lib/geo";
import { MapFrame, StatBanner } from "@/components/map/map-frame";
import { LayerControl } from "@/components/map/layer-control";
import type { RouteVM } from "@/lib/route-model";
import { routeHref, withBase } from "@/lib/url";

export function RoutesMap({ routes }: { routes: RouteVM[] }) {
  const { el, map, ml, ready } = useMap();
  const wired = useRef(false);

  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (!m.getSource("rs")) {
      m.addSource("rs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "rs-casing", type: "line", source: "rs", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 7 } });
      m.addLayer({ id: "rs-line", type: "line", source: "rs", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#12624b", "line-width": 4 } });
    }
    if (!wired.current) {
      wired.current = true;
      m.on("click", "rs-line", (e) => {
        const p = e.features?.[0]?.properties as { id: string; name: string; km: number; gain: number } | undefined; if (!p) return;
        const box = document.createElement("div");
        const a = document.createElement("a"); a.href = withBase(routeHref(p.id)); a.textContent = p.name; a.className = "font-semibold underline";
        const s = document.createElement("div"); s.textContent = `${fmtKm(p.km)} · ${fmtM(p.gain)} D+`;
        box.append(a, s);
        new lib.Popup({ closeButton: false }).setLngLat(e.lngLat).setDOMContent(box).addTo(m);
      });
      m.on("mouseenter", "rs-line", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "rs-line", () => (m.getCanvas().style.cursor = ""));
    }
    (m.getSource("rs") as GeoJSONSource).setData({ type: "FeatureCollection", features: routes.map((r) => ({ type: "Feature", properties: { id: r.id, name: r.name, km: r.stats.distanceM, gain: r.stats.gainM }, geometry: { type: "LineString", coordinates: r.coords.map((c) => [c[0], c[1]]) } })) });
    const all = routes.flatMap((r) => [r.coords[0], r.coords[r.coords.length - 1]]).filter(Boolean);
    if (all.length) { const b = bboxOf(all); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 12, duration: 0 }); }
  }, [routes, ready, map, ml]);

  const km = routes.reduce((s, r) => s + r.stats.distanceM, 0), gain = routes.reduce((s, r) => s + r.stats.gainM, 0);
  return (
    <MapFrame className="h-[70vh] min-h-[24rem] overflow-hidden rounded-2xl ring-1 ring-ink-100" banner={<StatBanner title="Parcours affichés" items={[{ label: "Parcours", value: String(routes.length) }, { label: "Distance cumulée", value: fmtKm(km) }, { label: "D+ cumulé", value: fmtM(gain) }]} />}>
      <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte des parcours" /></div>
      <LayerControl map={map} ready={ready} />
    </MapFrame>
  );
}
