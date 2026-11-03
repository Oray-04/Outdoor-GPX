"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Map as MLMap, Marker } from "maplibre-gl";
import { Search, LocateFixed, Loader2, Layers, Filter, Eye, EyeOff, X, MapPin } from "lucide-react";
import clsx from "clsx";
import { useAllRoutes } from "@/lib/route-vm";
import { sparkOf, type RouteVM } from "@/lib/route-model";
import { BASEMAPS, OVERLAYS, buildStyle } from "@/lib/basemaps";
import { POI_KINDS, fetchPois, type PoiKind, type PoiFeature } from "@/lib/poi";
import { SPORTS, DIFFICULTY_LABEL, type Sport } from "@/lib/sports";
import { fmtKm, fmtM, fmtDuration } from "@/lib/geo";
import { DemoBadge } from "@/components/ui/badge";
import { ElevationSpark } from "@/components/ui/elevation-spark";
import { geocode } from "@/lib/geocode";
import { useGeo } from "@/components/home/geo-context";

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
  const [basemap, setBasemap] = useState(BASEMAPS[0].id);
  const [overlays, setOverlays] = useState<string[]>([]);
  const [poiKinds, setPoiKinds] = useState<PoiKind[]>([]);
  const [poiState, setPoiState] = useState<{ status: "idle" | "loading" | "error" | "zoom"; count?: number }>({ status: "idle" });
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"routes" | "layers">("routes");
  const geo = useGeo();
  const allRoutes = useAllRoutes();
  const BOXES = useMemo(() => new Map(allRoutes.map((r) => [r.id, routeBox(r)])), [allRoutes]);

  const visibleRoutes = useMemo(
    () => allRoutes.filter((r) => (sport === "all" || r.sport === sport) && r.stats.distanceM / 1000 <= maxKm && (!inView || !bounds || intersects(BOXES.get(r.id)!, bounds))),
    [allRoutes, BOXES, sport, maxKm, inView, bounds],
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
      ml.setWorkerUrl(`${location.origin}/maplibre/maplibre-gl-worker.mjs`);
      if (dead || !el.current) return;
      mlRef.current = ml;
      const m = new ml.Map({ container: el.current, style: buildStyle(), center: initial ? [initial.lng, initial.lat] : [2.5, 46.6], zoom: initial ? 10 : 5.3, attributionControl: { compact: true } });
      m.addControl(new ml.NavigationControl(), "top-right");
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

  // Tracés
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return;
    (m.getSource("routes") as import("maplibre-gl").GeoJSONSource).setData({
      type: "FeatureCollection",
      features: shown.map((r) => {
        const i = selected.indexOf(r.id);
        return { type: "Feature", properties: { id: r.id, sel: i >= 0, color: i >= 0 ? COMPARE_COLORS[i] : "#f0612b" }, geometry: { type: "LineString", coordinates: r.coords.map((c) => [c[0], c[1]]) } };
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

  // Fond de carte
  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return;
    for (const b of BASEMAPS) m.setLayoutProperty(`base-${b.id}`, "visibility", b.id === basemap ? "visible" : "none");
  }, [basemap, ready]);

  useEffect(() => {
    const m = mapRef.current; if (!m || !ready) return;
    for (const o of OVERLAYS) m.setLayoutProperty(`ovl-${o.id}`, "visibility", overlays.includes(o.id) ? "visible" : "none");
  }, [overlays, ready]);

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

  const chip = "rounded-full border px-3 py-1.5 text-sm font-medium transition";
  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[34rem] flex-col lg:flex-row">
      <aside className="order-2 flex max-h-[48%] min-h-0 w-full flex-col border-ink-100 bg-white lg:order-1 lg:max-h-none lg:w-[23rem] lg:border-r">
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
          {([["routes", "Parcours", Filter], ["layers", "Fonds & POI", Layers]] as const).map(([id, l, I]) => (
            <button key={id} role="tab" aria-selected={panel === id} onClick={() => setPanel(id)} className={clsx("flex flex-1 items-center justify-center gap-1.5 py-2.5", panel === id ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}><I className="size-4" />{l}</button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {panel === "layers" ? (
            <div className="grid gap-5">
              <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Fond de carte</legend>
                <div className="grid gap-2">{BASEMAPS.map((b) => (
                  <label key={b.id} className={clsx("cursor-pointer rounded-lg border p-3 text-sm", basemap === b.id ? "border-pine-500 bg-pine-50" : "border-ink-200")}>
                    <input type="radio" name="bm" className="mr-2 accent-[var(--color-pine-600)]" checked={basemap === b.id} onChange={() => setBasemap(b.id)} /><b>{b.label}</b>
                    <p className="mt-1 text-xs text-ink-500">{b.note}</p>
                  </label>))}
                </div>
                <div className="mt-3 grid gap-2">{OVERLAYS.map((o) => (
                  <label key={o.id} className="cursor-pointer rounded-lg border border-ink-200 p-3 text-sm"><input type="checkbox" className="mr-2 accent-[var(--color-pine-600)]" checked={overlays.includes(o.id)} onChange={(e) => setOverlays((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))} /><b>{o.label}</b><p className="mt-1 text-xs text-ink-500">{o.note}</p></label>))}</div>
              </fieldset>
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
                        <button onClick={() => { toggleSelect(r.id); if (i < 0) fit(r); }} aria-pressed={i >= 0} className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-sm font-semibold">{r.name}</span>
                          <span className="text-xs text-ink-500">{SPORTS[r.sport].label} · {fmtKm(r.stats.distanceM)} · {fmtM(r.stats.gainM)} D+</span>
                        </button>
                        <button onClick={() => setHidden((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="grid size-8 place-items-center rounded-md text-ink-500 hover:bg-ink-100" aria-label={isH ? "Afficher la trace" : "Masquer la trace"}>{isH ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                      </div>
                    </li>);
                })}
                {!visibleRoutes.length && <li className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">Aucun parcours ne correspond à ces filtres.</li>}
              </ul>
              <p className="flex items-center gap-1.5 text-xs text-ink-400"><DemoBadge />Les parcours « (démo) » sont des données de démonstration ; vos parcours enregistrés apparaissent aussi ici.</p>
            </div>
          )}
        </div>
      </aside>

      <div className="relative order-1 min-h-[16rem] flex-1 lg:order-2">
        <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte interactive" /></div>
        {compared.length > 0 && (
          <div className="absolute inset-x-2 bottom-8 z-10 max-h-[55%] overflow-auto rounded-xl bg-white/95 p-3 shadow-lift backdrop-blur lg:inset-x-auto lg:left-3 lg:w-[34rem]">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-sm font-bold">{compared.length > 1 ? "Comparaison" : "Parcours sélectionné"}</h2>
              <button onClick={() => setSelected([])} className="grid size-7 place-items-center rounded-md hover:bg-ink-100" aria-label="Fermer la comparaison"><X className="size-4" /></button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-xs">
              <thead><tr className="text-left text-ink-400"><th className="pb-1 font-medium">Parcours</th><th className="font-medium">Dist.</th><th className="font-medium">D+</th><th className="font-medium">D−</th><th className="font-medium">Alt. min/max</th><th className="font-medium">Durée</th><th className="font-medium">Diff.</th></tr></thead>
              <tbody>{compared.map((r, i) => (
                <tr key={r.id} className="border-t border-ink-100 align-middle">
                  <td className="py-1.5 pr-2"><span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} /><b>{r.name.replace(" (démo)", "")}</b>
                    <ElevationSpark values={sparkOf(r.coords)} stroke={COMPARE_COLORS[i]} className="mt-1 h-6 w-24" /></td>
                  <td>{fmtKm(r.stats.distanceM)}</td><td>{fmtM(r.stats.gainM)}</td><td>{fmtM(r.stats.lossM)}</td><td>{fmtM(r.stats.minEle)} / {fmtM(r.stats.maxEle)}</td><td>{fmtDuration(r.durationMin)}</td><td>{DIFFICULTY_LABEL[r.difficulty]}</td>
                </tr>))}</tbody></table></div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-400"><MapPin className="size-3" />D = départ, A = arrivée, D/A = boucle.</p>
          </div>
        )}
      </div>
    </div>
  );
}
