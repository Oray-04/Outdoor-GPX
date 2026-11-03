"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Marker, GeoJSONSource } from "maplibre-gl";
import { Undo2, Redo2, Route as RouteIcon, MousePointer2, ArrowLeftRight, Repeat, Trash2, Copy, Scissors, Flag, Upload, Download, MapPin, Loader2, Check, AlertTriangle, Plus, Merge, LocateFixed } from "lucide-react";
import clsx from "clsx";
import { useMap, setBasemap, BasemapPicker } from "@/components/map/use-map";
import { ElevationChart, type ChartMarker } from "@/components/route/elevation-chart";
import { Button } from "@/components/ui/button";
import * as E from "@/lib/editor-core";
import { routeOnPaths, addElevation } from "@/lib/ign";
import { routesRepo } from "@/lib/repo";
import { POI_TYPES, TERRAINS, uid, type Poi, type PoiType, type Pt, type SavedRoute, type Visibility } from "@/lib/types";
import { SPORTS, DIFFICULTY_LABEL, difficultyOf, estimateMinutes, type Sport } from "@/lib/sports";
import { trackStats, fmtKm, fmtM, fmtDuration, bboxOf, cumulative } from "@/lib/geo";
import { buildProfile, distanceAlong } from "@/lib/profile";
import { FORMATS, parseAny, serialize, download, safeName, GpsFileError, MAX_BYTES, type GpsFormat } from "@/lib/formats";

type Tab = "trace" | "props" | "poi" | "fichiers";
interface Meta { name: string; description: string; sport: Sport; visibility: Visibility; terrain: string[]; region: string; country: string }
const DEFAULT_META: Meta = { name: "", description: "", sport: "trail", visibility: "prive", terrain: [], region: "", country: "" };
const SEG_COLOR = "#f0612b";

