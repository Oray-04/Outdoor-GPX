"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Marker, GeoJSONSource } from "maplibre-gl";
import { Undo2, Redo2, Route, Route as RouteIcon, MousePointer2, ArrowLeftRight, Repeat, Trash2, Copy, Scissors, Flag, Upload, Download, MapPin, Loader2, Check, AlertTriangle, Plus, Merge, LocateFixed, Wand2, Save as SaveIcon, Bike, MountainSnow, Zap, Footprints } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { Sheet, type SheetState } from "@/components/layout/sheet";
import { MapFrame, StatBanner } from "@/components/map/map-frame";
import { ElevationChart, type ChartMarker } from "@/components/route/elevation-chart";
import { Button } from "@/components/ui/button";
import { PoiIcon } from "@/components/ui/poi-icon";
import { poiMarkerEl, poiPopupEl } from "@/lib/poi-icons";
import { routeMarkerEl } from "@/lib/route-markers";
import * as E from "@/lib/editor-core";
import { addElevation, seedElevations } from "@/lib/ign";
import { ENGINE_LABEL, PROFILE_HINT, SOURCE_LABEL, makeRouter, profileForSport, snapToPaths, type Engine, type Source } from "@/lib/routing";
import { setEnginePref, useEnginePref } from "@/lib/map-prefs";
import { routesRepo, useLayers, useTerrains } from "@/lib/repo";
import { POI_TYPES, normalizePois, uid, type LL, type Poi, type PoiType, type Pt, type SavedRoute, type Visibility } from "@/lib/types";
import { SPORTS, DIFFICULTY_LABEL, difficultyOf, estimateMinutes, type Sport } from "@/lib/sports";
import { haversine, trackStats, fmtKm, fmtM, fmtDuration, bboxOf, cumulative } from "@/lib/geo";
import { buildProfile, distanceAlong } from "@/lib/profile";
import { FORMATS, parseAny, serialize, download, safeName, GpsFileError, MAX_BYTES, type GpsFormat } from "@/lib/formats";
import { editorHref, withBase } from "@/lib/url";

type Tab = "trace" | "props" | "poi" | "fichiers";
interface Meta { name: string; description: string; sport: Sport; visibility: Visibility; terrain: string[]; region: string; country: string; layer: string; sourceUrl: string }
const DEFAULT_META: Meta = { name: "", description: "", sport: "trail", visibility: "prive", terrain: [], region: "", country: "", layer: "mine", sourceUrl: "" };
const SEG_COLOR = "#f0612b";

