"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Map as MLMap, Marker } from "maplibre-gl";
import { Search, LocateFixed, Loader2, Layers, Filter, Eye, EyeOff, X, MapPin, Plus, Trash2, Layers3 } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";
import { useAllRoutes } from "@/lib/route-vm";
import { sparkOf, type RouteVM } from "@/lib/route-model";
import { buildStyle } from "@/lib/basemaps";
import { LayerControl } from "@/components/map/layer-control";
import { Sheet, isMobileViewport, type SheetState } from "@/components/layout/sheet";
import { POI_KINDS, fetchPois, type PoiKind, type PoiFeature } from "@/lib/poi";
import { SPORTS, DIFFICULTY_LABEL, type Sport } from "@/lib/sports";
import { fmtKm, fmtM, fmtDuration } from "@/lib/geo";
import { ElevationSpark } from "@/components/ui/elevation-spark";
import { geocode } from "@/lib/geocode";
import { MapFrame, StatBanner } from "@/components/map/map-frame";
import { deleteLayer, saveLayers, useLayers } from "@/lib/repo";
import { uid } from "@/lib/types";
import { cloudEnabled } from "@/lib/cloud";
import { communityInBbox } from "@/lib/community";
import { routeHref, withBase } from "@/lib/url";
import { useGeo } from "@/components/home/geo-context";
import { BASE } from "@/lib/url";

const COMPARE_COLORS = ["#f0612b", "#3ba6c9", "#7a4bd1"];
const MAX_COMPARE = 3;
type Bounds = [number, number, number, number];