export function Editor({ routeId }: { routeId?: string }) {
  const { el, map, ml, ready } = useMap();
  const [hist, setHist] = useState<E.EState[]>([E.emptyState()]);
  const [hi, setHi] = useState(0);
  const st = hist[hi];
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  const [id, setId] = useState<string | undefined>(routeId);
  const createdAt = useRef<number>(Date.now());
  const sourceKind = useRef<SavedRoute["source"]>("creation");
  const fileName = useRef<string | undefined>(undefined);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("trace");
  const [poiMode, setPoiMode] = useState<PoiType | null>(null);
  const [coords, setCoords] = useState<Pt[]>([]);
  const [elev, setElev] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [basemap, setBase] = useState("ign-plan");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(!routeId);
  const markers = useRef<Marker[]>([]);
  const poiMarkers = useRef<Marker[]>([]);
  const hoverMarker = useRef<Marker | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fitted = useRef(false);

  // ── Historique ──────────────────────────────────────────────
  const commit = useCallback((next: E.EState) => { setHist((h) => [...h.slice(0, hi + 1), next].slice(-100)); setHi((i) => Math.min(i + 1, 99)); }, [hi]);
  const undo = useCallback(() => { setHi((i) => Math.max(0, i - 1)); setSel(null); }, []);
  const redo = useCallback(() => { setHi((i) => Math.min(hist.length - 1, i + 1)); setSel(null); }, [hist.length]);

  const run = useCallback(async (fn: () => Promise<E.OpResult>) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fn();
      commit(r.state);
      if (r.fallbacks) setMsg({ kind: "warn", text: "Aucun chemin trouvé pour un tronçon : tracé en ligne droite à la place." });
    } catch { setMsg({ kind: "err", text: "Opération impossible. Réessayez." }); } finally { setBusy(false); }
  }, [commit]);

  // ── Chargement d'un parcours existant ───────────────────────
  const didLoad = useRef(false);
  useEffect(() => {
    if (!routeId || didLoad.current) return;
    didLoad.current = true;
    const r = routesRepo.get(routeId);
    if (!r) { setMsg({ kind: "err", text: "Parcours introuvable sur cet appareil." }); setLoaded(true); return; }
    createdAt.current = r.createdAt; sourceKind.current = r.source; fileName.current = r.fileName;
    setMeta({ name: r.name, description: r.description, sport: r.sport, visibility: r.visibility, terrain: r.terrain, region: r.region, country: r.country });
    setHist([{ waypoints: r.waypoints, segs: r.segs, pois: r.pois }]); setHi(0);
    setCoords(r.coords); setElev("ok"); setLoaded(true);
  }, [routeId]);

  const track = useMemo(() => E.trackLL(st), [st]);

  // ── Altitudes (IGN) recalculées après chaque modification ───
  const firstLoad = useRef(!!routeId);
  useEffect(() => {
    if (!loaded) return;
    if (firstLoad.current) { firstLoad.current = false; return; } // coords déjà stockées
    if (track.length < 2) { setCoords([]); setElev("idle"); return; }
    const ctrl = new AbortController();
    setElev("loading");
    const t = setTimeout(async () => {
      try { setCoords(await addElevation(track, ctrl.signal)); setElev("ok"); }
      catch (e) { if ((e as Error).name !== "AbortError") { setCoords(track.map((p) => [p[0], p[1], 0] as Pt)); setElev("error"); } }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [track, loaded]);

  const stats = useMemo(() => (coords.length > 1 ? trackStats(coords, 3) : null), [coords]);
  const profile = useMemo(() => buildProfile(coords), [coords]);
  const cum = useMemo(() => cumulative(coords), [coords]);
  const durationMin = stats ? estimateMinutes(meta.sport, stats.distanceM, stats.gainM) : 0;
  const closed = E.isClosed(st);
  const chartMarkers: ChartMarker[] = useMemo(() => {
    if (coords.length < 2) return [];
    return st.pois.map((p) => ({ d: distanceAlong(coords, cum, p), label: POI_TYPES[p.type].letter, color: POI_TYPES[p.type].color, title: `${p.name} (${POI_TYPES[p.type].label})` }));
  }, [st.pois, coords, cum]);

  // ── Enregistrement automatique ──────────────────────────────
  const rid = useRef(id); rid.current = id;
  useEffect(() => {
    if (!loaded || st.waypoints.length < 2 || elev === "loading" || coords.length < 2) return;
    setSaved("saving");
    const t = setTimeout(async () => {
      const rId = rid.current ?? uid();
      if (!rid.current) { setId(rId); rid.current = rId; window.history.replaceState(null, "", `/creer?id=${rId}`); }
      let { region, country } = meta;
      if (!region && !country) {
        try {
          const c = coords[0];
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&accept-language=fr&lat=${c[1]}&lon=${c[0]}`);
          if (r.ok) { const j = (await r.json()) as { address?: { state?: string; country?: string } }; region = j.address?.state ?? ""; country = j.address?.country ?? ""; setMeta((m) => ({ ...m, region, country })); }
        } catch { /* optionnel */ }
      }
      const route: SavedRoute = { id: rId, name: meta.name.trim() || "Parcours sans titre", description: meta.description, sport: meta.sport, segs: st.segs, waypoints: st.waypoints, coords, pois: st.pois, terrain: meta.terrain, visibility: meta.visibility, region, country, source: sourceKind.current, fileName: fileName.current, createdAt: createdAt.current, updatedAt: Date.now() };
      const res = routesRepo.upsert(route);
      setSaved(res.ok ? "saved" : "error");
      if (!res.ok) setMsg({ kind: "err", text: res.error ?? "Enregistrement impossible." });
    }, 800);
    return () => clearTimeout(t);
  }, [st, meta, coords, elev, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Carte : sources/couches ─────────────────────────────────
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    m.addSource("track", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "track-casing", type: "line", source: "track", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 8 } });
    m.addLayer({ id: "track-line", type: "line", source: "track", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": SEG_COLOR, "line-width": 4.5 } });
    m.on("mouseenter", "track-line", () => (m.getCanvas().style.cursor = "copy"));
    m.on("mouseleave", "track-line", () => (m.getCanvas().style.cursor = ""));
  }, [ready, map]);

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    (m.getSource("track") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: track.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } }] : [] });
    if (!fitted.current && track.length > 1) { const b = bboxOf(track); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 70, maxZoom: 15, duration: 0 }); fitted.current = true; }
  }, [track, ready, map]);

  useEffect(() => { const m = map.current; if (m && ready) setBasemap(m, basemap); }, [basemap, ready, map]);

  // Clic sur la carte : ajoute un waypoint / un POI, ou insère un point sur le tracé
  const stRef = useRef(st); stRef.current = st;
  const clickRef = useRef<(lng: number, lat: number, px: { x: number; y: number }) => void>(() => {});
  clickRef.current = (lng, lat, px) => {
    const m = map.current; if (!m || busy) return;
    if (poiMode) {
      const poi: Poi = { id: uid(), type: poiMode, name: POI_TYPES[poiMode].label, lng, lat };
      commit({ ...st, pois: [...st.pois, poi] }); return;
    }
    const hit = m.queryRenderedFeatures([[px.x - 7, px.y - 7], [px.x + 7, px.y + 7]], { layers: ["track-line"] });
    if (hit.length && st.segs.length) {
      let best = { s: -1, v: -1, d: Infinity };
      st.segs.forEach((g, s) => g.forEach((p, v) => { const d = (p[0] - lng) ** 2 + (p[1] - lat) ** 2; if (d < best.d) best = { s, v, d }; }));
      const next = E.insertOnSegment(st, best.s, best.v);
      if (next !== st) { commit(next); return; }
    }
    run(() => E.addWaypoint(st, lng, lat, auto, routeOnPaths));
  };
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    const h = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number } }) => clickRef.current(e.lngLat.lng, e.lngLat.lat, e.point);
    m.on("click", h); return () => { m.off("click", h); };
  }, [ready, map]);

  // Marqueurs de waypoints (déplaçables)
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    markers.current.forEach((x) => x.remove()); markers.current = [];
    const n = st.waypoints.length;
    st.waypoints.forEach((w, i) => {
      const d = document.createElement("button");
      const first = i === 0, last = i === n - 1 && n > 1 && !closed;
      d.className = clsx("grid size-6 place-items-center rounded-full border-2 text-[10px] font-bold shadow-md", first ? "border-white bg-pine-600 text-white" : last ? "border-white bg-ink-900 text-white" : "border-pine-600 bg-white text-pine-700", sel === i && "ring-4 ring-ember-400/60");
      d.textContent = first ? "D" : last ? "A" : String(i);
      d.title = `Point ${i + 1} — glissez pour déplacer, cliquez pour sélectionner`;
      d.setAttribute("aria-label", d.title);
      d.addEventListener("click", (ev) => { ev.stopPropagation(); setSel(i); setTab("trace"); });
      const mk = new lib.Marker({ element: d, draggable: true }).setLngLat([w.lng, w.lat]).addTo(m);
      mk.on("dragend", () => { const p = mk.getLngLat(); run(() => E.moveWaypoint(stRef.current, i, p.lng, p.lat, routeOnPaths)); });
      markers.current.push(mk);
    });
  }, [st.waypoints, sel, closed, ready, map, ml, run]);

  // Marqueurs de POI
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    poiMarkers.current.forEach((x) => x.remove()); poiMarkers.current = [];
    for (const p of st.pois) {
      const d = document.createElement("div");
      d.className = "grid size-5 place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow";
      d.style.background = POI_TYPES[p.type].color; d.textContent = POI_TYPES[p.type].letter; d.title = `${p.name} (${POI_TYPES[p.type].label})`;
      poiMarkers.current.push(new lib.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(m));
    }
  }, [st.pois, ready, map, ml]);

  // Lien profil → carte
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (hoverIdx == null || !coords[hoverIdx]) { hoverMarker.current?.remove(); hoverMarker.current = null; return; }
    const c = coords[hoverIdx];
    if (!hoverMarker.current) { const d = document.createElement("div"); d.className = "size-4 rounded-full border-2 border-white bg-glacier-500 shadow-[0_0_0_5px_rgb(59_166_201/0.35)]"; hoverMarker.current = new lib.Marker({ element: d }).setLngLat([c[0], c[1]]).addTo(m); }
    else hoverMarker.current.setLngLat([c[0], c[1]]);
  }, [hoverIdx, coords, ready, map, ml]);

  // Clavier
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel != null) { e.preventDefault(); const i = sel; setSel(null); run(() => E.removeWaypoint(st, i, routeOnPaths)); }
      else if (e.key === "Escape") { setSel(null); setPoiMode(null); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [undo, redo, sel, st, run]);

  // ── Actions ─────────────────────────────────────────────────
  const reset = () => { if (st.waypoints.length && !confirm("Effacer le tracé en cours ? (le parcours déjà enregistré est conservé)")) return; setHist([E.emptyState()]); setHi(0); setId(undefined); rid.current = undefined; setMeta(DEFAULT_META); setCoords([]); setSel(null); fitted.current = false; sourceKind.current = "creation"; createdAt.current = Date.now(); window.history.replaceState(null, "", "/creer"); };

  async function saveSibling(state: E.EState, name: string): Promise<string> {
    const pts = await addElevation(E.trackLL(state));
    const nid = uid();
    routesRepo.upsert({ id: nid, name, description: meta.description, sport: meta.sport, segs: state.segs, waypoints: state.waypoints, coords: pts, pois: state.pois, terrain: meta.terrain, visibility: meta.visibility, region: meta.region, country: meta.country, source: "creation", createdAt: Date.now(), updatedAt: Date.now() });
    return nid;
  }
  const duplicate = async () => { setBusy(true); try { const nid = await saveSibling(st, `${meta.name || "Parcours"} (copie)`); window.location.assign(`/creer?id=${nid}`); } catch { setMsg({ kind: "err", text: "Duplication impossible (altitudes indisponibles)." }); } finally { setBusy(false); } };
  const split = async () => {
    if (sel == null) return; const parts = E.splitAt(st, sel);
    if (!parts) { setMsg({ kind: "warn", text: "Choisissez un point intermédiaire pour diviser le parcours." }); return; }
    setBusy(true);
    try { const nid = await saveSibling(parts[1], `${meta.name || "Parcours"} (2/2)`); setMeta((m) => ({ ...m, name: `${m.name || "Parcours"} (1/2)` })); commit(parts[0]); setSel(null); setMsg({ kind: "ok", text: `Parcours divisé : la 2ᵉ partie est enregistrée à part (${nid.slice(0, 6)}…).` }); }
    catch { setMsg({ kind: "err", text: "Division impossible (altitudes indisponibles)." }); } finally { setBusy(false); }
  };
  const mergeWith = (rid2: string) => { const r = routesRepo.get(rid2); if (!r) return; commit(E.merge(st, { waypoints: r.waypoints, segs: r.segs, pois: r.pois })); setMsg({ kind: "ok", text: `« ${r.name} » ajouté à la suite du tracé.` }); };

  async function importFile(f: File, mode: "replace" | "merge") {
    setMsg(null);
    if (f.size > MAX_BYTES) { setMsg({ kind: "err", text: "Fichier trop volumineux (25 Mo max)." }); return; }
    try {
      const p = parseAny(await f.text(), f.name);
      const imp = E.fromTrack(p.coords, p.pois);
      if (mode === "merge" && st.waypoints.length) commit(E.merge(st, imp));
      else { setHist([imp]); setHi(0); setMeta((m) => ({ ...m, name: m.name || p.name })); sourceKind.current = "import"; fileName.current = f.name; fitted.current = false; }
      setMsg({ kind: p.warnings.length ? "warn" : "ok", text: `${f.name} importé (${p.coords.length} points).${p.warnings.length ? " " + p.warnings.join(" ") : ""}` });
    } catch (e) { setMsg({ kind: "err", text: e instanceof GpsFileError ? e.message : "Lecture du fichier impossible." }); }
  }

  const exportAs = (f: GpsFormat) => { if (coords.length < 2) return; download(`${safeName(meta.name || "parcours")}.${FORMATS[f].ext}`, serialize(f, { name: meta.name || "Parcours", description: meta.description, coords, pois: st.pois }), FORMATS[f].mime); };
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => map.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 14 }), () => setMsg({ kind: "warn", text: "Position indisponible ou refusée." }));
  const others = routesRepo.useAll().filter((r) => r.id !== id);

  const tb = "grid size-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 disabled:opacity-35 disabled:hover:bg-transparent";
  const field = "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm";

  return (
    <div className="grid h-[calc(100dvh-4rem)] min-h-[40rem] grid-rows-[auto_1fr] lg:grid-cols-[1fr_22rem] lg:grid-rows-1">
      <div className="flex min-h-0 flex-col">
        <div className="relative min-h-[18rem] flex-1">
          <div className="absolute inset-0"><div ref={el} className="size-full" role="application" aria-label="Carte de l'éditeur : cliquez pour ajouter des points" /></div>
          <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1 rounded-xl bg-white/95 p-1 shadow-card">
            <div className="flex rounded-lg bg-ink-100 p-0.5 text-xs font-semibold" role="group" aria-label="Mode de tracé">
              <button aria-pressed={auto} onClick={() => setAuto(true)} className={clsx("flex items-center gap-1 rounded-md px-2 py-1.5", auto && "bg-white shadow")} title="Le tracé suit les chemins"><RouteIcon className="size-3.5" />Chemins</button>
              <button aria-pressed={!auto} onClick={() => setAuto(false)} className={clsx("flex items-center gap-1 rounded-md px-2 py-1.5", !auto && "bg-white shadow")} title="Ligne droite entre les points"><MousePointer2 className="size-3.5" />Libre</button>
            </div>
            <button className={tb} onClick={undo} disabled={hi === 0 || busy} aria-label="Annuler" title="Annuler (Ctrl+Z)"><Undo2 className="size-4" /></button>
            <button className={tb} onClick={redo} disabled={hi >= hist.length - 1 || busy} aria-label="Rétablir" title="Rétablir (Ctrl+Y)"><Redo2 className="size-4" /></button>
            <button className={tb} onClick={() => commit(E.reverse(st))} disabled={st.waypoints.length < 2 || busy} aria-label="Inverser le sens" title="Inverser le sens"><ArrowLeftRight className="size-4" /></button>
            <button className={tb} onClick={() => run(() => E.closeLoop(st, auto, routeOnPaths))} disabled={st.waypoints.length < 3 || closed || busy} aria-label="Fermer la boucle" title="Fermer la boucle"><Repeat className="size-4" /></button>
            <button className={tb} onClick={locate} aria-label="Me localiser" title="Me localiser"><LocateFixed className="size-4" /></button>
            <button className={tb} onClick={reset} aria-label="Nouveau parcours" title="Nouveau / effacer"><Trash2 className="size-4" /></button>
          </div>
          <div className="absolute right-14 top-3"><BasemapPicker value={basemap} onChange={setBase} /></div>
          <div className="pointer-events-none absolute bottom-8 left-3 flex flex-col gap-1.5">
            {busy && <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1 text-xs shadow"><Loader2 className="size-3.5 animate-spin" />Calcul du tracé…</span>}
            {poiMode && <span className="rounded-lg bg-ember-500 px-2.5 py-1 text-xs font-semibold text-white shadow">Cliquez sur la carte pour placer : {POI_TYPES[poiMode].label} (Échap pour annuler)</span>}
            {msg && <span role="status" className={clsx("pointer-events-auto max-w-sm rounded-lg px-2.5 py-1.5 text-xs shadow", msg.kind === "err" ? "bg-danger text-white" : msg.kind === "warn" ? "bg-warn text-white" : "bg-pine-600 text-white")}>{msg.text}</span>}
            {!st.waypoints.length && loaded && <span className="rounded-lg bg-white/95 px-2.5 py-1.5 text-xs shadow">Cliquez sur la carte pour poser le départ, puis les points suivants.</span>}
          </div>
        </div>
        <div className="border-t border-ink-100 bg-white p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
            <span className="font-semibold text-ink-700">Profil altimétrique</span>
            <span aria-live="polite">{elev === "loading" ? "Altitudes en cours de calcul…" : elev === "error" ? "Altitudes IGN indisponibles : profil à plat" : "Altitudes IGN (RGE ALTI)"}</span>
          </div>
          <ElevationChart ref={chartRef} points={profile} markers={chartMarkers} onHover={setHoverIdx} height={170} />
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-t border-ink-100 bg-white lg:border-l lg:border-t-0">
        <div className="sticky top-0 z-10 border-b border-ink-100 bg-white">
          <div className="flex items-center justify-between px-3 pt-2 text-xs">
            <span className="font-semibold text-ink-700">{meta.name || "Nouveau parcours"}</span>
            <span className={clsx("inline-flex items-center gap-1", saved === "error" ? "text-danger" : "text-ink-500")} aria-live="polite">
              {saved === "saving" && <><Loader2 className="size-3 animate-spin" />Enregistrement…</>}
              {saved === "saved" && <><Check className="size-3 text-pine-600" />Enregistré sur cet appareil</>}
              {saved === "error" && <><AlertTriangle className="size-3" />Non enregistré</>}
            </span>
          </div>
          <div className="flex text-sm font-semibold" role="tablist">
            {([["trace", "Tracé"], ["props", "Infos"], ["poi", "POI"], ["fichiers", "Fichiers"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("flex-1 py-2.5", tab === k ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}>{l}</button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 p-4">
          {tab === "trace" && (<>
            <dl className="grid grid-cols-2 gap-3">
              {[["Distance", stats ? fmtKm(stats.distanceM) : "—"], ["Durée estimée", stats ? fmtDuration(durationMin) : "—"], ["D+", stats ? fmtM(stats.gainM) : "—"], ["D−", stats ? fmtM(stats.lossM) : "—"], ["Altitude min", stats ? fmtM(stats.minEle) : "—"], ["Altitude max", stats ? fmtM(stats.maxEle) : "—"]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-ink-50 p-3"><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{l}</dt><dd className="font-display text-lg font-bold">{v}</dd></div>
              ))}
            </dl>
            {stats && <p className="text-sm text-ink-600">Difficulté : <b>{DIFFICULTY_LABEL[difficultyOf(stats.distanceM, stats.gainM)]}</b> · {closed ? "Boucle" : "Parcours linéaire"} · Terrain : {meta.terrain.length ? meta.terrain.join(", ") : <i>à renseigner dans Infos</i>}</p>}
            <p className="text-xs text-ink-400">La durée est une estimation selon la discipline, la distance et le dénivelé.</p>
            <div className="rounded-xl border border-ink-100 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">{sel != null ? `Point ${sel + 1} sélectionné` : "Points de passage"}</p>
              {sel != null ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => { const i = sel; setSel(null); run(() => E.removeWaypoint(st, i, routeOnPaths)); }}><Trash2 className="size-4" />Supprimer</Button>
                  <Button size="sm" variant="secondary" disabled={!closed || sel === 0 || sel === st.waypoints.length - 1} title={closed ? "" : "Disponible sur une boucle"} onClick={() => { commit(E.setStart(st, sel)); setSel(null); }}><Flag className="size-4" />Départ ici</Button>
                  <Button size="sm" variant="secondary" disabled={busy || sel === 0 || sel === st.waypoints.length - 1} onClick={split}><Scissors className="size-4" />Diviser ici</Button>
                </div>
              ) : <p className="text-sm text-ink-500">{st.waypoints.length} point(s). Cliquez sur un marqueur pour le sélectionner, glissez-le pour le déplacer, cliquez sur le tracé pour insérer un point.</p>}
            </div>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy || st.waypoints.length < 2} onClick={duplicate}><Copy className="size-4" />Dupliquer</Button></div>
          </>)}

          {tab === "props" && (<>
            <label className="grid gap-1 text-sm font-medium">Nom<input className={field} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Ex. Boucle du lac" maxLength={120} /></label>
            <label className="grid gap-1 text-sm font-medium">Description<textarea className={field} rows={4} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={2000} /></label>
            <label className="grid gap-1 text-sm font-medium">Discipline<select className={field} value={meta.sport} onChange={(e) => setMeta({ ...meta, sport: e.target.value as Sport })}>{Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <fieldset><legend className="mb-1 text-sm font-medium">Types de terrain (déclarés)</legend><div className="flex flex-wrap gap-1.5">{TERRAINS.map((t) => { const on = meta.terrain.includes(t); return <button key={t} type="button" aria-pressed={on} onClick={() => setMeta({ ...meta, terrain: on ? meta.terrain.filter((x) => x !== t) : [...meta.terrain, t] })} className={clsx("rounded-full border px-3 py-1 text-xs font-medium", on ? "border-pine-600 bg-pine-600 text-white" : "border-ink-200")}>{t}</button>; })}</div></fieldset>
            <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-sm font-medium">Région<input className={field} value={meta.region} onChange={(e) => setMeta({ ...meta, region: e.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Pays<input className={field} value={meta.country} onChange={(e) => setMeta({ ...meta, country: e.target.value })} /></label></div>
            <label className="grid gap-1 text-sm font-medium">Visibilité<select className={field} value={meta.visibility} onChange={(e) => setMeta({ ...meta, visibility: e.target.value as Visibility })}><option value="prive">Privé</option><option value="public">Public</option></select></label>
            <p className="text-xs text-ink-400">La visibilité « Public » sera effective avec les comptes (étape 2). Pour l'instant tout reste sur cet appareil.</p>
          </>)}

          {tab === "poi" && (<>
            <p className="text-sm text-ink-600">Choisissez un type puis cliquez sur la carte.</p>
            <div className="flex flex-wrap gap-1.5">{(Object.keys(POI_TYPES) as PoiType[]).map((t) => <button key={t} aria-pressed={poiMode === t} onClick={() => setPoiMode(poiMode === t ? null : t)} className={clsx("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium", poiMode === t ? "border-transparent text-white" : "border-ink-200")} style={poiMode === t ? { background: POI_TYPES[t].color } : undefined}><MapPin className="size-3.5" />{POI_TYPES[t].label}</button>)}</div>
            <ul className="grid gap-2">{st.pois.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-ink-100 p-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: POI_TYPES[p.type].color }}>{POI_TYPES[p.type].letter}</span>
                <input aria-label="Nom du point" className="min-w-0 flex-1 rounded border border-transparent px-1 py-0.5 text-sm hover:border-ink-200" value={p.name} onChange={(e) => commit({ ...st, pois: st.pois.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })} />
                <button aria-label="Supprimer le point" className="grid size-7 place-items-center rounded hover:bg-ink-100" onClick={() => commit({ ...st, pois: st.pois.filter((x) => x.id !== p.id) })}><Trash2 className="size-4" /></button>
              </li>))}
              {!st.pois.length && <li className="text-sm text-ink-400">Aucun point d'intérêt.</li>}</ul>
          </>)}

          {tab === "fichiers" && (<>
            <input ref={fileInput} type="file" accept=".gpx,.kml,.geojson,.json,.tcx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f, (e.currentTarget.dataset.mode as "replace" | "merge") ?? "replace"); e.target.value = ""; }} />
            <div className="grid gap-2">
              <Button variant="secondary" onClick={() => { fileInput.current!.dataset.mode = "replace"; fileInput.current!.click(); }}><Upload className="size-4" />Importer un fichier (remplace)</Button>
              <Button variant="secondary" disabled={!st.waypoints.length} onClick={() => { fileInput.current!.dataset.mode = "merge"; fileInput.current!.click(); }}><Plus className="size-4" />Importer et fusionner à la suite</Button>
              <p className="text-xs text-ink-400">GPX, KML, GeoJSON, TCX — 25 Mo max.</p>
            </div>
            <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Exporter</p>
              <div className="grid grid-cols-2 gap-2">{(Object.keys(FORMATS) as GpsFormat[]).map((f) => <Button key={f} size="sm" variant="secondary" disabled={coords.length < 2} onClick={() => exportAs(f)}><Download className="size-4" />{FORMATS[f].label}</Button>)}</div>
            </div>
            <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Fusionner avec un parcours enregistré</p>
              {others.length ? <select className={field} defaultValue="" onChange={(e) => { if (e.target.value) { mergeWith(e.target.value); e.target.value = ""; } }}><option value="" disabled>Choisir…</option>{others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select> : <p className="text-sm text-ink-400">Aucun autre parcours enregistré.</p>}
              <p className="mt-1 flex items-center gap-1 text-xs text-ink-400"><Merge className="size-3" />Le parcours choisi est ajouté après l'arrivée actuelle.</p>
            </div>
          </>)}
        </div>
      </aside>
    </div>
  );
}