export function Editor({ routeId }: { routeId?: string }) {
  const terrains = useTerrains();
  const layers = useLayers();
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
  const engine = useEnginePref();
  const [lastSource, setLastSource] = useState<Source | null>(null);
  const [aligning, setAligning] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>("peek");
  const [cutMode, setCutMode] = useState(false);
  const [cutKeys, setCutKeys] = useState<string[]>([]);
  const [madeParts, setMadeParts] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("trace");
  const [poiMode, setPoiMode] = useState<PoiType | null>(null);
  const [selPoi, setSelPoi] = useState<string | null>(null);
  const [coords, setCoords] = useState<Pt[]>([]);
  const [elev, setElev] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
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
  const createdHere = useRef<string | null>(null);
  useEffect(() => {
    if (!routeId || didLoad.current || createdHere.current === routeId) return; // parcours créé ici puis enregistré : déjà en mémoire, ne pas le recharger
    didLoad.current = true;
    const r = routesRepo.get(routeId);
    if (!r) { setMsg({ kind: "err", text: "Parcours introuvable sur cet appareil." }); setLoaded(true); return; }
    createdAt.current = r.createdAt; sourceKind.current = r.source; fileName.current = r.fileName;
    setMeta({ name: r.name, description: r.description, sport: r.sport, visibility: r.visibility, terrain: r.terrain, region: r.region, country: r.country, layer: r.layer === "fkt" || !r.layer ? "mine" : r.layer, sourceUrl: r.sourceUrl ?? "" });
    setHist([{ waypoints: r.waypoints, segs: r.segs, pois: normalizePois(r.pois) }]); setHi(0);
    seedElevations(r.coords); setCoords(r.coords); setElev("ok"); setLoaded(true);
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

  // ── Enregistrement MANUEL : rien n'est écrit dans la bibliothèque tant que l'utilisateur n'a pas cliqué « Enregistrer » ──
  const rid = useRef(id); rid.current = id;
  const savedSt = useRef<E.EState | null>(null), savedMeta = useRef<string>("");
  const [, bump] = useState(0);
  // parcours chargé depuis la bibliothèque : son état de départ est l'état enregistré
  useEffect(() => { if (loaded && savedSt.current === null) { savedSt.current = st; savedMeta.current = JSON.stringify(meta); bump((n) => n + 1); } }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const metaKey = JSON.stringify(meta);
  const hasTrack = st.waypoints.length >= 2;
  const dirty = loaded && savedSt.current !== null && (st !== savedSt.current || metaKey !== savedMeta.current) && (hasTrack || !!rid.current);
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const saveRef = useRef<() => void>(() => {});
  const canSave = dirty && hasTrack && elev !== "loading" && coords.length >= 2 && saved !== "saving";
  const save = useCallback(async (): Promise<boolean> => {
    if (st.waypoints.length < 2 || coords.length < 2) { setMsg({ kind: "warn", text: "Tracez au moins deux points avant d'enregistrer." }); return false; }
    setSaved("saving");
    const rId = rid.current ?? uid();
    const { region, country } = meta;
    const nextMeta = meta;
    const route: SavedRoute = { id: rId, name: meta.name.trim() || "Parcours sans titre", description: meta.description, sport: meta.sport, segs: st.segs, waypoints: st.waypoints, coords, pois: st.pois, terrain: meta.terrain, visibility: meta.visibility, region, country, layer: meta.layer, sourceUrl: /^https?:\/\//.test(meta.sourceUrl) ? meta.sourceUrl : undefined, source: sourceKind.current, fileName: fileName.current, createdAt: createdAt.current, updatedAt: Date.now() };
    const res = routesRepo.upsert(route);
    if (!res.ok) { setSaved("error"); setMsg({ kind: "err", text: res.error ?? "Enregistrement impossible." }); return false; }
    if (!rid.current) { createdHere.current = rId; setId(rId); rid.current = rId; window.history.replaceState(null, "", withBase(editorHref(rId))); }
    savedSt.current = st; savedMeta.current = JSON.stringify(nextMeta); setMeta(nextMeta); setSaved("saved");
    setMsg({ kind: "ok", text: "Parcours enregistré dans votre bibliothèque." });
    // Région et pays : complétés ensuite, sans retarder l'enregistrement (service facultatif, 6 s au plus)
    if (!region && !country) {
      const c = coords[0], ac = new AbortController(), tm = setTimeout(() => ac.abort(), 6000);
      fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&accept-language=fr&lat=${c[1]}&lon=${c[0]}`, { signal: ac.signal }).then((r) => (r.ok ? r.json() : null)).then((j: { address?: { state?: string; country?: string } } | null) => {
        const rg = j?.address?.state ?? "", ct = j?.address?.country ?? ""; if (!rg && !ct) return;
        const cur = routesRepo.get(rId); if (cur && !cur.region && !cur.country) routesRepo.upsert({ ...cur, region: rg, country: ct });
        setMeta((m) => { if (m.region || m.country) return m; const n = { ...m, region: rg, country: ct }; if (JSON.stringify(m) === savedMeta.current) savedMeta.current = JSON.stringify(n); return n; });
      }).catch(() => { /* facultatif */ }).finally(() => clearTimeout(tm));
    }
    return true;
  }, [st, meta, coords]);
  saveRef.current = () => { if (canSave) save(); else if (dirtyRef.current && elev === "loading") setMsg({ kind: "warn", text: "Altitudes en cours de calcul : réessayez dans un instant." }); };
  // Quitter sans enregistrer : avertissement du navigateur (fermeture, rechargement) et confirmation sur les liens du site
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.origin !== location.origin || (a.pathname === location.pathname && a.search === location.search)) return;
      if (!window.confirm("Vous avez des modifications non enregistrées. Si vous quittez cette page, elles seront perdues.\n\nQuitter sans enregistrer ?")) { e.preventDefault(); e.stopPropagation(); }
      else dirtyRef.current = false; // évite un second avertissement du navigateur
    };
    window.addEventListener("beforeunload", before); document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", before); document.removeEventListener("click", onClick, true); };
  }, []);

  // ── Carte : sources/couches ─────────────────────────────────
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    m.addSource("track", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "track-casing", type: "line", source: "track", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 8 } });
    m.addLayer({ id: "track-line", type: "line", source: "track", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": SEG_COLOR, "line-width": 4.5 } });
    m.addSource("drag-prev", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "drag-prev-line", type: "line", source: "drag-prev", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f0612b", "line-width": 5, "line-dasharray": [1.5, 1.2] } });
    m.on("mouseenter", "track-line", () => (m.getCanvas().style.cursor = "grab"));
    m.on("mouseleave", "track-line", () => (m.getCanvas().style.cursor = ""));
  }, [ready, map]);

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    (m.getSource("track") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: track.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track } }] : [] });
    if (!fitted.current && track.length > 1) { const b = bboxOf(track); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 70, maxZoom: 15, duration: 0 }); fitted.current = true; }
  }, [track, ready, map]);

  // Clic sur la carte : ajoute un waypoint / un POI, ou insère un point sur le tracé
  const stRef = useRef(st); stRef.current = st;
  const sectModeRef = useRef(false);
  const routeProfile = profileForSport(meta.sport);
  const routerRef = useRef(makeRouter({ engine, profile: routeProfile }));
  routerRef.current = makeRouter({ engine, profile: routeProfile, onSource: setLastSource });
  const clickRef = useRef<(lng: number, lat: number, px: { x: number; y: number }) => void>(() => {});
  clickRef.current = (lng, lat, px) => {
    const m = map.current; if (!m || busy) return;
    if (Date.now() - suppressClick.current < 400) return; // clic fantôme à la fin d'un tirage
    if (sectMode) {
      if (coords.length < 2) return;
      const pr = E.projectOnTrack(coords, cum, lng, lat);
      const tolM = (40075016 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** m.getZoom()) * 24; // ~24 px autour du tracé
      if (pr.offM > Math.max(30, tolM)) { setMsg({ kind: "warn", text: "Cliquez sur le tracé (ou tout près) pour placer le point." }); return; }
      setSect((x) => (x.a == null || x.b != null ? { a: pr.atM, b: null } : Math.abs(pr.atM - x.a) < 5 ? x : { a: x.a, b: pr.atM })); setMsg(null);
      return;
    }
    if (poiMode) {
      const poi: Poi = { id: uid(), type: poiMode, name: POI_TYPES[poiMode].label, lng, lat };
      commit({ ...st, pois: [...st.pois, poi] }); return;
    }
    if (cutMode) {
      const onTrack = m.queryRenderedFeatures([[px.x - 9, px.y - 9], [px.x + 9, px.y + 9]], { layers: ["track-line"] });
      if (!onTrack.length || !st.segs.length) { setMsg({ kind: "warn", text: "Cliquez directement sur le tracé pour placer une coupe." }); return; }
      let b = { s: -1, v: -1, d: Infinity };
      st.segs.forEach((g, s2) => g.forEach((p, v) => { const d = (p[0] - lng) ** 2 + (p[1] - lat) ** 2; if (d < b.d) b = { s: s2, v, d }; }));
      const next = E.insertOnSegment(st, b.s, b.v);
      const wi = next !== st ? b.s + 1 : b.v <= 0 ? b.s : b.s + 1;     // point de coupe : nouveau waypoint ou waypoint existant
      if (wi <= 0 || wi >= next.waypoints.length - 1) { setMsg({ kind: "warn", text: "Une coupe ne peut pas être au tout début ni à la toute fin." }); return; }
      if (next !== st) commit(next);
      const w = next.waypoints[wi]; setCutKeys((k) => (k.includes(`${w.lng},${w.lat}`) ? k : [...k, `${w.lng},${w.lat}`]));
      return;
    }
    const hit = m.queryRenderedFeatures([[px.x - 7, px.y - 7], [px.x + 7, px.y + 7]], { layers: ["track-line"] });
    if (hit.length && st.segs.length) {
      let best = { s: -1, v: -1, d: Infinity };
      st.segs.forEach((g, s) => g.forEach((p, v) => { const d = (p[0] - lng) ** 2 + (p[1] - lat) ** 2; if (d < best.d) best = { s, v, d }; }));
      const next = E.insertOnSegment(st, best.s, best.v);
      if (next !== st) { commit(next); return; }
    }
    run(() => E.addWaypoint(st, lng, lat, auto, routerRef.current));
  };
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    const h = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number } }) => clickRef.current(e.lngLat.lng, e.lngLat.lat, e.point);
    m.on("click", h); return () => { m.off("click", h); };
  }, [ready, map]);

  // ── Point intermédiaire tiré depuis le tracé (clic maintenu + glisser) ──
  const modesRef = useRef({ cutMode, poiMode, busy, auto, sectMode: false }); modesRef.current = { cutMode, poiMode, busy, auto, sectMode: sectModeRef.current };
  const commitRef = useRef(commit); commitRef.current = commit;
  const dragRef = useRef<{ seg: number; sx: number; sy: number; moved: boolean; ghost: Marker | null; timer: ReturnType<typeof setTimeout> | null; token: number; pos: [number, number] } | null>(null);
  const suppressClick = useRef(0);
  const setPreview = useCallback((lines: LL[][]) => {
    (map.current?.getSource("drag-prev") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: lines.map((l) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l } })) });
  }, [map]);
  /** Aperçu recalculé seulement quand le pointeur marque une pause (pas à chaque mouvement de souris). */
  const schedulePreview = useCallback((compute: () => Promise<{ lines: LL[][] } | null>, straight: LL[][]) => {
    const d = dragRef.current; if (!d) return;
    setPreview(straight);
    if (d.timer) clearTimeout(d.timer);
    const token = ++d.token;
    d.timer = setTimeout(async () => {
      try { const r = await compute(); if (r && dragRef.current && dragRef.current.token === token) setPreview(r.lines); } catch { /* l'aperçu en ligne droite reste affiché */ }
    }, 280);
  }, [setPreview]);
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    const start = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number }; originalEvent: MouseEvent | TouchEvent; preventDefault: () => void }) => {
      const md = modesRef.current; const oe = e.originalEvent;
      if (md.cutMode || md.poiMode || sectModeRef.current || md.busy || dragRef.current || stRef.current.segs.length === 0) return;
      if ((oe.target as HTMLElement | null)?.closest?.(".maplibregl-marker")) return; // un marqueur existant gère son propre glissement
      if ("button" in oe && oe.button !== 0) return;
      if ("touches" in oe && oe.touches.length !== 1) return;
      const seg = E.nearestSegment(stRef.current, e.lngLat.lng, e.lngLat.lat); if (seg < 0) return;
      e.preventDefault(); // empêche le déplacement de la carte pendant le tirage
      dragRef.current = { seg, sx: e.point.x, sy: e.point.y, moved: false, ghost: null, timer: null, token: 0, pos: [e.lngLat.lng, e.lngLat.lat] };
    };
    const move = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number } }) => {
      const d = dragRef.current; if (!d) return;
      if (!d.moved) { if (Math.hypot(e.point.x - d.sx, e.point.y - d.sy) < 5) return; d.moved = true;
        const el = document.createElement("div"); el.className = "size-6 rounded-full border-2 border-white bg-ember-500 shadow-lg ring-4 ring-ember-500/30"; el.setAttribute("aria-hidden", "true");
        d.ghost = new lib.Marker({ element: el }).setLngLat([e.lngLat.lng, e.lngLat.lat]).addTo(m); m.getCanvas().style.cursor = "grabbing"; }
      d.pos = [e.lngLat.lng, e.lngLat.lat]; d.ghost?.setLngLat(d.pos);
      const st0 = stRef.current, a = st0.waypoints[d.seg], b = st0.waypoints[d.seg + 1]; if (!a || !b) return;
      schedulePreview(async () => { const r = await E.insertWaypointRouted(st0, d.seg, d.pos[0], d.pos[1], modesRef.current.auto, routerRef.current); return { lines: [r.state.segs[d.seg], r.state.segs[d.seg + 1]] }; },
        [[[a.lng, a.lat], d.pos], [d.pos, [b.lng, b.lat]]]);
    };
    const end = () => {
      const d = dragRef.current; if (!d) return;
      dragRef.current = null; if (d.timer) clearTimeout(d.timer);
      d.ghost?.remove(); setPreview([]); m.getCanvas().style.cursor = "";
      if (!d.moved) return; // simple clic : géré par le clic habituel
      suppressClick.current = Date.now();
      const st0 = stRef.current;
      run(() => E.insertWaypointRouted(st0, d.seg, d.pos[0], d.pos[1], modesRef.current.auto, routerRef.current));
    };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape" && dragRef.current) { const d = dragRef.current; dragRef.current = null; if (d.timer) clearTimeout(d.timer); d.ghost?.remove(); setPreview([]); suppressClick.current = Date.now(); } };
    const ctxTrack = (e: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent; preventDefault: () => void }) => {
      e.preventDefault(); const st0 = stRef.current; if (modesRef.current.busy || !st0.segs.length) return;
      let b = { s: -1, v: -1, d: Infinity }; st0.segs.forEach((g, s2) => g.forEach((p, v) => { const dd = (p[0] - e.lngLat.lng) ** 2 + (p[1] - e.lngLat.lat) ** 2; if (dd < b.d) b = { s: s2, v, d: dd }; }));
      const next = E.insertOnSegment(st0, b.s, b.v); const wi = next !== st0 ? b.s + 1 : b.v <= 0 ? b.s : b.s + 1;
      if (next !== st0) commitRef.current(next);
      setTimeout(() => openCtxRef.current(e.originalEvent.clientX, e.originalEvent.clientY, wi), 0);
    };
    m.on("contextmenu", "track-line", ctxTrack);
    m.on("mousedown", "track-line", start); m.on("touchstart", "track-line", start);
    m.on("mousemove", move); m.on("touchmove", move); m.on("mouseup", end); m.on("touchend", end);
    window.addEventListener("mouseup", end); window.addEventListener("keydown", esc);
    return () => { m.off("contextmenu", "track-line", ctxTrack); m.off("mousedown", "track-line", start); m.off("touchstart", "track-line", start); m.off("mousemove", move); m.off("touchmove", move); m.off("mouseup", end); m.off("touchend", end); window.removeEventListener("mouseup", end); window.removeEventListener("keydown", esc); };
  }, [ready, map, ml, run, schedulePreview, setPreview]);

  // Marqueurs de waypoints (déplaçables)
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    markers.current.forEach((x) => x.remove()); markers.current = [];
    const n = st.waypoints.length;
    st.waypoints.forEach((w, i) => {
      const first = i === 0, last = i === n - 1 && n > 1 && !closed;
      if (closed && i === n - 1) return; // boucle : un seul marqueur (double drapeau) au départ/arrivée
      const cut = cutKeys.includes(`${w.lng},${w.lat}`);
      const flag = !cut && (first || last) ? (first ? (closed ? "loop" : "start") : "finish") : null;
      const d = flag ? routeMarkerEl(flag) : document.createElement("button");
      if (!flag) {
        d.className = clsx("grid size-6 place-items-center rounded-full border-2 text-[10px] font-bold shadow-md", cut ? "border-white bg-ember-500 text-white" : "border-pine-600 bg-white text-pine-700", sel === i && "ring-4 ring-ember-400/60");
        d.textContent = cut ? "✂" : String(i);
      } else if (sel === i) (d.firstElementChild as HTMLElement).style.filter = "drop-shadow(0 0 5px #ff8556)";
      d.title = `Point ${i + 1} — glissez pour déplacer, cliquez pour sélectionner`;
      d.setAttribute("aria-label", d.title);
      d.addEventListener("click", (ev) => { ev.stopPropagation(); setSel(i); setTab("trace"); });
      d.addEventListener("contextmenu", (ev) => { ev.preventDefault(); ev.stopPropagation(); openCtxRef.current(ev.clientX, ev.clientY, i); });
      let lp: ReturnType<typeof setTimeout> | null = null; // appui long (écran tactile)
      d.addEventListener("touchstart", (ev) => { const t = ev.touches[0]; lp = setTimeout(() => { lp = null; openCtxRef.current(t.clientX, t.clientY, i); }, 550); }, { passive: true });
      for (const evn of ["touchend", "touchmove", "touchcancel"]) d.addEventListener(evn, () => { if (lp) { clearTimeout(lp); lp = null; } }, { passive: true });
      // Départ et arrivée restent fixes dès qu'il y a un tracé ; seuls les points intermédiaires se déplacent
      const fixed = n > 1 && (first || i === n - 1);
      if (fixed) d.title = `${closed ? "Départ et arrivée (boucle)" : first ? "Départ" : "Arrivée"} — fixe (sélectionnez-le puis Suppr pour le retirer)`;
      else if (n > 2) d.title = `Point ${i + 1} — glissez pour déplacer, double-clic pour supprimer`;
      d.setAttribute("aria-label", d.title);
      d.addEventListener("dblclick", (ev) => { ev.stopPropagation(); ev.preventDefault(); if (!fixed && !modesRef.current.busy) { setSel(null); run(() => E.removeWaypoint(stRef.current, i, routerRef.current)); } });
      const mk = new lib.Marker({ element: d, draggable: !fixed, anchor: flag ? "bottom" : "center" }).setLngLat([w.lng, w.lat]).addTo(m);
      let tmr: ReturnType<typeof setTimeout> | null = null, tok = 0;
      mk.on("drag", () => { // aperçu recalculé à la pause du pointeur
        const p = mk.getLngLat(), st0 = stRef.current; const a = st0.waypoints[i - 1], b = st0.waypoints[i + 1];
        (map.current?.getSource("drag-prev") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [a && [[a.lng, a.lat], [p.lng, p.lat]], b && [[p.lng, p.lat], [b.lng, b.lat]]].filter(Boolean).map((l) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l as number[][] } })) });
        if (tmr) clearTimeout(tmr); const my = ++tok;
        tmr = setTimeout(async () => { try { const r = await E.moveWaypoint(st0, i, p.lng, p.lat, routerRef.current); if (my === tok) (map.current?.getSource("drag-prev") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [r.state.segs[i - 1], r.state.segs[i]].filter(Boolean).map((l) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l } })) }); } catch { /* aperçu facultatif */ } }, 280);
      });
      mk.on("dragend", () => { tok++; if (tmr) clearTimeout(tmr); (map.current?.getSource("drag-prev") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] }); const p = mk.getLngLat(); run(() => E.moveWaypoint(stRef.current, i, p.lng, p.lat, routerRef.current)); });
      markers.current.push(mk);
    });
  }, [st.waypoints, sel, closed, cutKeys, ready, map, ml, run]);

  // Marqueurs de POI
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    poiMarkers.current.forEach((x) => x.remove()); poiMarkers.current = [];
    for (const p of st.pois) {
      const d = poiMarkerEl(p.type, p.name);
      d.addEventListener("click", (ev) => {
        ev.stopPropagation(); setTab("poi"); setSelPoi(p.id);
        new lib.Popup({ closeButton: true, closeOnClick: false, offset: 40 }).setLngLat([p.lng, p.lat]).setDOMContent(poiPopupEl(p.type, p.name, "Modifiable dans l'onglet POI")).addTo(m);
      });
      poiMarkers.current.push(new lib.Marker({ element: d, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m));
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel != null) { e.preventDefault(); const i = sel; setSel(null); run(() => E.removeWaypoint(st, i, routerRef.current)); }
      else if (e.key === "Escape") { setSel(null); setPoiMode(null); setCutMode(false); setSectMode(false); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [undo, redo, sel, st, run]);

  // ── Actions ─────────────────────────────────────────────────
  const reset = () => { if (st.waypoints.length && !confirm("Effacer le tracé en cours ? (le parcours déjà enregistré est conservé)")) return; setHist([E.emptyState()]); setHi(0); setId(undefined); rid.current = undefined; setMeta(DEFAULT_META); setCoords([]); setSel(null); fitted.current = false; sourceKind.current = "creation"; createdAt.current = Date.now(); window.history.replaceState(null, "", "/creer"); };

  async function saveSibling(state: E.EState, name: string): Promise<string> {
    const pts = await addElevation(E.trackLL(state));
    const nid = uid();
    routesRepo.upsert({ id: nid, name, description: meta.description, sport: meta.sport, segs: state.segs, waypoints: state.waypoints, coords: pts, pois: state.pois, terrain: meta.terrain, visibility: meta.visibility, region: meta.region, country: meta.country, layer: meta.layer, source: "creation", createdAt: Date.now(), updatedAt: Date.now() });
    return nid;
  }
  const align = async () => {
    setAligning("Alignement…"); setMsg(null);
    try {
      const r = await E.alignState(st, async (l) => { const x = await snapToPaths(l, profileForSport(meta.sport)); return x.matched > 0 ? x.line : null; }, (d, t) => setAligning(`Alignement ${d}/${t}…`));
      commit(r.state);
      setMsg({ kind: r.fallbacks ? "warn" : "ok", text: `Alignement : ${r.matched} tronçon(s) aligné(s) sur les chemins${r.fallbacks ? `, ${r.fallbacks} conservé(s) tel(s) quel(s) (aucun chemin proche)` : ""}.` });
    } catch { setMsg({ kind: "err", text: "Alignement impossible pour le moment (service indisponible)." }); } finally { setAligning(null); }
  };
  // Baguette magique : jauge 0–90 % de points à supprimer, aperçu en direct sur la carte, validation explicite
  const [simpPct, setSimpPct] = useState(0);
  const simpPreview = useMemo(() => (simpPct > 0 ? E.simplifyStateByRatio(st, simpPct, coords) : null), [simpPct, st, coords]);
  useEffect(() => { if (!dragRef.current) setPreview(simpPreview && simpPreview.result.after < simpPreview.result.before ? [simpPreview.line] : []); }, [simpPreview]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSimpPct(0); }, [hi]); // toute modification du tracé remet la jauge à zéro
  const applySimplify = (pct = simpPct) => {
    const r = E.simplifyStateByRatio(st, pct, coords);
    if (!r || r.result.after >= r.result.before) { setMsg({ kind: "warn", text: "Rien à simplifier avec ce réglage." }); return; }
    commit(r.state); setSel(null); setSimpPct(0);
    setMsg({ kind: "ok", text: `Baguette magique : ${r.result.before} → ${r.result.after} points (${r.result.removedPct} % supprimés, écart maximal mesuré ${r.result.maxDevM.toFixed(1)} m). Annulable avec Ctrl+Z.` });
  };
  // Clôture : retour au départ calculé par le moteur d'itinéraire (jamais une simple ligne droite, même en mode Libre)
  const canClose = !busy && !closed && st.waypoints.length >= 2 && st.segs.length >= 1;
  const closeRoute = async () => {
    if (!canClose) return;
    setBusy(true); setMsg(null);
    try {
      const r = await E.closeLoop(st, true, routerRef.current);
      if (r.fallbacks) { setMsg({ kind: "err", text: "Clôture impossible : aucun chemin praticable trouvé entre l'arrivée et le départ pour cette pratique. Rapprochez l'arrivée d'un chemin, ou ajoutez un point intermédiaire." }); return; }
      commit(r.state); setSel(null);
      const back = r.state.segs[r.state.segs.length - 1]; let m = 0; for (let k = 1; k < back.length; k++) m += haversine(back[k - 1], back[k]);
      setMsg({ kind: "ok", text: `Parcours clôturé : retour au départ de ${fmtKm(m)} ajouté par les chemins. Distance et dénivelés sont recalculés. Pour modifier ce retour, glissez-le depuis le tracé.` });
    } catch { setMsg({ kind: "err", text: "Clôture impossible pour le moment (service de calcul indisponible). Réessayez." }); } finally { setBusy(false); }
  };
  // ── Menu contextuel d'un point (clic droit / appui long) : nouveau départ, suppression ──
  const [ctx, setCtx] = useState<{ x: number; y: number; wi: number } | null>(null);
  const [confirmStart, setConfirmStart] = useState<{ wi: number; km: number } | null>(null);
  const openCtx = useCallback((clientX: number, clientY: number, wi: number) => {
    const host = el.current?.getBoundingClientRect(); if (!host) return;
    setCtx({ x: Math.min(clientX - host.left, host.width - 230), y: Math.min(clientY - host.top, host.height - 110), wi });
  }, [el]);
  const openCtxRef = useRef(openCtx); openCtxRef.current = openCtx;
  const newStart = (wi: number, confirmed = false) => {
    const r = E.startFrom(st, wi); setCtx(null);
    if (!r) { setMsg({ kind: "warn", text: "Choisissez un point intermédiaire : le départ et l'arrivée ne peuvent pas devenir le nouveau départ." }); return; }
    if (!r.loop && !confirmed) { let m = 0; for (let k = 1; k < r.removed.length; k++) m += haversine(r.removed[k - 1], r.removed[k]); setConfirmStart({ wi, km: m }); return; }
    commit(r.state); setSel(null); setConfirmStart(null);
    setMsg({ kind: "ok", text: r.loop ? "Nouveau départ défini : la boucle est conservée entière, seul son point de départ a changé. Annulable avec Ctrl+Z." : "Nouveau départ défini : le début du tracé a été retiré, la suite et l'arrivée sont inchangées. Annulable avec Ctrl+Z." });
  };
  useEffect(() => { if (!ctx) return; const close = () => setCtx(null); window.addEventListener("click", close); window.addEventListener("keydown", close); return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", close); }; }, [ctx]);

  // ── Extraction d'une section entre deux points A et B posés sur le tracé (l'original n'est pas modifié) ──
  const [sectMode, setSectMode] = useState(false);
  const [sect, setSect] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [sectName, setSectName] = useState("");
  sectModeRef.current = sectMode;
  const sectCoords = useMemo(() => (sect.a != null && sect.b != null && coords.length > 1 ? E.sliceTrack(coords, cum, sect.a, sect.b) : []), [sect, coords, cum]);
  const sectStats = useMemo(() => (sectCoords.length > 1 ? trackStats(sectCoords, 3) : null), [sectCoords]);
  const sectProfile = useMemo(() => buildProfile(sectCoords), [sectCoords]);
  const sectMarks = useRef<Marker[]>([]);
  useEffect(() => { setSect({ a: null, b: null }); }, [hi]); // le tracé a changé : les points de coupe ne sont plus valables
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (!m.getSource("sect")) { m.addSource("sect", { type: "geojson", data: { type: "FeatureCollection", features: [] } }); m.addLayer({ id: "sect-line", type: "line", source: "sect", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#12624b", "line-width": 8, "line-opacity": 0.85 } }); }
    (m.getSource("sect") as GeoJSONSource).setData({ type: "FeatureCollection", features: sectCoords.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: sectCoords.map((c) => [c[0], c[1]]) } }] : [] });
    sectMarks.current.forEach((x) => x.remove()); sectMarks.current = [];
    const total = cum[cum.length - 1] ?? 0;
    for (const [label, d] of [["A", sect.a], ["B", sect.b]] as const) {
      if (d == null || coords.length < 2 || d > total + 1) continue;
      const p = E.sliceTrack(coords, cum, Math.max(0, d - 0.5), Math.min(total, d + 0.5))[0] ?? coords[0];
      const e = document.createElement("div"); e.className = "grid size-7 place-items-center rounded-full border-2 border-white bg-pine-700 text-xs font-bold text-white shadow-lg"; e.textContent = label; e.title = `Point ${label} de la section`;
      sectMarks.current.push(new lib.Marker({ element: e }).setLngLat([p[0], p[1]]).addTo(m));
    }
  }, [sect, sectCoords, coords, cum, ready, map, ml]);
  const sectDefaultName = `${meta.name || "Parcours"} — section`;
  const sectGpx = () => { if (sectCoords.length < 2) return; const n = sectName.trim() || sectDefaultName; download(`${safeName(n)}.gpx`, serialize("gpx", { name: n, description: `Section extraite de « ${meta.name || "Parcours"} »`, coords: sectCoords, pois: [] }), FORMATS.gpx.mime); };
  const sectSave = () => {
    if (sectCoords.length < 2) return; const n = sectName.trim() || sectDefaultName; const stt = E.fromTrack(sectCoords, []); const now = Date.now();
    const res = routesRepo.upsert({ id: uid(), name: n, description: `Section extraite de « ${meta.name || "Parcours"} ».`, sport: meta.sport, segs: stt.segs, waypoints: stt.waypoints, coords: sectCoords, pois: [], terrain: meta.terrain, visibility: "prive", region: meta.region, country: meta.country, layer: meta.layer, source: "creation", createdAt: now, updatedAt: now });
    setMsg(res.ok ? { kind: "ok", text: `Section « ${n} » enregistrée dans la bibliothèque. Le parcours d'origine n'est pas modifié.` } : { kind: "err", text: res.error ?? "Enregistrement impossible." });
  };
  const sectNext = () => { setSect((x) => ({ a: x.b, b: null })); setSectName(""); };

  const duplicate = async () => { setBusy(true); try { const nid = await saveSibling(st, `${meta.name || "Parcours"} (copie)`); window.location.assign(withBase(editorHref(nid))); } catch { setMsg({ kind: "err", text: "Duplication impossible (altitudes indisponibles)." }); } finally { setBusy(false); } };
  const split = async () => {
    if (sel == null) return; const parts = E.splitAt(st, sel);
    if (!parts) { setMsg({ kind: "warn", text: "Choisissez un point intermédiaire pour diviser le parcours." }); return; }
    setBusy(true);
    try { const nid = await saveSibling(parts[1], `${meta.name || "Parcours"} (2/2)`); setMeta((m) => ({ ...m, name: `${m.name || "Parcours"} (1/2)` })); commit(parts[0]); setSel(null); setMsg({ kind: "ok", text: `Parcours divisé : la 2ᵉ partie est enregistrée à part (${nid.slice(0, 6)}…).` }); }
    catch { setMsg({ kind: "err", text: "Division impossible (altitudes indisponibles)." }); } finally { setBusy(false); }
  };
  const cutAll = async () => {
    const idx = st.waypoints.map((w, i) => (cutKeys.includes(`${w.lng},${w.lat}`) ? i : -1)).filter((i) => i > 0 && i < st.waypoints.length - 1);
    const parts = E.splitMany(st, idx);
    if (parts.length < 2) { setMsg({ kind: "warn", text: "Placez au moins une coupe sur le tracé." }); return; }
    setBusy(true); setMsg(null); seedElevations(coords);
    try {
      const base = meta.name || "Parcours"; const made: { id: string; name: string }[] = [];
      for (let k = 0; k < parts.length; k++) { const name = `${base} (${k + 1}/${parts.length})`; made.push({ id: await saveSibling(parts[k], name), name }); }
      setMadeParts(made); setCutKeys([]); setCutMode(false);
      setMsg({ kind: "ok", text: `${made.length} parcours créés. Le parcours d'origine est conservé.` });
    } catch { setMsg({ kind: "err", text: "Découpe impossible pour le moment." }); } finally { setBusy(false); }
  };
  const mergeWith = (rid2: string) => { const r = routesRepo.get(rid2); if (!r) return; seedElevations(r.coords); commit(E.merge(st, { waypoints: r.waypoints, segs: r.segs, pois: r.pois })); setMsg({ kind: "ok", text: `« ${r.name} » ajouté à la suite du tracé.` }); };

  async function importFile(f: File, mode: "replace" | "merge") {
    setMsg(null);
    if (f.size > MAX_BYTES) { setMsg({ kind: "err", text: "Fichier trop volumineux (25 Mo max)." }); return; }
    try {
      const p = parseAny(await f.text(), f.name);
      if (p.hadElevation) seedElevations(p.coords);
      const imp = E.fromTrack(p.coords, p.pois);
      if (mode === "merge" && st.waypoints.length) commit(E.merge(st, imp));
      else { setHist([imp]); setHi(0); setMeta((m) => ({ ...m, name: m.name || p.name })); sourceKind.current = "import"; fileName.current = f.name; fitted.current = false; }
      setMsg({ kind: p.warnings.length ? "warn" : "ok", text: `${f.name} importé (${p.coords.length} points).${p.warnings.length ? " " + p.warnings.join(" ") : ""}` });
    } catch (e) { setMsg({ kind: "err", text: e instanceof GpsFileError ? e.message : "Lecture du fichier impossible." }); }
  }

  const exportAs = (f: GpsFormat) => { if (coords.length < 2) return; download(`${safeName(meta.name || "parcours")}.${FORMATS[f].ext}`, serialize(f, { name: meta.name || "Parcours", description: meta.description, coords, pois: st.pois }), FORMATS[f].mime); };
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => map.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 14 }), () => setMsg({ kind: "warn", text: "Position indisponible ou refusée." }));
  const others = routesRepo.useAll().filter((r) => r.id !== id);

  const tb = "grid size-10 place-items-center lg:size-9 rounded-lg text-ink-700 hover:bg-ink-100 disabled:opacity-35 disabled:hover:bg-transparent";
  const field = "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm";

  return (
    <div data-workspace className="relative h-[calc(100dvh-4rem-var(--bnav))] overflow-hidden lg:grid lg:min-h-[36rem] lg:grid-cols-[1fr_22rem] lg:grid-rows-[minmax(0,1fr)]">
      <div className="absolute inset-x-0 top-0 bottom-[8rem] flex flex-col lg:static lg:min-h-0">
        <MapFrame className="min-h-[18rem] flex-1" banner={<StatBanner title={meta.name || "Parcours en cours"} items={[{ label: "Distance", value: stats ? fmtKm(stats.distanceM) : "—" }, { label: "D+", value: stats ? fmtM(stats.gainM) : "—" }, { label: "D−", value: stats ? fmtM(stats.lossM) : "—" }, { label: "Alt. min", value: stats ? fmtM(stats.minEle) : "—" }, { label: "Alt. max", value: stats ? fmtM(stats.maxEle) : "—" }, { label: "Durée est.", value: stats ? fmtDuration(durationMin) : "—" }]} />}>
          <div className="absolute inset-0"><div ref={el} className="size-full" role="application" aria-label="Carte de l'éditeur : cliquez pour ajouter des points" /></div>
          <div className="absolute left-3 top-3 flex max-w-[calc(100%-4.75rem)] flex-wrap items-center gap-1 rounded-2xl glass p-1">
            <div className="flex rounded-lg bg-ink-100 p-0.5 text-xs font-semibold" role="group" aria-label="Mode de tracé">
              <button aria-pressed={auto} onClick={() => setAuto(true)} className={clsx("flex items-center gap-1 rounded-md px-2 py-1.5", auto && "bg-white shadow")} title="Le tracé suit les chemins"><RouteIcon className="size-3.5" />Chemins</button>
              <button aria-pressed={!auto} onClick={() => setAuto(false)} className={clsx("flex items-center gap-1 rounded-md px-2 py-1.5", !auto && "bg-white shadow")} title="Ligne droite entre les points"><MousePointer2 className="size-3.5" />Libre</button>
            </div>
            <button className={tb} onClick={undo} disabled={hi === 0 || busy} aria-label="Annuler" title="Annuler (Ctrl+Z)"><Undo2 className="size-4" /></button>
            <button className={tb} onClick={redo} disabled={hi >= hist.length - 1 || busy} aria-label="Rétablir" title="Rétablir (Ctrl+Y)"><Redo2 className="size-4" /></button>
            <button className={tb} onClick={() => commit(E.reverse(st))} disabled={st.waypoints.length < 2 || busy} aria-label="Inverser le sens" title="Inverser le sens"><ArrowLeftRight className="size-4" /></button>
            <button className={clsx(tb, "!flex !w-auto items-center gap-1.5 px-2.5 text-xs font-semibold")} onClick={closeRoute} disabled={!canClose} aria-label="Clôturer le parcours" title={closed ? "Le parcours est déjà une boucle" : "Clôturer le parcours : retour au départ par les chemins"}><Repeat className="size-4" /><span className="hidden sm:inline">Clôturer</span></button>
            <button className={clsx(tb, cutMode && "!bg-ember-500 !text-white")} aria-pressed={cutMode} onClick={() => { setCutMode((v) => !v); setPoiMode(null); }} disabled={st.segs.length === 0} aria-label="Mode découpe" title="Découper le parcours : cliquez sur le tracé"><Scissors className="size-4" /></button>
            <button className={tb} onClick={locate} aria-label="Me localiser" title="Me localiser"><LocateFixed className="size-4" /></button>
            <button className={tb} onClick={reset} aria-label="Nouveau parcours" title="Nouveau / effacer"><Trash2 className="size-4" /></button>
          </div>
          <LayerControl map={map} ready={ready} />
          <div className="pointer-events-none absolute bottom-8 left-3 flex flex-col gap-1.5">
            {busy && <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1 text-xs shadow"><Loader2 className="size-3.5 animate-spin" />Calcul du tracé…</span>}
            {cutMode && <span className="rounded-lg bg-ember-500 px-2.5 py-1 text-xs font-semibold text-white shadow">Découpe : cliquez sur le tracé aux endroits de coupe (Échap pour quitter)</span>}
            {sectMode && <span className="rounded-lg bg-pine-700 px-2.5 py-1 text-xs font-semibold text-white shadow">Section : cliquez sur le tracé pour placer {sect.a == null || sect.b != null ? "le point A" : "le point B"} (Échap pour quitter)</span>}
            {poiMode && <span className="rounded-lg bg-ember-500 px-2.5 py-1 text-xs font-semibold text-white shadow">Cliquez sur la carte pour placer : {POI_TYPES[poiMode].label} (Échap pour annuler)</span>}
            {msg && <span role="status" className={clsx("pointer-events-auto max-w-sm rounded-lg px-2.5 py-1.5 text-xs shadow", msg.kind === "err" ? "bg-danger text-white" : msg.kind === "warn" ? "bg-warn text-white" : "bg-pine-600 text-white")}>{msg.text}</span>}
            {!st.waypoints.length && loaded && <span className="rounded-lg bg-white/95 px-2.5 py-1.5 text-xs shadow">Cliquez sur la carte pour poser le départ, puis les points suivants.</span>}
          </div>
          {ctx && (
            <div role="menu" aria-label={`Actions du point ${ctx.wi + 1}`} className="glass absolute z-30 w-56 rounded-xl p-1 text-sm" style={{ left: Math.max(8, ctx.x), top: Math.max(8, ctx.y) }} onClick={(e) => e.stopPropagation()}>
              <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-medium hover:bg-ink-900/[0.06] disabled:opacity-40" disabled={ctx.wi <= 0 || ctx.wi >= st.waypoints.length - 1} onClick={() => newStart(ctx.wi)}><Flag className="size-4 text-pine-600" />Définir comme nouveau départ</button>
              <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-medium hover:bg-ink-900/[0.06]" onClick={() => { const i = ctx.wi; setCtx(null); setSel(null); run(() => E.removeWaypoint(stRef.current, i, routerRef.current)); }}><Trash2 className="size-4 text-danger" />Supprimer ce point</button>
            </div>)}
          {confirmStart && (
            <div role="alertdialog" aria-label="Confirmer le nouveau départ" className="glass absolute left-1/2 top-16 z-30 w-[min(24rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl p-4 text-sm">
              <p className="font-semibold">Partir du point {confirmStart.wi + 1} ?</p>
              <p className="mt-1 text-ink-600">Ce parcours n'est pas une boucle : les <b>{fmtKm(confirmStart.km)}</b> situés avant ce point seront retirés du tracé. La suite et l'arrivée ne changent pas, les POI restent en place. Vous pourrez annuler (Ctrl+Z).</p>
              <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => newStart(confirmStart.wi, true)}>Retirer le début et partir d'ici</Button><Button size="sm" variant="secondary" onClick={() => setConfirmStart(null)}>Garder le tracé</Button></div>
            </div>)}
        </MapFrame>
        <div className="hidden border-t border-ink-100 bg-white p-3 lg:block">
          <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
            <span className="font-semibold text-ink-700">Profil altimétrique</span>
            <span aria-live="polite">{elev === "loading" ? "Altitudes en cours de calcul…" : elev === "error" ? "Altitudes IGN indisponibles : profil à plat" : "Altitudes IGN (RGE ALTI)"}</span>
          </div>
          <ElevationChart ref={chartRef} points={profile} markers={chartMarkers} onHover={setHoverIdx} height={170} />
        </div>
      </div>

      <Sheet state={sheet} onState={setSheet} side="right" label="Propriétés du parcours" header={<div className="border-b border-ink-100 bg-white">
          <div className="flex items-center justify-between px-3 pt-0.5 text-xs lg:pt-2">
            <span className="font-semibold text-ink-700">{meta.name || "Nouveau parcours"}</span>
            <span className="flex items-center gap-2">
              <span className={clsx("inline-flex items-center gap-1", dirty ? "font-semibold text-ember-600" : "text-ink-500")} aria-live="polite" data-save-state={dirty ? "dirty" : rid.current ? "saved" : "new"}>
                {saved === "saving" ? <><Loader2 className="size-3 animate-spin" />Enregistrement…</> : dirty ? <><AlertTriangle className="size-3" />Non enregistré</> : rid.current ? <><Check className="size-3 text-pine-600" />Enregistré</> : null}
              </span>
              <Button size="sm" variant={dirty ? "primary" : "secondary"} className="!h-8 !px-3 !text-xs" disabled={!canSave} onClick={() => save()} title={hasTrack ? "Enregistrer le parcours dans la bibliothèque (Ctrl+S)" : "Tracez au moins deux points"}><SaveIcon className="size-3.5" />Enregistrer</Button>
            </span>
          </div>
          <p className="px-3 pb-1 pt-0.5 font-display text-sm font-bold lg:hidden" aria-label="Résumé du parcours">{stats ? `${fmtKm(stats.distanceM)} · +${fmtM(stats.gainM)} · −${fmtM(stats.lossM)} · ${fmtDuration(durationMin)}` : "Posez des points sur la carte"}</p>
          <div className="flex text-sm font-semibold" role="tablist">
            {([["trace", "Tracé"], ["props", "Infos"], ["poi", "POI"], ["fichiers", "Fichiers"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setSheet((x) => (x === "peek" ? "half" : x)); }} className={clsx("flex-1 py-2.5", tab === k ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}>{l}</button>
            ))}
          </div>
        </div>}>
        <div className="grid gap-4 p-4">
          {tab === "trace" && (<>
            <div>
              <div role="group" aria-label="Type de sport" className="grid grid-cols-4 gap-1 rounded-xl bg-ink-100 p-1">
                {([["velo", "Vélo de route", Bike], ["vtt", "VTT", MountainSnow], ["trail", "Trail", Zap], ["rando", "Randonnée", Footprints]] as const).map(([k, l, I]) => (
                  <button key={k} type="button" aria-pressed={meta.sport === k} onClick={() => setMeta({ ...meta, sport: k })} className={clsx("flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold leading-tight transition-colors", meta.sport === k ? "bg-white text-pine-700 shadow" : "text-ink-600 hover:text-ink-900")}><I className="size-4" />{l}</button>))}
              </div>
              <p className="mt-1.5 text-xs text-ink-500">{SPORTS[meta.sport].label} : le tracé privilégie les <b>{PROFILE_HINT[routeProfile]}</b>. S'applique aux prochains tronçons tracés{st.segs.length ? " ; les tronçons existants ne changent pas" : ""}.</p>
            </div>
            <div className="lg:hidden"><ElevationChart points={profile} markers={chartMarkers} onHover={setHoverIdx} height={150} /></div>
            <dl className="grid grid-cols-2 gap-3">
              {[["Distance", stats ? fmtKm(stats.distanceM) : "—"], ["Durée estimée", stats ? fmtDuration(durationMin) : "—"], ["D+", stats ? fmtM(stats.gainM) : "—"], ["D−", stats ? fmtM(stats.lossM) : "—"], ["Altitude min", stats ? fmtM(stats.minEle) : "—"], ["Altitude max", stats ? fmtM(stats.maxEle) : "—"]].map(([l, v]) => (
                <div key={l} className="rounded-xl bg-ink-50 p-3"><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{l}</dt><dd className="font-display text-lg font-bold">{v}</dd></div>
              ))}
            </dl>
            {stats && <p className="text-sm text-ink-600">Difficulté : <b>{DIFFICULTY_LABEL[difficultyOf(stats.distanceM, stats.gainM)]}</b> · {closed ? "Boucle" : "Parcours linéaire"} · Terrain : {meta.terrain.length ? meta.terrain.join(", ") : <i>à renseigner dans Infos</i>}</p>}
            <p className="text-xs text-ink-400">La durée est une estimation selon la discipline, la distance et le dénivelé.</p>
            <div className="rounded-xl border border-ink-100 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Calcul du tracé</p>
              <label className="grid gap-1 text-sm font-medium">Source des chemins<select className={field} value={engine} onChange={(e) => setEnginePref(e.target.value as Engine)}>{(Object.keys(ENGINE_LABEL) as Engine[]).map((k) => <option key={k} value={k}>{ENGINE_LABEL[k]}</option>)}</select></label>
              <p className="mt-1.5 text-xs text-ink-500">Indépendant du fond de carte affiché. En mode automatique, un chemin absent d'une source est cherché dans l'autre.{lastSource && <> Dernier tronçon : <b>{SOURCE_LABEL[lastSource]}</b>.</>}</p>
              <Button size="sm" variant="secondary" className="mt-2" disabled={busy || !!aligning || st.segs.length === 0} onClick={align}><Route className="size-4" />{aligning ?? "Aligner sur les chemins"}</Button>
            </div>
            <div className="rounded-xl border border-ink-100 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Baguette magique · simplifier le tracé</p>
              {(() => { const total = track.length, r = simpPreview?.result; const kept = r ? r.after : total, removed = total - kept; return (<>
                <label className="grid gap-1 text-sm font-medium"><span className="flex justify-between">Points à supprimer<b className="font-display">{simpPct} %</b></span>
                  <input type="range" min={0} max={90} step={5} value={simpPct} disabled={busy || total < 3} onChange={(e) => setSimpPct(+e.target.value)} list="simp-ticks" aria-label="Pourcentage de points à supprimer" aria-valuetext={`${simpPct} % : ${kept} points conservés sur ${total}`} className="h-8 w-full" />
                  <datalist id="simp-ticks">{[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => <option key={v} value={v} />)}</datalist>
                  <span className="flex justify-between text-[10px] font-normal text-ink-400" aria-hidden="true">{[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => <span key={v}>{v}</span>)}</span></label>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">{[["Points d'origine", total], ["Conservés", kept], ["Supprimés", removed]].map(([l, v]) => <div key={l as string} className="rounded-lg bg-ink-50 p-2"><dt className="text-ink-500">{l}</dt><dd className="font-display text-base font-bold">{v}</dd></div>)}</dl>
                {r && simpPct > 0 && <p className="mt-2 text-xs text-ink-500">Écart maximal avec le tracé d'origine : <b>{r.maxDevM.toFixed(1)} m</b>. L'aperçu est en pointillés sur la carte ; départ, arrivée, virages marqués, ruptures de pente et POI sont conservés en priorité.</p>}
                {r?.exceeded && <div role="alert" className="mt-2 rounded-lg bg-warn/10 p-2.5 text-xs text-ink-700"><p className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />À {simpPct} %, le tracé s'écarte de plus de {r.limitM} m de l'original : des virages sont coupés. {r.safePct > 0 ? `Réglage conseillé : ${r.safePct} % au plus.` : "Ce tracé ne peut pas être allégé sans le déformer."}</p>{r.safePct > 0 && <Button size="sm" variant="secondary" className="mt-2" onClick={() => setSimpPct(Math.floor(r.safePct / 5) * 5 || r.safePct)}>Régler sur {Math.floor(r.safePct / 5) * 5 || r.safePct} %</Button>}</div>}
                <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="brand" disabled={busy || !!aligning || !r || removed <= 0} onClick={() => applySimplify()}><Wand2 className="size-4" />Appliquer ({kept} points)</Button>{simpPct > 0 && <Button size="sm" variant="ghost" onClick={() => setSimpPct(0)}>Annuler l'aperçu</Button>}</div>
              </>); })()}
            </div>
            <div className="rounded-xl border border-ink-100 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">{sel != null ? `Point ${sel + 1} sélectionné` : "Points de passage"}</p>
              {sel != null ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => { const i = sel; setSel(null); run(() => E.removeWaypoint(st, i, routerRef.current)); }}><Trash2 className="size-4" />Supprimer</Button>
                  <Button size="sm" variant="secondary" disabled={!closed || sel === 0 || sel === st.waypoints.length - 1} title={closed ? "" : "Disponible sur une boucle"} onClick={() => { commit(E.setStart(st, sel)); setSel(null); }}><Flag className="size-4" />Départ ici</Button>
                  <Button size="sm" variant="secondary" disabled={busy || sel === 0 || sel === st.waypoints.length - 1} onClick={split}><Scissors className="size-4" />Diviser ici</Button>
                </div>
              ) : <><Button size="sm" variant={closed ? "secondary" : "brand"} className="mb-2" disabled={!canClose} onClick={closeRoute}><Repeat className="size-4" />{closed ? "Parcours en boucle" : "Clôturer le parcours"}</Button><p className="text-sm text-ink-500">{st.waypoints.length} point(s). Cliquez sur un marqueur pour le sélectionner, glissez-le pour le déplacer, cliquez sur le tracé pour insérer un point.</p></>}
            </div>
            <div className="rounded-xl border border-ink-100 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Extraire une section (étape)</p>
              <p className="text-xs text-ink-500">Placez un point A puis un point B directement sur le tracé : la portion comprise entre les deux devient une trace à part, exportable. Géométrie et altitudes d'origine conservées ; le parcours n'est pas modifié.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant={sectMode ? "brand" : "secondary"} aria-pressed={sectMode} disabled={coords.length < 2} onClick={() => { setSectMode((v) => !v); setCutMode(false); setPoiMode(null); }}><Scissors className="size-4" />{sectMode ? "Sélection active" : "Choisir A et B"}</Button>
                {(sect.a != null || sect.b != null) && <Button size="sm" variant="ghost" onClick={() => { setSect({ a: null, b: null }); setSectName(""); }}>Recommencer</Button>}
              </div>
              {sect.a != null && sect.b == null && <p className="mt-2 text-xs text-ink-600">Point A au km {(sect.a / 1000).toFixed(2).replace(".", ",")}. Cliquez maintenant le point B sur le tracé.</p>}
              {sectStats && sect.a != null && sect.b != null && (<div className="mt-3 grid gap-2">
                <p className="text-xs text-ink-600">Du km <b>{(Math.min(sect.a, sect.b) / 1000).toFixed(2).replace(".", ",")}</b> au km <b>{(Math.max(sect.a, sect.b) / 1000).toFixed(2).replace(".", ",")}</b> · {sectCoords.length} points</p>
                <dl className="grid grid-cols-3 gap-2 text-center text-xs">{[["Distance", fmtKm(sectStats.distanceM)], ["D+", fmtM(sectStats.gainM)], ["D−", fmtM(sectStats.lossM)]].map(([l, v]) => <div key={l} className="rounded-lg bg-ink-50 p-2"><dt className="text-ink-500">{l}</dt><dd className="font-display text-base font-bold">{v}</dd></div>)}</dl>
                <ElevationChart points={sectProfile} height={120} />
                <label className="grid gap-1 text-sm font-medium">Nom de la section<input className={field} value={sectName} onChange={(e) => setSectName(e.target.value)} placeholder={sectDefaultName} maxLength={120} /></label>
                <div className="flex flex-wrap gap-2"><Button size="sm" onClick={sectGpx}><Download className="size-4" />Exporter en GPX</Button><Button size="sm" variant="secondary" onClick={sectSave}><Check className="size-4" />Enregistrer dans la bibliothèque</Button><Button size="sm" variant="ghost" onClick={sectNext} title="Le point B devient le point A de l'étape suivante">Étape suivante (A = B)</Button></div>
              </div>)}
            </div>
            <div className="rounded-xl border border-ink-100 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-400">Découper en plusieurs parcours</p>
              <p className="text-xs text-ink-500">Activez le mode découpe (ciseaux sur la carte), cliquez sur le tracé aux endroits voulus, puis créez les parcours. Géométrie, altitudes et profil sont conservés ; l'original n'est pas modifié.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant={cutMode ? "primary" : "secondary"} aria-pressed={cutMode} disabled={st.segs.length === 0} onClick={() => setCutMode((v) => !v)}><Scissors className="size-4" />{cutMode ? "Découpe active" : "Mode découpe"}</Button>
                <Button size="sm" variant="brand" disabled={busy || cutKeys.length === 0} onClick={cutAll}>Créer {cutKeys.length + 1} parcours</Button>
                {cutKeys.length > 0 && <Button size="sm" variant="ghost" onClick={() => setCutKeys([])}>Annuler les coupes</Button>}
              </div>
              {madeParts.length > 0 && <ul className="mt-2 grid gap-1 text-sm">{madeParts.map((m2) => <li key={m2.id}><a className="font-semibold text-pine-700 underline" href={withBase(editorHref(m2.id))}>{m2.name}</a></li>)}</ul>}
            </div>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={busy || st.waypoints.length < 2} onClick={duplicate}><Copy className="size-4" />Dupliquer</Button></div>
          </>)}

          {tab === "props" && (<>
            <label className="grid gap-1 text-sm font-medium">Nom<input className={field} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Ex. Boucle du lac" maxLength={120} /></label>
            <label className="grid gap-1 text-sm font-medium">Description<textarea className={field} rows={4} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={2000} /></label>
            <label className="grid gap-1 text-sm font-medium">Discipline<select className={field} value={meta.sport} onChange={(e) => setMeta({ ...meta, sport: e.target.value as Sport })}>{Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
            <fieldset><legend className="mb-1 text-sm font-medium">Types de terrain (déclarés)</legend><div className="flex flex-wrap gap-1.5">{terrains.map((t) => { const on = meta.terrain.includes(t); return <button key={t} type="button" aria-pressed={on} onClick={() => setMeta({ ...meta, terrain: on ? meta.terrain.filter((x) => x !== t) : [...meta.terrain, t] })} className={clsx("rounded-full border px-3 py-1 text-xs font-medium", on ? "border-pine-600 bg-pine-600 text-white" : "border-ink-200")}>{t}</button>; })}</div></fieldset>
            <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-sm font-medium">Région<input className={field} value={meta.region} onChange={(e) => setMeta({ ...meta, region: e.target.value })} /></label><label className="grid gap-1 text-sm font-medium">Pays<input className={field} value={meta.country} onChange={(e) => setMeta({ ...meta, country: e.target.value })} /></label></div>
            <label className="grid gap-1 text-sm font-medium">Calque<select className={field} value={meta.layer} onChange={(e) => setMeta({ ...meta, layer: e.target.value })}>{layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Lien source (optionnel)<input className={field} value={meta.sourceUrl} onChange={(e) => setMeta({ ...meta, sourceUrl: e.target.value })} placeholder="https://…" /></label>
            <label className="grid gap-1 text-sm font-medium">Visibilité<select className={field} value={meta.visibility} onChange={(e) => setMeta({ ...meta, visibility: e.target.value as Visibility })}><option value="prive">Privé</option><option value="public">Public</option></select></label>
            <p className="text-xs text-ink-400">La visibilité « Public » sera effective avec les comptes (étape 2). Pour l'instant tout reste sur cet appareil.</p>
          </>)}

          {tab === "poi" && (<>
            <p className="text-sm text-ink-600">Choisissez un type puis cliquez sur la carte.</p>
            <div className="flex flex-wrap gap-1.5">{(Object.keys(POI_TYPES) as PoiType[]).map((t) => <button key={t} aria-pressed={poiMode === t} onClick={() => setPoiMode(poiMode === t ? null : t)} className={clsx("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-medium", poiMode === t ? "border-transparent text-white" : "border-ink-200")} style={poiMode === t ? { background: POI_TYPES[t].color } : undefined}><PoiIcon decorative type={t} size={22} className={poiMode === t ? "ring-2 ring-white/70" : ""} />{POI_TYPES[t].label}</button>)}</div>
            <ul className="grid gap-2">{st.pois.map((p) => (
              <li key={p.id} className={clsx("flex items-center gap-2 rounded-lg border p-2", selPoi === p.id ? "border-pine-600 bg-pine-50" : "border-ink-100")}>
                <PoiIcon type={p.type} size={28} />
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
      </Sheet>
    </div>
  );
}