type DemoRoute = RouteVM;
const routeBox = (r: DemoRoute): Bounds => {
  const xs = r.coords.map((c) => c[0]), ys = r.coords.map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const intersects = (a: Bounds, b: Bounds) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

export function Explorer({ initial }: { initial?: { lng: number; lat: number } }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef<Marker[]>([]);
  const userMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sport, setSport] = useState<Sport | "all">("all");
  const [maxKm, setMaxKm] = useState(60);
  const [inView, setInView] = useState(false);
  const [poiKinds, setPoiKinds] = useState<PoiKind[]>([]);
  const [poiState, setPoiState] = useState<{ status: "idle" | "loading" | "error" | "zoom"; count?: number }>({ status: "idle" });
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"routes" | "calques" | "layers">("routes");
  const [sheet, setSheet] = useState<SheetState>("peek");
  const geo = useGeo();
  const allRoutes = useAllRoutes();
  const routeLayers = useLayers();
  const COMMUNITY = { id: "community", name: "Communauté (parcours publics)", color: "#c98a0b", builtin: true };
  const layerList = useMemo(() => [...routeLayers, ...(cloudEnabled ? [COMMUNITY] : [])], [routeLayers]); // eslint-disable-line react-hooks/exhaustive-deps
  const [communityCount, setCommunityCount] = useState<number | null>(null);
  const colorOfLayer = useMemo(() => new Map(layerList.map((l) => [l.id, l.color])), [layerList]);
  const [layerOff, setLayerOff] = useState<Set<string>>(new Set());
  const [newLayer, setNewLayer] = useState({ name: "", color: "#7a4bd1" });
  const BOXES = useMemo(() => new Map(allRoutes.map((r) => [r.id, routeBox(r)])), [allRoutes]);

  const visibleRoutes = useMemo(
    () => allRoutes.filter((r) => !layerOff.has(r.layer) && (sport === "all" || r.sport === sport) && r.stats.distanceM / 1000 <= maxKm && (!inView || !bounds || intersects(BOXES.get(r.id)!, bounds))),
    [allRoutes, BOXES, layerOff, sport, maxKm, inView, bounds],
  );
  const shown = useMemo(() => visibleRoutes.filter((r) => !hidden.has(r.id)), [visibleRoutes, hidden]);
  const compared = useMemo(() => selected.map((id) => allRoutes.find((r) => r.id === id)!).filter(Boolean), [selected, allRoutes]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_COMPARE ? [...s.slice(1), id] : [...s, id]));
  }, []);
  const toggleRef = useRef(toggleSelect);
  toggleRef.current = toggleSelect;

  // Initialisation de la carte
  useEffect(() => {
    let dead = false;
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl(`${location.origin}${BASE}/maplibre/maplibre-gl-worker.mjs`);
      if (dead || !el.current) return;
      mlRef.current = ml;
      const m = new ml.Map({ container: el.current, style: buildStyle(), center: initial ? [initial.lng, initial.lat] : [2.5, 46.6], zoom: initial ? 10 : 5.3, attributionControl: { compact: true } });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
      m.on("style.load", () => {
        m.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addSource("poi", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "routes-casing", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": ["case", ["get", "sel"], 8, 6], "line-opacity": 0.9 } });
        m.addLayer({ id: "routes-line", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "sel"], 5, 3.5] } });
        m.addLayer({ id: "poi", type: "circle", source: "poi", paint: { "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2, "circle-color": ["match", ["get", "kind"], ...Object.entries(POI_KINDS).flatMap(([k, v]) => [k, v.color]), "#888"] as unknown as string } });
        m.on("click", "routes-line", (e) => { const id = e.features?.[0]?.properties?.id; if (id) toggleRef.current(id); });
        m.on("click", "poi", (e) => {
          const f = e.features?.[0]; if (!f) return;
          const p = f.properties as { kind: PoiKind; name: string; ele?: string };
          const node = document.createElement("div");
          const b = document.createElement("strong"); b.textContent = p.name;
          const s = document.createElement("div"); s.textContent = POI_KINDS[p.kind].label + (p.ele ? ` · ${p.ele} m` : "");
          node.append(b, s);
          new ml.Popup({ closeButton: false }).setLngLat(e.lngLat).setDOMContent(node).addTo(m);
        });
        for (const l of ["routes-line", "poi"]) {
          m.on("mouseenter", l, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", l, () => (m.getCanvas().style.cursor = ""));
        }
        setReady(true);
      });
      const upd = () => { const b = m.getBounds(); setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]); };
      m.on("moveend", upd); upd();
      mapRef.current = m;
    })();
    return () => { dead = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [initial]);

  // Calque « Communauté » : parcours publiés par les membres (base de données), chargés selon l'emprise visible
  useEffect(() => {
    const m = mapRef.current, lib = mlRef.current; if (!m || !lib || !ready || !cloudEnabled || m.getSource("community")) return;
    m.addSource("community", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "community-casing", type: "line", source: "community", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 6 } });
    m.addLayer({ id: "community-line", type: "line", source: "community", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": COMMUNITY.color, "line-width": 3.5 } });
    m.on("click", "community-line", (e) => {
      const p = e.features?.[0]?.properties as { id: string; name: string; km: number; gain: number } | undefined; if (!p) return;
      const box = document.createElement("div"); const a = document.createElement("a"); a.href = withBase(routeHref(p.id)); a.textContent = p.name; a.className = "font-semibold underline";
      const s = document.createElement("div"); s.textContent = `${fmtKm(p.km)} · ${fmtM(p.gain)} D+ · publié par un membre`; box.append(a, s);
      new lib.Popup({ closeButton: false }).setLngLat(e.lngLat).setDOMContent(box).addTo(m);
    });
    m.on("mouseenter", "community-line", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "community-line", () => (m.getCanvas().style.cursor = ""));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = mapRef.current; if (!m || !ready || !cloudEnabled || !m.getSource("community")) return;
    const off = layerOff.has("community");
    for (const l of ["community-casing", "community-line"]) m.setLayoutProperty(l, "visibility", off ? "none" : "visible");
    if (off || !bounds || m.getZoom() < 8) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const rows = await communityInBbox(bounds, ctrl.signal);
        (m.getSource("community") as import("maplibre-gl").GeoJSONSource).setData({ type: "FeatureCollection", features: rows.map((r) => ({ type: "Feature", properties: { id: r.id, name: r.name, km: r.distance_m, gain: r.gain_m }, geometry: r.geometry })) });
        setCommunityCount(rows.length);
      } catch { /* hors ligne ou base indisponible : le calque reste vide */ }
    }, 500);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [bounds, layerOff, ready]);

  // Tracés
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return;
    (m.getSource("routes") as import("maplibre-gl").GeoJSONSource).setData({
      type: "FeatureCollection",
      features: shown.map((r) => {
        const i = selected.indexOf(r.id);
        return { type: "Feature", properties: { id: r.id, sel: i >= 0, color: i >= 0 ? COMPARE_COLORS[i] : colorOfLayer.get(r.layer) ?? "#f0612b" }, geometry: { type: "LineString", coordinates: r.coords.map((c) => [c[0], c[1]]) } };
      }),
    });
  }, [shown, selected, ready]);

  // Départ / arrivée des parcours sélectionnés
  useEffect(() => {
    const m = mapRef.current, ml = mlRef.current; if (!m || !ml || !ready) return;
    markers.current.forEach((x) => x.remove()); markers.current = [];
    for (const r of compared.filter((r) => shown.some((x) => x.id === r.id))) {
      const mk = (label: string, bg: string, pos: [number, number], title: string) => {
        const d = document.createElement("div");
        d.className = "grid size-6 place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow";
        d.style.background = bg; d.textContent = label; d.title = title;
        markers.current.push(new ml.Marker({ element: d }).setLngLat(pos).addTo(m));
      };
      const first = r.coords[0], last = r.coords[r.coords.length - 1];
      if (r.loop) mk("D/A", "#1e7a58", [first[0], first[1]], `Départ et arrivée : ${r.name}`);
      else { mk("D", "#1e7a58", [first[0], first[1]], `Départ : ${r.name}`); mk("A", "#0d1b17", [last[0], last[1]], `Arrivée : ${r.name}`); }
    }
  }, [compared, shown, ready]);


  // Points d'intérêt (données OSM via Overpass), rechargés après chaque déplacement
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return;
    const src = m.getSource("poi") as import("maplibre-gl").GeoJSONSource;
    if (!poiKinds.length) { src.setData({ type: "FeatureCollection", features: [] }); setPoiState({ status: "idle" }); return; }
    if (m.getZoom() < 11) { src.setData({ type: "FeatureCollection", features: [] }); setPoiState({ status: "zoom" }); return; }
    if (!bounds) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPoiState({ status: "loading" });
      try {
        const f: PoiFeature[] = await fetchPois(bounds, poiKinds, ctrl.signal);
        src.setData({ type: "FeatureCollection", features: f });
        setPoiState({ status: "idle", count: f.length });
      } catch (e) { if ((e as Error).name !== "AbortError") setPoiState({ status: "error" }); }
    }, 600);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [poiKinds, bounds, ready]);

  const fit = (r: DemoRoute) => { const b = BOXES.get(r.id)!; mapRef.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 14 }); };

  async function search(e: FormEvent) {
    e.preventDefault(); if (!q.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const hit = await geocode(q);
      if (!hit) { setMsg("Aucun lieu trouvé."); return; }
      mapRef.current?.flyTo({ center: [hit.lng, hit.lat], zoom: hit.zoom });
      setMsg(hit.label);
    } catch { setMsg("Recherche indisponible pour le moment."); } finally { setBusy(false); }
  }

  function locate() {
    setMsg(null);
    geo.request((p) => {
      const m = mapRef.current, ml = mlRef.current; if (!m || !ml) return;
      m.flyTo({ center: [p.lng, p.lat], zoom: 12 });
      userMarker.current?.remove();
      const d = document.createElement("div");
      d.className = "size-4 rounded-full border-2 border-white bg-glacier-500 shadow-[0_0_0_6px_rgb(59_166_201/0.3)]"; d.title = "Votre position";
      userMarker.current = new ml.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(m);
    }, setMsg);
  }

  const banner = compared.length ? (
    <div role="status" aria-label="Résumé" className="shrink-0 border-t border-ink-100 bg-white px-4 py-2.5">
      <ul className="grid gap-1">{compared.map((r, i) => (
        <li key={r.id} className="flex flex-wrap items-baseline gap-x-5 gap-y-0.5 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold"><span className="inline-block size-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} />{r.name}</span>
          <span><b className="font-display">{fmtKm(r.stats.distanceM)}</b> <span className="text-ink-400">distance</span></span>
          <span><b className="font-display">{fmtM(r.stats.gainM)}</b> <span className="text-ink-400">D+</span></span>
          <span><b className="font-display">{fmtM(r.stats.lossM)}</b> <span className="text-ink-400">D−</span></span>
          <span className="text-ink-500">{fmtDuration(r.durationMin)} · {fmtM(r.stats.minEle)}–{fmtM(r.stats.maxEle)}</span>
        </li>))}</ul>
    </div>
  ) : <StatBanner title="Parcours visibles sur la carte" items={[{ label: "Parcours", value: String(shown.length) }, { label: "Distance cumulée", value: fmtKm(shown.reduce((a, r) => a + r.stats.distanceM, 0)) }, { label: "D+ cumulé", value: fmtM(shown.reduce((a, r) => a + r.stats.gainM, 0)) }]} />;

  const chip = "rounded-full border px-3 py-1.5 text-sm font-medium transition";
  return (
    <div data-workspace className="relative h-[calc(100dvh-4rem-var(--bnav))] overflow-hidden lg:flex lg:min-h-[34rem]">
      <Sheet state={sheet} onState={setSheet} label="Parcours, calques et points d'intérêt" header={<>
        <form onSubmit={search} role="search" className="flex gap-2 border-b border-ink-100 p-3">
          <label className="relative flex-1"><span className="sr-only">Rechercher un lieu</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Adresse, lieu, massif…" className="h-10 w-full rounded-lg border border-ink-200 pl-9 pr-2 text-sm" />
          </label>
          <button className="grid size-10 place-items-center rounded-lg bg-pine-600 text-white hover:bg-pine-700" aria-label="Lancer la recherche">{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</button>
          <button type="button" onClick={locate} className="grid size-10 place-items-center rounded-lg border border-ink-200 hover:bg-ink-50" aria-label="Me géolocaliser" title="Me géolocaliser">{geo.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}</button>
        </form>
        {msg && <p className="border-b border-ink-100 px-3 py-2 text-xs text-ink-600" aria-live="polite">{msg}</p>}
        <div className="flex border-b border-ink-100 text-sm font-semibold" role="tablist">
          {([["routes", "Parcours", Filter], ["calques", "Calques", Layers3], ["layers", "POI", Layers]] as const).map(([id, l, I]) => (
            <button key={id} role="tab" aria-selected={panel === id} onClick={() => { setPanel(id); setSheet((x) => (x === "peek" ? "half" : x)); }} className={clsx("flex flex-1 items-center justify-center gap-1.5 py-2.5", panel === id ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}><I className="size-4" />{l}</button>
          ))}
        </div>
      </>}>
        <div className="p-3">
          {panel === "calques" ? (
            <div className="grid gap-4">
              <p className="text-xs text-ink-500">Un calque regroupe des parcours (les vôtres, ceux d'une organisation, un import personnel…). Affichez ou masquez-les, chacun a sa couleur.</p>
              <ul className="grid gap-2">{layerList.map((l) => { const n = l.id === "community" ? (communityCount ?? 0) : allRoutes.filter((r) => r.layer === l.id).length; const on = !layerOff.has(l.id); return (
                <li key={l.id} className="flex items-center gap-2 rounded-xl border border-ink-100 p-2.5">
                  <input aria-label={`Afficher ${l.name}`} type="checkbox" checked={on} onChange={() => setLayerOff((s) => { const x = new Set(s); if (x.has(l.id)) x.delete(l.id); else x.add(l.id); return x; })} className="size-4 accent-[var(--color-pine-600)]" />
                  <span className="size-3.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: l.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span><span className="text-xs text-ink-500">{n}</span>
                  {!l.builtin && <button aria-label={`Supprimer le calque ${l.name}`} className="grid size-7 place-items-center rounded hover:bg-ink-100" onClick={() => confirm(`Supprimer le calque « ${l.name} » ? Ses parcours sont conservés dans « Mes parcours ».`) && deleteLayer(l.id)}><Trash2 className="size-4" /></button>}
                </li>); })}</ul>
              <form className="grid gap-2 rounded-xl bg-ink-50 p-3" onSubmit={(e) => { e.preventDefault(); const name = newLayer.name.trim(); if (!name) return; saveLayers([...routeLayers, { id: `c-${uid().slice(0, 8)}`, name, color: newLayer.color }]); setNewLayer({ ...newLayer, name: "" }); }}>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-400">Nouveau calque</p>
                <div className="flex gap-2"><input aria-label="Nom du calque" className="h-10 min-w-0 flex-1 rounded-lg border border-ink-200 px-3 text-sm" placeholder="Ex. Trails de la région" maxLength={60} value={newLayer.name} onChange={(e) => setNewLayer({ ...newLayer, name: e.target.value })} /><input aria-label="Couleur du calque" type="color" className="h-10 w-12 rounded-lg border border-ink-200 bg-white p-1" value={newLayer.color} onChange={(e) => setNewLayer({ ...newLayer, color: e.target.value })} /></div>
                <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-pine-600 text-sm font-semibold text-white hover:bg-pine-700"><Plus className="size-4" />Créer le calque</button>
              </form>
              <p className="text-xs text-ink-500">Pour remplir un calque : <Link href="/fichiers/" className="font-semibold text-pine-700 underline">importez un fichier</Link> en choisissant le calque, ou changez le calque d'un parcours dans l'éditeur (onglet Infos).</p>
            </div>
          ) : panel === "layers" ? (
            <div className="grid gap-5">
              <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Points d'intérêt (OpenStreetMap)</legend>
                <div className="flex flex-wrap gap-2">{(Object.keys(POI_KINDS) as PoiKind[]).map((k) => {
                  const on = poiKinds.includes(k);
                  return <button key={k} aria-pressed={on} onClick={() => setPoiKinds((s) => (on ? s.filter((x) => x !== k) : [...s, k]))} className={clsx(chip, on ? "border-transparent text-white" : "border-ink-200 text-ink-700")} style={on ? { background: POI_KINDS[k].color } : undefined}>{POI_KINDS[k].label}</button>;
                })}</div>
                <p className="mt-2 text-xs text-ink-500" aria-live="polite">
                  {poiState.status === "zoom" && "Zoomez davantage (niveau 11+) pour charger les points."}
                  {poiState.status === "loading" && "Chargement…"}
                  {poiState.status === "error" && "Service de points d'intérêt indisponible. Réessayez en déplaçant la carte."}
                  {poiState.status === "idle" && poiState.count !== undefined && `${poiState.count} point(s) dans la zone.`}
                </p>
              </fieldset>
            </div>
          ) : (
            <div className="grid gap-4">
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {(["all", ...Object.keys(SPORTS)] as (Sport | "all")[]).map((s) => <button key={s} aria-pressed={sport === s} onClick={() => setSport(s)} className={clsx(chip, "!px-2.5 !py-1 text-xs", sport === s ? "border-pine-600 bg-pine-600 text-white" : "border-ink-200 text-ink-700")}>{s === "all" ? "Tous" : SPORTS[s].label}</button>)}
                </div>
                <label className="mt-3 block text-xs font-medium text-ink-600">Distance max : <b>{maxKm} km</b>
                  <input type="range" min={5} max={60} step={5} value={maxKm} onChange={(e) => setMaxKm(+e.target.value)} className="mt-1 w-full accent-[var(--color-pine-600)]" /></label>
                <label className="mt-2 flex items-center gap-2 text-xs font-medium text-ink-600"><input type="checkbox" checked={inView} onChange={(e) => setInView(e.target.checked)} className="accent-[var(--color-pine-600)]" />Seulement dans la zone visible</label>
              </div>
              <p className="text-xs text-ink-500">{visibleRoutes.length} parcours · cliquez pour comparer (max {MAX_COMPARE}).</p>
              <ul className="grid gap-2">
                {visibleRoutes.map((r) => {
                  const i = selected.indexOf(r.id), isH = hidden.has(r.id);
                  return (
                    <li key={r.id} className={clsx("rounded-xl border p-3", i >= 0 ? "border-ink-300 bg-ink-50" : "border-ink-100")} style={i >= 0 ? { borderLeft: `4px solid ${COMPARE_COLORS[i]}` } : undefined}>
                      <div className="flex items-start gap-2">
                        <button onClick={() => { toggleSelect(r.id); if (i < 0) fit(r); if (isMobileViewport()) setSheet("peek"); }} aria-pressed={i >= 0} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold">{r.name}</span>
                          <span className="text-xs text-ink-500">{SPORTS[r.sport].label} · {fmtKm(r.stats.distanceM)} · {fmtM(r.stats.gainM)} D+</span>
                        </button>
                        <button onClick={() => setHidden((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="grid size-8 place-items-center rounded-md text-ink-500 hover:bg-ink-100" aria-label={isH ? "Afficher la trace" : "Masquer la trace"}>{isH ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                      </div>
                    </li>);
                })}
                {!visibleRoutes.length && <li className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">Aucun parcours ne correspond à ces filtres.</li>}
              </ul>
            </div>
          )}
        </div>
      </Sheet>

      <MapFrame className="absolute inset-x-0 top-0 bottom-[8rem] lg:static lg:flex-1" banner={banner}>
        <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte interactive" /></div>
        <LayerControl map={mapRef} ready={ready} scope="explorer" />
        {compared.length > 0 && (
          <div className="absolute inset-x-2 bottom-8 z-10 max-h-[55%] overflow-auto rounded-xl bg-white/95 p-3 shadow-lift backdrop-blur lg:inset-x-auto lg:left-3 lg:w-[34rem]">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-sm font-bold">{compared.length > 1 ? "Comparaison" : "Parcours sélectionné"}</h2>
              <button onClick={() => setSelected([])} className="grid size-7 place-items-center rounded-md hover:bg-ink-100" aria-label="Fermer la comparaison"><X className="size-4" /></button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-xs">
              <thead><tr className="text-left text-ink-400"><th className="pb-1 font-medium">Parcours</th><th className="font-medium">Dist.</th><th className="font-medium">D+</th><th className="font-medium">D−</th><th className="font-medium">Alt. min/max</th><th className="font-medium">Durée</th><th className="font-medium">Diff.</th></tr></thead>
              <tbody>{compared.map((r, i) => (
                <tr key={r.id} className="border-t border-ink-100 align-middle">
                  <td className="py-1.5 pr-2"><span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} /><b>{r.name}</b>
                    <ElevationSpark values={sparkOf(r.coords)} stroke={COMPARE_COLORS[i]} className="mt-1 h-6 w-24" /></td>
                  <td>{fmtKm(r.stats.distanceM)}</td><td>{fmtM(r.stats.gainM)}</td><td>{fmtM(r.stats.lossM)}</td><td>{fmtM(r.stats.minEle)} / {fmtM(r.stats.maxEle)}</td><td>{fmtDuration(r.durationMin)}</td><td>{DIFFICULTY_LABEL[r.difficulty]}</td>
                </tr>))}</tbody></table></div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-400"><MapPin className="size-3" />D = départ, A = arrivée, D/A = boucle.</p>
          </div>
        )}
      </MapFrame>
    </div>
  );
}
