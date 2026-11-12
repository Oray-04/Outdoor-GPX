"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Play, Square } from "lucide-react";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import { useMap } from "./use-map";
import { bboxOf, haversine, trackStats, fmtKm, fmtM } from "@/lib/geo";
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

  // ── Vue 3D : relief (modèle d'altitude ouvert « Terrain Tiles »), photo aérienne IGN, caméra inclinée, survol du tracé ──
  const [three, setThree] = useState(false); const [fly, setFly] = useState(false); const [exag, setExag] = useState(1.4);
  const flyRef = useRef<number | null>(null); const saved = useRef<{ base: string | null }>({ base: null });
  const stopFly = useCallback(() => { if (flyRef.current != null) cancelAnimationFrame(flyRef.current); flyRef.current = null; setFly(false); }, []);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    if (three) {
      if (!m.getSource("dem")) m.addSource("dem", { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 14, attribution: "Relief : Terrain Tiles (Mapzen, données ouvertes dont IGN, SRTM)" });
      if (!m.getLayer("hill")) m.addLayer({ id: "hill", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#0a1514" } }, "t-casing");
      m.setTerrain({ source: "dem", exaggeration: exag });
      // vue aérienne : la photo IGN est affichée pendant la 3D (le choix de fond de l'utilisateur est rendu à la sortie)
      if (saved.current.base === null) { const vis = m.getStyle().layers.find((l) => l.id.startsWith("base-") && m.getLayoutProperty(l.id, "visibility") !== "none"); saved.current.base = vis?.id ?? ""; const c = m.getCenter(); if (m.getLayer("base-ign-photo") && c.lng > -5.5 && c.lng < 9.8 && c.lat > 41.2 && c.lat < 51.2) { if (vis) m.setLayoutProperty(vis.id, "visibility", "none"); m.setLayoutProperty("base-ign-photo", "visibility", "visible"); } }
      m.dragRotate.enable(); m.touchZoomRotate.enableRotation(); m.touchPitch.enable(); m.setMaxPitch(80);
      if (coords.length > 1) { const b = bboxOf(coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 14.5, pitch: 62, bearing: -20, duration: 1400 }); } else m.easeTo({ pitch: 62, duration: 900 });
    } else {
      stopFly();
      if (m.getTerrain()) m.setTerrain(null);
      if (m.getLayer("hill")) m.removeLayer("hill");
      if (saved.current.base !== null) { if (m.getLayer("base-ign-photo") && saved.current.base !== "base-ign-photo") m.setLayoutProperty("base-ign-photo", "visibility", "none"); if (saved.current.base && m.getLayer(saved.current.base)) m.setLayoutProperty(saved.current.base, "visibility", "visible"); saved.current.base = null; }
      m.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    }
  }, [three, ready, map]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const m = map.current; if (m && ready && three && m.getTerrain()) m.setTerrain({ source: "dem", exaggeration: exag }); }, [exag, three, ready, map]);
  // Survol : la caméra suit le tracé, orientée dans le sens de la marche
  const startFly = () => {
    const m = map.current; if (!m || coords.length < 2) return; stopFly(); setFly(true);
    const cum = [0]; for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
    const total = cum[cum.length - 1], dur = Math.min(90000, Math.max(20000, (total / 1000) * 1500)), t0 = performance.now();
    const at = (d: number): [number, number] => { let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const k = (lo + hi) >> 1; if (cum[k] <= d) lo = k; else hi = k; } const t = cum[hi] > cum[lo] ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0; return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t]; };
    let bearing = m.getBearing();
    const step = (now: number) => {
      const f = Math.min(1, (now - t0) / dur), d = f * total, p = at(d), q = at(Math.min(total, d + Math.max(150, total * 0.01)));
      const target = (Math.atan2((q[0] - p[0]) * Math.cos((p[1] * Math.PI) / 180), q[1] - p[1]) * 180) / Math.PI; const diff = ((target - bearing + 540) % 360) - 180; bearing += diff * 0.04; // rotation amortie
      m.jumpTo({ center: p, bearing, pitch: 66, zoom: Math.max(m.getZoom(), 13.6) });
      hoverCb.current?.(Math.min(coords.length - 1, cum.findIndex((c) => c >= d)));
      if (f < 1 && flyRef.current != null) flyRef.current = requestAnimationFrame(step); else { flyRef.current = null; setFly(false); }
    };
    flyRef.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { if (flyRef.current != null) cancelAnimationFrame(flyRef.current); }, []);

  return (
    <MapFrame className={`overflow-hidden rounded-2xl ring-1 ring-ink-100 ${className}`} banner={<StatBanner title={title} items={st ? [{ label: "Distance", value: fmtKm(st.distanceM) }, { label: "D+", value: fmtM(st.gainM) }, { label: "D−", value: fmtM(st.lossM) }, { label: "Alt. min", value: fmtM(st.minEle) }, { label: "Alt. max", value: fmtM(st.maxEle) }] : [{ label: "Distance", value: "—" }]} />}>
      <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte du parcours" /></div>
      <LayerControl map={map} ready={ready} />
      <div className="glass absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1 rounded-2xl p-1 text-sm">
        <button type="button" aria-pressed={three} onClick={() => setThree((v) => !v)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 font-semibold transition-colors ${three ? "bg-ink-900 text-white" : "text-ink-800 hover:bg-ink-900/[0.06]"}`} title="Vue 3D du relief (vue aérienne)"><Box className="size-4" />{three ? "Quitter la 3D" : "Vue 3D"}</button>
        {three && <>
          <button type="button" onClick={() => (fly ? stopFly() : startFly())} disabled={coords.length < 2} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 font-semibold text-ink-800 hover:bg-ink-900/[0.06]">{fly ? <><Square className="size-3.5" />Arrêter</> : <><Play className="size-3.5" />Survoler le parcours</>}</button>
          <label className="flex items-center gap-1.5 px-2 text-xs font-medium text-ink-600">Relief<input type="range" min={1} max={2.5} step={0.1} value={exag} onChange={(e) => setExag(+e.target.value)} aria-label="Exagération du relief" className="w-20" /><span className="w-7 font-display">×{exag.toFixed(1)}</span></label>
        </>}
      </div>
      {three && <p className="pointer-events-none absolute bottom-9 left-3 z-10 max-w-[18rem] rounded-lg bg-ink-950/80 px-2.5 py-1.5 text-[11px] text-white">Clic droit + glisser (ou deux doigts) pour pivoter et incliner · molette pour zoomer.</p>}
    </MapFrame>
  );
}
