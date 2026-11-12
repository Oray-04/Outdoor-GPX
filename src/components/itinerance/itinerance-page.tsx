"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Marker, Popup } from "maplibre-gl";
import Link from "next/link";
import { Store, Loader2, Plus, Check, ExternalLink, Clock, MapPin, TriangleAlert, Square, Droplets, ShoppingBasket, UtensilsCrossed, Download, Search, ChevronDown, Phone, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { MapFrame, StatBanner } from "@/components/map/map-frame";
import { ElevationChart, type ChartMarker } from "@/components/route/elevation-chart";
import { Button } from "@/components/ui/button";
import { routesRepo } from "@/lib/repo";
import { routeMarkerEl } from "@/lib/route-markers";
import { FAMILY, PRESETS, RESUPPLY, RESUPPLY_KINDS, RESUPPLY_NOTICE, ResupplyError, familyOf, findResupply, gaps, placesCsv, resupplyGlyph, resupplyIconSvg, sections, type ResupplyFamily, type ResupplyKind, type ResupplyPlace } from "@/lib/resupply";
import { buildProfile } from "@/lib/profile";
import { download, safeName } from "@/lib/formats";
import { bboxOf, cumulative, fmtKm, trackStats } from "@/lib/geo";
import { uid, type LL } from "@/lib/types";
import { editorHref } from "@/lib/url";

const RADII = [100, 250, 500, 1000, 2000, 5000];
const STAGES = [5, 10, 20, 30, 50];
const fmtOff = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);
const km1 = (m: number) => (m / 1000).toFixed(1).replace(".", ",");
const FAM_ICON: Record<ResupplyFamily, typeof Droplets> = { water: Droplets, food: ShoppingBasket, meal: UtensilsCrossed };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function KindIcon({ kind, size = 24 }: { kind: ResupplyKind; size?: number }) {
  const px = Math.round(size * 0.62);
  return <span className="inline-grid shrink-0 place-items-center rounded-[30%] text-white shadow-sm ring-1 ring-black/10" style={{ width: size, height: size, background: RESUPPLY[kind].color }} aria-hidden="true">
    <svg width={px} height={px} viewBox="0 0 24 24">{resupplyGlyph(kind).map((g) => g.kind === "f" ? <path key={g.d} d={g.d} fill="currentColor" /> : <path key={g.d} d={g.d} fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />)}</svg></span>;
}
const pinEl = (k: ResupplyKind, title: string, dim: boolean) => {
  const b = document.createElement("button"); b.type = "button"; b.className = "group block cursor-pointer bg-transparent p-0";
  const s = document.createElement("span"); s.className = clsx("grid size-7 place-items-center rounded-full border-2 border-white shadow-md ring-1 ring-black/20 transition-transform group-hover:scale-110", dim && "opacity-70");
  s.style.background = RESUPPLY[k].color; s.innerHTML = resupplyIconSvg(k, 15); b.append(s); b.title = title; b.setAttribute("aria-label", title); return b;
};

