"use client";
import { useEffect, useMemo, useRef } from "react";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import { useMap } from "./use-map";
import { bboxOf, trackStats, fmtKm, fmtM } from "@/lib/geo";
import { MapFrame, StatBanner } from "./map-frame";
import { LayerControl } from "./layer-control";
import { type Poi, type Pt } from "@/lib/types";
import { poiMarkerEl, poiPopupEl } from "@/lib/poi-icons";
import { routeMarkerEl } from "@/lib/route-markers";

/** Carte en lecture seule : trace, départ/arrivée, POI, position active (survol du profil). */
export interface MapOverlay { segments: { from: number; to: number; color: string }[]; arrows: { lng: number; lat: number; toDeg: number; label: string; color: string; title: string }[] }

export function RouteMap({ coords, pois = [], activeIndex, className = "h-80", onTrackHover, title, overlay }: { coords: Pt[]; pois?: Poi[]; activeIndex?: number | null; className?: string; onTrackHover?: (i: number | null) => void; title?: string; overlay?: MapOverlay | null }) {
  const arrowMarks = useRef<Marker[]>([]);
  const st = useMemo(() => (coords.length > 1 ? trackStats(coords, 3) : null), [coords]);
  const { el, map, ml, ready } = useMap();
  const marks = useRef<Marker[]>([]);
  const active = useRef<Marker | null>(null);
  const hoverCb = useRef(onTrackHover); hoverCb.current = onTrackHover;
  const coordsRef = useRef(coords); coordsRef.current = coords;
  // clés de contenu : les marqueurs ne sont recréés que si le tracé ou les POI changent vraiment (pas à chaque survol qui re-rend la page)
  const poisKey = pois.map((p) => `${p.id}:${p.type}:${p.name}:${p.lng}:${p.lat}`).join("|");
  const coordsKey = `${coords.length}:${coords[0]?.join(",")}:${coords[coords.length - 1]?.join(",")}`;

  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (!m.getSource("t")) {
      m.addSource("t", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "t-casing", type: "line", source: "t", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 8 } });
      m.addLayer({ id: "t-line", type: "line", source: "t", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f0612b", "line-width": 4.5 } });
      m.on("mousemove", (e) => {
        if (!hoverCb.current) return;
        const c = coordsRef.current; let bi = -1, bd = Infinity;
        for (let i = 0; i < c.length; i += 1) { const d = (c[i][0] - e.lngLat.lng) ** 2 + (c[i][1] - e.lngLat.lat) ** 2; if (d < bd) { bd = d; bi = i; } }
        const px = bi >= 0 ? m.project([c[bi][0], c[bi][1]]) : null;
        hoverCb.current(px && Math.hypot(px.x - e.point.x, px.y - e.point.y) < 14 ? bi : null);
      });
    }
    (m.getSource("t") as GeoJSONSource).setData({ type: "FeatureCollection", features: coords.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords.map((c) => [c[0], c[1]]) } }] : [] });
    marks.current.forEach((x) => x.remove()); marks.current = [];
    const pin = (label: string, bg: string, p: [number, number], title: string, size = "size-6") => {
      const d = document.createElement("div"); d.className = `grid ${size} place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow`; d.style.background = bg; d.textContent = label; d.title = title;
      marks.current.push(new lib.Marker({ element: d }).setLngLat(p).addTo(m));
    };
    if (coords.length > 1) {
      const f = coords[0], l = coords[coords.length - 1];
      const loop = Math.abs(f[0] - l[0]) < 1e-4 && Math.abs(f[1] - l[1]) < 1e-4;
      const flag = (k: "start" | "finish" | "loop", at: readonly number[]) => marks.current.push(new lib.Marker({ element: routeMarkerEl(k), anchor: "bottom" }).setLngLat([at[0], at[1]]).addTo(m));
      if (loop) flag("loop", f); else { flag("start", f); flag("finish", l); }
      const b = bboxOf(coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 15, duration: 0 });
    }
    for (const p of pois) {
      const el = poiMarkerEl(p.type, p.name);
      el.addEventListener("click", (ev) => { ev.stopPropagation(); new lib.Popup({ closeButton: true, closeOnClick: false, offset: 40 }).setLngLat([p.lng, p.lat]).setDOMContent(poiPopupEl(p.type, p.name)).addTo(m); });
      marks.current.push(new lib.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m));
    }
  }, [coordsKey, poisKey, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tracé coloré par segment (ex. vent de face / dans le dos) et flèches
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready || !m.getSource("t")) return;
    if (!m.getSource("wx")) {
      m.addSource("wx", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "wx-line", type: "line", source: "wx", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5 } });
    }
    (m.getSource("wx") as GeoJSONSource).setData({ type: "FeatureCollection", features: (overlay?.segments ?? []).map((s) => ({ type: "Feature", properties: { color: s.color }, geometry: { type: "LineString", coordinates: coords.slice(s.from, s.to + 1).map((c) => [c[0], c[1]]) } })) });
    m.setPaintProperty("t-line", "line-opacity", overlay ? 0 : 1);
    arrowMarks.current.forEach((x) => x.remove()); arrowMarks.current = [];
    for (const a of overlay?.arrows ?? []) {
      const d = document.createElement("div"); d.title = a.title; d.className = "grid place-items-center";
      d.innerHTML = `<svg width="30" height="30" viewBox="0 0 30 30" style="transform:rotate(${a.toDeg}deg)" aria-hidden="true"><circle cx="15" cy="15" r="14" fill="#fff" stroke="${a.color}" stroke-width="2"/><path d="M15 5 L21 20 L15 16.5 L9 20 Z" fill="${a.color}"/></svg><span style="font:700 10px Inter,system-ui;background:#fff;border-radius:6px;padding:0 3px;margin-top:-4px;color:#0d1b17;box-shadow:0 0 0 1px ${a.color}">${a.label}</span>`;
      arrowMarks.current.push(new lib.Marker({ element: d }).setLngLat([a.lng, a.lat]).addTo(m));
    }
  }, [overlay, coords, ready, map, ml]);

  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (activeIndex == null || !coords[activeIndex]) { active.current?.remove(); active.current = null; return; }
    const c = coords[activeIndex];
    if (!active.current) { const d = document.createElement("div"); d.className = "size-4 rounded-full border-2 border-white bg-glacier-500 shadow-[0_0_0_5px_rgb(59_166_201/0.35)]"; active.current = new lib.Marker({ element: d }).setLngLat([c[0], c[1]]).addTo(m); }
    else active.current.setLngLat([c[0], c[1]]);
  }, [activeIndex, coords, ready, map, ml]);

  return (
    <MapFrame className={`overflow-hidden rounded-2xl ring-1 ring-ink-100 ${className}`} banner={<StatBanner title={title} items={st ? [{ label: "Distance", value: fmtKm(st.distanceM) }, { label: "D+", value: fmtM(st.gainM) }, { label: "D−", value: fmtM(st.lossM) }, { label: "Alt. min", value: fmtM(st.minEle) }, { label: "Alt. max", value: fmtM(st.maxEle) }] : [{ label: "Distance", value: "—" }]} />}>
      <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte du parcours" /></div>
      <LayerControl map={map} ready={ready} />
    </MapFrame>
  );
}