export function ItinerancePage() {
  const { el, map, ml, ready } = useMap();
  const routes = routesRepo.useAll();
  const [routeId, setRouteId] = useState("");
  const [kinds, setKinds] = useState<ResupplyKind[]>(PRESETS[0].kinds);
  const [custom, setCustom] = useState(false);
  const [radius, setRadius] = useState(500);
  const [places, setPlaces] = useState<ResupplyPlace[] | null>(null);
  const [shown, setShown] = useState<ResupplyKind[]>(RESUPPLY_KINDS);
  const [onRouteOnly, setOnRouteOnly] = useState(false);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState(20);
  const [openSec, setOpenSec] = useState<number | null>(0);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState<[number, number] | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null); const marks = useRef<Marker[]>([]); const flags = useRef<Marker[]>([]); const popup = useRef<Popup | null>(null); const hov = useRef<Marker | null>(null);
  useEffect(() => { if (!routeId && routes.length) setRouteId(routes[0].id); }, [routes, routeId]);
  const route = routes.find((r) => r.id === routeId) ?? null;
  const line = useMemo<LL[]>(() => (route ? route.coords.map((c) => [c[0], c[1]] as LL) : []), [route?.id, route?.coords.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const cum = useMemo(() => cumulative(line), [line]);
  const total = cum[cum.length - 1] ?? 0;
  const stats = useMemo(() => (route && route.coords.length > 1 ? trackStats(route.coords, 3) : null), [route?.id, route?.coords.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const profile = useMemo(() => (route ? buildProfile(route.coords) : []), [route?.id, route?.coords.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = useMemo(() => { const n = norm(q.trim()); return (places ?? []).filter((p) => shown.includes(p.kind) && (!onRouteOnly || !p.detour) && (!n || norm(`${p.name} ${p.address} ${RESUPPLY[p.kind].label}`).includes(n))); }, [places, shown, onRouteOnly, q]);
  const secs = useMemo(() => sections(visible, total, stage), [visible, total, stage]);
  const gapWater = useMemo(() => (places ? gaps(places, total, "water", { strict: true })[0] : undefined), [places, total]);
  const gapFood = useMemo(() => (places ? gaps(places, total, "food")[0] : undefined), [places, total]);
  const added = useMemo(() => new Set((route?.pois ?? []).map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`)), [route]);
  const counts = useMemo(() => { const c: Partial<Record<ResupplyKind, number>> = {}; for (const p of places ?? []) c[p.kind] = (c[p.kind] ?? 0) + 1; return c; }, [places]);
  const famCount = (f: ResupplyFamily) => (places ?? []).filter((p) => familyOf(p.kind) === f).length;
  const searched = (f: ResupplyFamily) => FAMILY[f].kinds.some((k) => kinds.includes(k));
  const pointAt = (d: number): LL => { if (line.length < 2) return line[0] ?? [0, 0]; let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; } const t = cum[hi] > cum[lo] ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0; return [line[lo][0] + (line[hi][0] - line[lo][0]) * t, line[lo][1] + (line[hi][1] - line[lo][1]) * t]; };
  const cacheKey = route ? `crete:iti:${route.id}:${route.coords.length}:${Math.round(total)}:${[...kinds].sort().join(",")}:${radius}` : "";

  // changement de parcours : résultats mémorisés pour la session (même parcours, mêmes critères) rechargés sans nouvelle requête
  useEffect(() => { setPlaces(null); setMsg(null); setSel(null); setOpenSec(0); }, [routeId]);
  useEffect(() => { if (!cacheKey || places) return; try { const c = sessionStorage.getItem(cacheKey); if (c) { setPlaces(JSON.parse(c) as ResupplyPlace[]); setShown(RESUPPLY_KINDS); } } catch { /* cache facultatif */ } }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // tracé, drapeaux, lien pointillé entre le lieu choisi et le parcours
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (!m.getSource("iti")) {
      m.addSource("iti", { type: "geojson", data: { type: "FeatureCollection", features: [] } }); m.addSource("iti-link", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "iti-casing", type: "line", source: "iti", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 7 } });
      m.addLayer({ id: "iti-line", type: "line", source: "iti", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f0612b", "line-width": 4 } });
      m.addLayer({ id: "iti-link-line", type: "line", source: "iti-link", paint: { "line-color": "#0a1514", "line-width": 2.5, "line-dasharray": [1.2, 1.4] } });
    }
    (m.getSource("iti") as GeoJSONSource).setData({ type: "FeatureCollection", features: line.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }] : [] });
    flags.current.forEach((x) => x.remove()); flags.current = [];
    if (line.length > 1) {
      const f = line[0], l = line[line.length - 1], loop = Math.abs(f[0] - l[0]) < 1e-4 && Math.abs(f[1] - l[1]) < 1e-4;
      const put = (k: "start" | "finish" | "loop", at: LL) => flags.current.push(new lib.Marker({ element: routeMarkerEl(k), anchor: "bottom" }).setLngLat(at).addTo(m));
      if (loop) put("loop", f); else { put("start", f); put("finish", l); }
      const b = bboxOf(line); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 14, duration: 0 });
    }
  }, [line, ready, map, ml]);
  const selPlace = visible.find((p) => p.id === sel) ?? null;
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    (m.getSource("iti-link") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: selPlace ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [pointAt(selPlace.atM), [selPlace.lng, selPlace.lat]] } }] : [] });
    popup.current?.remove(); popup.current = null;
    if (selPlace) {
      const box = document.createElement("div"); box.className = "text-sm";
      const h = document.createElement("div"); h.className = "font-semibold"; h.textContent = selPlace.name || RESUPPLY[selPlace.kind].one;
      const k = document.createElement("div"); k.className = "text-xs"; k.style.color = RESUPPLY[selPlace.kind].color; k.textContent = `${RESUPPLY[selPlace.kind].label} · km ${km1(selPlace.atM)}`;
      const d = document.createElement("div"); d.className = "mt-0.5 text-xs text-gray-600"; d.textContent = selPlace.detour ? `À ${fmtOff(selPlace.offM)} du parcours (≈ ${fmtOff(selPlace.detourM)} aller-retour)` : `Sur le parcours (${fmtOff(selPlace.offM)})`;
      box.append(h, k, d); if (selPlace.hours) { const o = document.createElement("div"); o.className = "text-xs text-gray-600"; o.textContent = `Horaires déclarés : ${selPlace.hours}`; box.append(o); }
      popup.current = new lib.Popup({ closeButton: true, closeOnClick: false, offset: 16 }).setLngLat([selPlace.lng, selPlace.lat]).setDOMContent(box).addTo(m);
      popup.current.on("close", () => setSel((s) => (s === selPlace.id ? null : s)));
    }
  }, [selPlace?.id, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps
  // lieux
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    marks.current.forEach((x) => x.remove()); marks.current = [];
    for (const p of visible.slice(0, 500)) {
      const e = pinEl(p.kind, `${p.name || RESUPPLY[p.kind].one} — km ${km1(p.atM)}, à ${fmtOff(p.offM)} du tracé`, p.detour);
      e.addEventListener("click", (ev) => { ev.stopPropagation(); choose(p, false); });
      marks.current.push(new lib.Marker({ element: e }).setLngLat([p.lng, p.lat]).addTo(m));
    }
  }, [visible, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps
  // survol du profil → position sur la carte
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    const c = hover != null ? route?.coords[hover] : undefined;
    if (!c) { hov.current?.remove(); hov.current = null; return; }
    if (!hov.current) { const d = document.createElement("div"); d.className = "size-4 rounded-full border-2 border-white bg-glacier-500 shadow-[0_0_0_5px_rgb(59_166_201/0.35)]"; hov.current = new lib.Marker({ element: d }).setLngLat([c[0], c[1]]).addTo(m); } else hov.current.setLngLat([c[0], c[1]]);
  }, [hover, route, ready, map, ml]);

  const choose = (p: ResupplyPlace, fly: boolean) => {
    setSel(p.id); setOpenSec(Math.min(Math.max(0, Math.ceil(total / (stage * 1000)) - 1), Math.floor(p.atM / (stage * 1000))));
    if (fly) map.current?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.current.getZoom(), 15) });
    setTimeout(() => document.getElementById(`pl-${p.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  };
  async function run() {
    if (!route || line.length < 2) { setMsg({ kind: "warn", text: "Choisissez d'abord un parcours." }); return; }
    if (!kinds.length) { setMsg({ kind: "warn", text: "Choisissez au moins une catégorie." }); return; }
    ctrl.current?.abort(); const c = new AbortController(); ctrl.current = c;
    setBusy(true); setMsg(null); setPlaces(null); setSel(null); setProgress([0, 1]);
    try {
      const r = await findResupply(line, kinds, radius, { signal: c.signal, onProgress: (d, t) => setProgress([d, t]) });
      setPlaces(r); setShown(RESUPPLY_KINDS); setOpenSec(0);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(r)); } catch { /* quota : pas de cache */ }
      setMsg(r.length ? { kind: "ok", text: `${r.length} lieu(x) à moins de ${fmtOff(radius)} du tracé, dont ${r.filter((p) => p.detour).length} avec détour.` } : { kind: "warn", text: `Aucun lieu recensé à moins de ${fmtOff(radius)} du tracé pour ces catégories. Élargissez la distance : en montagne, les commerces sont souvent dans la vallée.` });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const k = e instanceof ResupplyError ? e.kind : "network";
      setMsg({ kind: "err", text: k === "too-long" ? "Parcours trop long pour une seule recherche (plus de 1 500 km) : découpez-le en étapes dans l'éditeur." : k === "rate" ? "Le service OpenStreetMap (Overpass) limite momentanément les requêtes. Réessayez dans une minute." : k === "server" ? "Le service OpenStreetMap (Overpass) a renvoyé une erreur. Réessayez dans un instant, ou réduisez la distance au tracé." : "Service OpenStreetMap (Overpass) injoignable : vérifiez votre connexion et réessayez." });
    } finally { setBusy(false); setProgress(null); }
  }
  const poiOf = (p: ResupplyPlace) => ({ id: uid(), type: RESUPPLY[p.kind].poi, name: `${p.name || RESUPPLY[p.kind].one}${p.hours ? ` (${p.hours})` : ""}`.slice(0, 120), lng: p.lng, lat: p.lat });
  const addPoi = (list: ResupplyPlace[]) => {
    if (!route) return; const fresh = list.filter((p) => !added.has(`${p.lng.toFixed(5)},${p.lat.toFixed(5)}`)).slice(0, 80); if (!fresh.length) return;
    const res = routesRepo.upsert({ ...route, pois: [...route.pois, ...fresh.map(poiOf)], updatedAt: Date.now() });
    setMsg(res.ok ? { kind: "ok", text: fresh.length === 1 ? `« ${fresh[0].name || RESUPPLY[fresh[0].kind].one} » ajouté aux points d'intérêt du parcours.` : `${fresh.length} lieux ajoutés aux points d'intérêt du parcours.` } : { kind: "err", text: res.error ?? "Ajout impossible." });
  };
  const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);
  const presetId = PRESETS.find((p) => p.kinds.length === kinds.length && p.kinds.every((k) => kinds.includes(k)))?.id;
  const chartMarkers: ChartMarker[] = useMemo(() => visible.slice(0, 150).map((p) => ({ d: p.atM, label: RESUPPLY[p.kind].letter, color: RESUPPLY[p.kind].color, title: `${p.name || RESUPPLY[p.kind].one} — km ${km1(p.atM)}` })), [visible]);
  const banner = <StatBanner title={route?.name ?? "Itinérance"} items={stats ? [{ label: "Distance", value: fmtKm(stats.distanceM) }, { label: "Lieux", value: String(visible.length) }] : []} />;
  const sel2 = "h-10 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm";
  const gapCard = (f: ResupplyFamily, g: { fromM: number; toM: number; lengthM: number } | undefined, warnKm: number) => {
    const I = FAM_ICON[f]; if (!searched(f)) return <div key={f} className="rounded-xl border border-dashed border-ink-200 p-3 text-xs text-ink-500"><p className="flex items-center gap-1.5 font-semibold text-ink-700"><I className="size-4" />{FAMILY[f].label}</p><p className="mt-1">Non recherché.</p></div>;
    const n = famCount(f), long = !!g && g.lengthM / 1000 >= warnKm;
    return <div key={f} className={clsx("rounded-xl border p-3 text-xs", n === 0 || long ? "border-warn/50 bg-warn/10" : "border-ink-100 bg-ink-50")}>
      <p className="flex items-center gap-1.5 font-semibold text-ink-800"><I className="size-4" />{FAMILY[f].label}<span className="ml-auto font-display text-base">{n}</span></p>
      {n === 0 ? <p className="mt-1 text-ink-700">Aucun lieu trouvé sur tout le parcours.</p> : g && <p className="mt-1 text-ink-700">Plus long tronçon sans : <b>{km1(g.lengthM)} km</b><br /><span className="text-ink-500">du km {km1(g.fromM)} au km {km1(g.toM)}</span></p>}
    </div>;
  };

  return (
    <div data-workspace="scroll" className="grid min-h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)] lg:grid-cols-[28rem_1fr]">
      <aside className="order-2 min-h-0 overflow-y-auto border-ink-100 bg-white p-4 lg:order-1 lg:border-r">
        <h1 className="flex items-center gap-2 text-xl font-extrabold"><Store className="size-5 text-ember-500" />Itinérance</h1>
        <p className="mt-1 text-sm text-ink-500">Où remplir les gourdes et acheter à manger le long d'un parcours : préparez vos étapes avant de partir.</p>
        {!routes.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 p-5 text-sm text-ink-600">Vous n'avez pas encore de parcours enregistré. <Link className="font-semibold text-pine-700 underline" href="/creer">Créez-en un</Link>, <Link className="font-semibold text-pine-700 underline" href="/fichiers">importez un GPX</Link> ou ajoutez un <Link className="font-semibold text-pine-700 underline" href="/itineraires">itinéraire de référence</Link> à votre bibliothèque.</div>
        ) : (<>
          <label className="mt-4 grid gap-1 text-sm font-medium">Parcours<select className={sel2} value={routeId} onChange={(e) => setRouteId(e.target.value)}>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <div className="mt-4"><p className="mb-1.5 text-sm font-medium">Je cherche</p>
            <div role="group" aria-label="Recherche rapide" className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.id} type="button" aria-pressed={presetId === p.id} onClick={() => { setKinds(p.kinds); setPlaces(null); }} className={clsx("rounded-full border px-3 py-1.5 text-sm font-medium transition", presetId === p.id ? "border-pine-600 bg-pine-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-pine-400")}>{p.label}</button>)}
              <button type="button" aria-expanded={custom} onClick={() => setCustom((v) => !v)} className={clsx("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium", !presetId ? "border-pine-600 bg-pine-50 text-pine-700" : "border-ink-200 text-ink-700")}><SlidersHorizontal className="size-3.5" />Personnaliser</button></div>
            {custom && <fieldset className="mt-2 grid gap-1.5 rounded-xl bg-ink-50 p-3"><legend className="sr-only">Catégories à rechercher</legend>{RESUPPLY_KINDS.map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--color-pine-600)]" checked={kinds.includes(k)} onChange={() => { setKinds(toggle(kinds, k)); setPlaces(null); }} /><KindIcon kind={k} size={22} />{RESUPPLY[k].label}</label>)}</fieldset>}
          </div>
          <label className="mt-4 grid gap-1 text-sm font-medium">Jusqu'à quelle distance du parcours ?<select className={sel2} value={radius} onChange={(e) => { setRadius(+e.target.value); setPlaces(null); }}>{RADII.map((r) => <option key={r} value={r}>{fmtOff(r)}{r <= 250 ? " (au bord du chemin)" : r >= 2000 ? " (détours acceptés)" : ""}</option>)}</select></label>
          <div className="mt-4">{busy ? <Button variant="secondary" size="lg" className="w-full" onClick={() => ctrl.current?.abort()}><Square className="size-4" />Arrêter</Button> : <Button size="lg" className="w-full" onClick={run}><Store className="size-5" />Générer les points de ravitaillement</Button>}</div>
          {busy && progress && <div role="status" className="mt-2"><p className="flex items-center gap-2 text-xs text-ink-500"><Loader2 className="size-3.5 animate-spin" />Recherche le long du tracé… tronçon {progress[0]}/{progress[1]}</p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-pine-600 transition-all" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} /></div></div>}
          {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={clsx("mt-3 rounded-lg px-3 py-2 text-sm", msg.kind === "err" ? "bg-danger/10 text-danger" : msg.kind === "warn" ? "bg-warn/10 text-ink-700" : "bg-pine-50 text-pine-700")}>{msg.text}</p>}

          {places && places.length > 0 && (<section className="mt-5" aria-label="Résultats">
            <h2 className="eyebrow mb-2">Autonomie sur le parcours</h2>
            <div className="grid grid-cols-3 gap-2">{gapCard("water", gapWater, 15)}{gapCard("food", gapFood, 40)}{gapCard("meal", places ? gaps(places, total, "meal")[0] : undefined, 9999)}</div>
            {searched("water") && <p className="mt-1.5 text-[11px] text-ink-500">Eau : seules les fontaines et points d'eau comptent ; les sources naturelles (eau non contrôlée) sont affichées mais pas comptées.</p>}

            <h2 className="eyebrow mb-2 mt-5">Affichage</h2>
            <div role="group" aria-label="Afficher les catégories" className="flex flex-wrap gap-1.5">{RESUPPLY_KINDS.filter((k) => counts[k]).map((k) => <button key={k} type="button" aria-pressed={shown.includes(k)} onClick={() => setShown(toggle(shown, k))} className={clsx("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium", shown.includes(k) ? "border-ink-300 bg-white text-ink-900" : "border-ink-200 text-ink-400 opacity-60")}><KindIcon kind={k} size={20} />{RESUPPLY[k].label} ({counts[k]})</button>)}</div>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <label className="relative"><span className="sr-only">Chercher un lieu par nom ou adresse</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, village…" className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-2 text-sm" /></label>
              <label className="flex items-center gap-1.5 text-xs font-medium">Étapes de<select aria-label="Longueur des étapes" className="h-9 rounded-lg border border-ink-200 bg-white px-1.5 text-sm" value={stage} onChange={(e) => { setStage(+e.target.value); setOpenSec(0); }}>{STAGES.map((s) => <option key={s} value={s}>{s} km</option>)}</select></label>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--color-pine-600)]" checked={onRouteOnly} onChange={(e) => setOnRouteOnly(e.target.checked)} />Seulement les lieux sur le parcours (sans détour)</label>
            <p className="mt-3 flex gap-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-ink-700"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />{RESUPPLY_NOTICE}</p>
            {profile.length > 1 && <div className="mt-3 rounded-xl border border-ink-100 p-1"><ElevationChart points={profile} markers={chartMarkers} onHover={setHover} height={130} /></div>}

            <div className="mt-3 flex flex-wrap items-center gap-2"><p className="mr-auto text-sm font-semibold">{visible.length} lieu(x) affiché(s)</p>
              <Button size="sm" variant="secondary" disabled={!visible.length} onClick={() => addPoi(visible)} title="Ajoute les lieux affichés aux points d'intérêt du parcours (80 au plus)"><Plus className="size-4" />Tout ajouter au parcours</Button>
              <Button size="sm" variant="secondary" disabled={!visible.length} onClick={() => download(`${safeName(route?.name ?? "parcours")}-ravitaillement.csv`, "﻿" + placesCsv(visible), "text/csv;charset=utf-8")}><Download className="size-4" />CSV</Button></div>
            {!visible.length && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">Aucun lieu ne correspond à ces filtres.</p>}
            <div className="mt-3 grid gap-2">{secs.map((s) => { const open = openSec === s.index; return (
              <section key={s.index} className="overflow-hidden rounded-xl border border-ink-100">
                <h3><button type="button" aria-expanded={open} onClick={() => setOpenSec(open ? null : s.index)} className="flex w-full items-center gap-2 bg-ink-50 px-3 py-2.5 text-left text-sm font-semibold font-[family-name:var(--font-sans)]">
                  <span>Km {Math.round(s.fromM / 1000)} – {Math.round(s.toM / 1000)}</span>
                  <span className="ml-auto flex items-center gap-2.5 text-xs font-medium text-ink-600">{(["water", "food", "meal"] as ResupplyFamily[]).map((f) => { const I = FAM_ICON[f]; return <span key={f} className={clsx("inline-flex items-center gap-0.5", !s.counts[f] && "text-ink-300")} title={`${FAMILY[f].label} : ${s.counts[f]}`}><I className="size-3.5" />{s.counts[f]}</span>; })}</span>
                  <ChevronDown className={clsx("size-4 text-ink-400 transition-transform", open && "rotate-180")} /></button></h3>
                {open && (s.places.length ? <ul className="grid gap-2 p-2">{s.places.map((p) => { const done = added.has(`${p.lng.toFixed(5)},${p.lat.toFixed(5)}`); return (
                  <li key={p.id} id={`pl-${p.id}`} className={clsx("rounded-lg border p-2.5 text-sm", sel === p.id ? "border-pine-600 bg-pine-50" : "border-ink-100")}>
                    <div className="flex items-start gap-2.5"><KindIcon kind={p.kind} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2"><button type="button" className="min-w-0 flex-1 text-left font-semibold leading-snug hover:underline" onClick={() => choose(p, true)}>{p.name || <span className="italic text-ink-600">{RESUPPLY[p.kind].one} (sans nom)</span>}</button><span className="shrink-0 rounded-md bg-ink-900 px-1.5 py-0.5 font-display text-[11px] font-bold text-white">km {km1(p.atM)}</span></div>
                        <p className="mt-0.5 text-xs">{p.detour ? <b className="text-warn">Détour : à {fmtOff(p.offM)} du parcours, ≈ {fmtOff(p.detourM)} aller-retour à vol d'oiseau</b> : <span className="font-medium text-pine-700">Sur le parcours ({fmtOff(p.offM)})</span>}</p>
                        {p.address && <p className="mt-1 flex items-start gap-1 text-xs text-ink-600"><MapPin className="mt-0.5 size-3 shrink-0" />{p.address}</p>}
                        {p.hours ? <p className="mt-0.5 flex items-start gap-1 text-xs text-ink-600"><Clock className="mt-0.5 size-3 shrink-0" />Horaires déclarés : {p.hours}</p> : familyOf(p.kind) !== "water" && <p className="mt-0.5 text-xs text-ink-400">Horaires non renseignés</p>}
                        {p.phone && <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-600"><Phone className="size-3 shrink-0" /><a className="underline" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>{p.phone}</a></p>}
                        {p.kind === "spring" && <p className="mt-0.5 text-xs text-warn">Source naturelle : eau non contrôlée, à filtrer ou traiter.</p>}
                        {p.kind === "water" && <p className="mt-0.5 text-xs text-ink-500">{p.drinkable === "yes" ? "Eau déclarée potable" : p.drinkable === "no" ? "Eau déclarée NON potable" : "Potabilité non renseignée"} · peut être coupée (hiver, sécheresse).</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5"><Button size="sm" variant="secondary" className="!h-8 !px-3 !text-xs" disabled={done} onClick={() => addPoi([p])}>{done ? <><Check className="size-3.5" />Ajouté</> : <><Plus className="size-3.5" />Ajouter au parcours</>}</Button>
                          <a className="inline-flex items-center gap-1 text-xs font-medium text-pine-700 underline" href={`https://www.openstreetmap.org/directions?to=${p.lat},${p.lng}`} target="_blank" rel="noreferrer noopener">S'y rendre<ExternalLink className="size-3" /></a>
                          <a className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 underline" href={p.osmUrl} target="_blank" rel="noreferrer noopener">Fiche OSM<ExternalLink className="size-3" /></a></div>
                      </div></div>
                  </li>); })}</ul> : <p className="px-3 py-2.5 text-xs text-ink-500">Aucun lieu sur ce tronçon : prévoyez l'autonomie nécessaire.</p>)}
              </section>); })}</div>
            {route && <p className="mt-3 text-xs text-ink-500">Les lieux ajoutés apparaissent dans <Link className="font-semibold text-pine-700 underline" href={editorHref(route.id)}>l'éditeur du parcours</Link> et dans ses exports GPX. Détours estimés à vol d'oiseau. Données © contributeurs OpenStreetMap (ODbL).</p>}
          </section>)}
        </>)}
      </aside>
      <MapFrame className="order-1 h-[46vh] min-h-[19rem] lg:order-2 lg:h-auto" banner={banner}>
        <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte des commerces et points d'eau" /></div>
        <LayerControl map={map} ready={ready} />
      </MapFrame>
    </div>
  );
}
