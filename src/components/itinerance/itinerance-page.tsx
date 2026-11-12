"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import Link from "next/link";
import { Store, Loader2, Plus, Check, ExternalLink, Clock, MapPin, TriangleAlert, Square } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { MapFrame, StatBanner } from "@/components/map/map-frame";
import { Button } from "@/components/ui/button";
import { routesRepo } from "@/lib/repo";
import { routeMarkerEl } from "@/lib/route-markers";
import { RESUPPLY, RESUPPLY_KINDS, RESUPPLY_NOTICE, ResupplyError, findResupply, type ResupplyKind, type ResupplyPlace } from "@/lib/resupply";
import { bboxOf, fmtKm, trackStats } from "@/lib/geo";
import { uid, type LL } from "@/lib/types";
import { editorHref } from "@/lib/url";

const RADII = [100, 250, 500, 1000, 2000, 5000];
const fmtOff = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);
const pinEl = (k: ResupplyKind, title: string) => { const b = document.createElement("button"); b.type = "button"; b.className = "group block cursor-pointer bg-transparent p-0"; const s = document.createElement("span"); s.className = "grid size-7 place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow-md ring-1 ring-black/20 transition-transform group-hover:scale-110"; s.style.background = RESUPPLY[k].color; s.textContent = RESUPPLY[k].letter; b.append(s); b.title = title; b.setAttribute("aria-label", title); return b; };

export function ItinerancePage() {
  const { el, map, ml, ready } = useMap();
  const routes = routesRepo.useAll();
  const [routeId, setRouteId] = useState("");
  const [kinds, setKinds] = useState<ResupplyKind[]>(["bakery", "grocery", "supermarket", "water"]);
  const [radius, setRadius] = useState(500);
  const [places, setPlaces] = useState<ResupplyPlace[] | null>(null);
  const [shown, setShown] = useState<ResupplyKind[]>(RESUPPLY_KINDS);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState<[number, number] | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null); const marks = useRef<Marker[]>([]); const flags = useRef<Marker[]>([]);
  useEffect(() => { if (!routeId && routes.length) setRouteId(routes[0].id); }, [routes, routeId]);
  const route = routes.find((r) => r.id === routeId) ?? null;
  const line = useMemo<LL[]>(() => (route ? route.coords.map((c) => [c[0], c[1]] as LL) : []), [route]);
  const stats = useMemo(() => (route && route.coords.length > 1 ? trackStats(route.coords, 3) : null), [route]);
  const visible = useMemo(() => (places ?? []).filter((p) => shown.includes(p.kind)), [places, shown]);
  const added = useMemo(() => new Set((route?.pois ?? []).map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`)), [route]);

  useEffect(() => { setPlaces(null); setMsg(null); setSel(null); }, [routeId]);
  // tracé + drapeaux
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (!m.getSource("iti")) { m.addSource("iti", { type: "geojson", data: { type: "FeatureCollection", features: [] } }); m.addLayer({ id: "iti-casing", type: "line", source: "iti", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 7 } }); m.addLayer({ id: "iti-line", type: "line", source: "iti", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f0612b", "line-width": 4 } }); }
    (m.getSource("iti") as GeoJSONSource).setData({ type: "FeatureCollection", features: line.length > 1 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line } }] : [] });
    flags.current.forEach((x) => x.remove()); flags.current = [];
    if (line.length > 1) {
      const f = line[0], l = line[line.length - 1], loop = Math.abs(f[0] - l[0]) < 1e-4 && Math.abs(f[1] - l[1]) < 1e-4;
      const put = (k: "start" | "finish" | "loop", at: LL) => flags.current.push(new lib.Marker({ element: routeMarkerEl(k), anchor: "bottom" }).setLngLat(at).addTo(m));
      if (loop) put("loop", f); else { put("start", f); put("finish", l); }
      const b = bboxOf(line); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 14, duration: 0 });
    }
  }, [line, ready, map, ml]);
  // lieux
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    marks.current.forEach((x) => x.remove()); marks.current = [];
    for (const p of visible.slice(0, 600)) {
      const e = pinEl(p.kind, `${p.name || RESUPPLY[p.kind].label} — km ${(p.atM / 1000).toFixed(1)}, à ${fmtOff(p.offM)} du tracé`);
      e.addEventListener("click", (ev) => { ev.stopPropagation(); setSel(p.id); document.getElementById(`pl-${p.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
      marks.current.push(new lib.Marker({ element: e }).setLngLat([p.lng, p.lat]).addTo(m));
    }
  }, [visible, ready, map, ml]);

  async function run() {
    if (!route || line.length < 2) { setMsg({ kind: "warn", text: "Choisissez d'abord un parcours." }); return; }
    if (!kinds.length) { setMsg({ kind: "warn", text: "Cochez au moins une catégorie." }); return; }
    ctrl.current?.abort(); const c = new AbortController(); ctrl.current = c;
    setBusy(true); setMsg(null); setPlaces(null); setProgress([0, 1]);
    try {
      const r = await findResupply(line, kinds, radius, { signal: c.signal, onProgress: (d, t) => setProgress([d, t]) });
      setPlaces(r); setShown(RESUPPLY_KINDS);
      setMsg(r.length ? { kind: "ok", text: `${r.length} lieu(x) trouvé(s) à moins de ${fmtOff(radius)} du tracé, dont ${r.filter((p) => p.detour).length} avec détour.` } : { kind: "warn", text: `Aucun lieu recensé à moins de ${fmtOff(radius)} du tracé pour ces catégories. Essayez un rayon plus large : en montagne, les commerces sont souvent dans la vallée.` });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const k = e instanceof ResupplyError ? e.kind : "network";
      setMsg({ kind: "err", text: k === "too-long" ? "Parcours trop long pour une seule recherche (plus de 1 500 km) : découpez-le en étapes." : k === "rate" ? "Le service OpenStreetMap (Overpass) limite momentanément les requêtes. Réessayez dans une minute." : k === "server" ? "Le service OpenStreetMap (Overpass) a renvoyé une erreur. Réessayez dans un instant, ou réduisez le rayon." : "Service OpenStreetMap (Overpass) injoignable : vérifiez votre connexion et réessayez." });
    } finally { setBusy(false); setProgress(null); }
  }
  const addPoi = (p: ResupplyPlace) => {
    if (!route) return;
    const name = `${p.name || RESUPPLY[p.kind].label.replace(/s$/, "")}${p.hours ? ` (${p.hours})` : ""}`.slice(0, 120);
    const res = routesRepo.upsert({ ...route, pois: [...route.pois, { id: uid(), type: RESUPPLY[p.kind].poi, name, lng: p.lng, lat: p.lat }], updatedAt: Date.now() });
    setMsg(res.ok ? { kind: "ok", text: `« ${p.name || RESUPPLY[p.kind].label} » ajouté aux points d'intérêt du parcours.` } : { kind: "err", text: res.error ?? "Ajout impossible." });
  };
  const focus = (p: ResupplyPlace) => { setSel(p.id); map.current?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.current.getZoom(), 15) }); };
  const counts = useMemo(() => { const c: Partial<Record<ResupplyKind, number>> = {}; for (const p of places ?? []) c[p.kind] = (c[p.kind] ?? 0) + 1; return c; }, [places]);
  const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);
  const banner = <StatBanner title={route?.name ?? "Itinérance"} items={stats ? [{ label: "Distance", value: fmtKm(stats.distanceM) }, { label: "Lieux", value: String(visible.length) }] : []} />;

  return (
    <div data-workspace="scroll" className="grid min-h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)] lg:grid-cols-[27rem_1fr]">
      <aside className="order-2 min-h-0 overflow-y-auto border-ink-100 bg-white p-4 lg:order-1 lg:border-r">
        <h1 className="flex items-center gap-2 text-xl font-extrabold"><Store className="size-5 text-ember-500" />Itinérance</h1>
        <p className="mt-1 text-sm text-ink-500">Trouvez où remplir vos gourdes et acheter à manger le long d'un parcours : boulangeries, épiceries, supermarchés, restauration, fontaines.</p>
        {!routes.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-ink-200 p-5 text-sm text-ink-600">Vous n'avez pas encore de parcours enregistré. <Link className="font-semibold text-pine-700 underline" href="/creer">Créez-en un</Link>, <Link className="font-semibold text-pine-700 underline" href="/fichiers">importez un GPX</Link> ou ajoutez un <Link className="font-semibold text-pine-700 underline" href="/itineraires">itinéraire de référence</Link> à votre bibliothèque.</div>
        ) : (<>
          <label className="mt-4 grid gap-1 text-sm font-medium">Parcours<select className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm" value={routeId} onChange={(e) => setRouteId(e.target.value)}>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">Catégories à rechercher</legend>
            <div className="grid gap-1.5">{RESUPPLY_KINDS.map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--color-pine-600)]" checked={kinds.includes(k)} onChange={() => setKinds(toggle(kinds, k))} /><span className="grid size-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: RESUPPLY[k].color }} aria-hidden="true">{RESUPPLY[k].letter}</span>{RESUPPLY[k].label}</label>)}</div>
          </fieldset>
          <label className="mt-4 grid gap-1 text-sm font-medium">Distance maximale au tracé<select className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm" value={radius} onChange={(e) => setRadius(+e.target.value)}>{RADII.map((r) => <option key={r} value={r}>{fmtOff(r)}</option>)}</select></label>
          <div className="mt-4">{busy ? <Button variant="secondary" size="lg" className="w-full" onClick={() => ctrl.current?.abort()}><Square className="size-4" />Arrêter</Button> : <Button size="lg" className="w-full" onClick={run}><Store className="size-5" />Générer les points de ravitaillement</Button>}</div>
          {busy && progress && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-ink-500"><Loader2 className="size-3.5 animate-spin" />Recherche le long du tracé… tronçon {progress[0]}/{progress[1]}</p>}
          {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={clsx("mt-3 rounded-lg px-3 py-2 text-sm", msg.kind === "err" ? "bg-danger/10 text-danger" : msg.kind === "warn" ? "bg-warn/10 text-ink-700" : "bg-pine-50 text-pine-700")}>{msg.text}</p>}

          {places && places.length > 0 && (<section className="mt-5" aria-label="Résultats">
            <div role="group" aria-label="Afficher les catégories" className="flex flex-wrap gap-1.5">{RESUPPLY_KINDS.filter((k) => counts[k]).map((k) => <button key={k} type="button" aria-pressed={shown.includes(k)} onClick={() => setShown(toggle(shown, k))} className={clsx("rounded-full border px-2.5 py-1 text-xs font-medium", shown.includes(k) ? "border-transparent text-white" : "border-ink-200 text-ink-600")} style={shown.includes(k) ? { background: RESUPPLY[k].color } : undefined}>{RESUPPLY[k].label} ({counts[k]})</button>)}</div>
            <p className="mt-3 flex gap-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-ink-700"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />{RESUPPLY_NOTICE}</p>
            <ul className="mt-3 grid gap-2">{visible.map((p) => { const done = added.has(`${p.lng.toFixed(5)},${p.lat.toFixed(5)}`); return (
              <li key={p.id} id={`pl-${p.id}`} className={clsx("rounded-xl border p-3 text-sm", sel === p.id ? "border-pine-600 bg-pine-50" : "border-ink-100")}>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: RESUPPLY[p.kind].color }} aria-hidden="true">{RESUPPLY[p.kind].letter}</span>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="text-left font-semibold hover:underline" onClick={() => focus(p)}>{p.name || <span className="italic text-ink-500">Sans nom</span>}</button>
                    <p className="text-xs text-ink-500">{RESUPPLY[p.kind].label} · km {(p.atM / 1000).toFixed(1).replace(".", ",")} · {p.detour ? <b className="text-warn">détour ≈ {fmtOff(p.detourM)} aller-retour</b> : <span className="text-pine-700">sur le parcours ({fmtOff(p.offM)})</span>}</p>
                    {p.address && <p className="mt-1 flex items-start gap-1 text-xs text-ink-600"><MapPin className="mt-0.5 size-3 shrink-0" />{p.address}</p>}
                    {p.hours ? <p className="mt-0.5 flex items-start gap-1 text-xs text-ink-600"><Clock className="mt-0.5 size-3 shrink-0" />Horaires déclarés : {p.hours}</p> : (p.kind !== "water" && p.kind !== "spring") && <p className="mt-0.5 text-xs text-ink-400">Horaires non renseignés</p>}
                    {p.kind === "spring" && <p className="mt-0.5 text-xs text-warn">Source naturelle : eau non contrôlée, à filtrer ou traiter.</p>}
                    {p.kind === "water" && <p className="mt-0.5 text-xs text-ink-500">{p.drinkable === "yes" ? "Eau déclarée potable" : p.drinkable === "no" ? "Eau déclarée NON potable" : "Potabilité non renseignée"} · peut être coupée (hiver, sécheresse).</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2"><Button size="sm" variant="secondary" disabled={done} onClick={() => addPoi(p)}>{done ? <><Check className="size-4" />Ajouté au parcours</> : <><Plus className="size-4" />Ajouter comme POI</>}</Button><a className="inline-flex items-center gap-1 text-xs font-medium text-pine-700 underline" href={p.osmUrl} target="_blank" rel="noreferrer noopener">Fiche OpenStreetMap<ExternalLink className="size-3" /></a></div>
                  </div>
                </div>
              </li>); })}</ul>
            {route && <p className="mt-3 text-xs text-ink-500">Les POI ajoutés apparaissent dans <Link className="font-semibold text-pine-700 underline" href={editorHref(route.id)}>l'éditeur du parcours</Link> et dans ses exports GPX. Données © contributeurs OpenStreetMap (ODbL).</p>}
          </section>)}
        </>)}
      </aside>
      <MapFrame className="order-1 h-[50vh] min-h-[20rem] lg:order-2 lg:h-auto" banner={banner}>
        <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte des commerces et points d'eau" /></div>
        <LayerControl map={map} ready={ready} />
      </MapFrame>
    </div>
  );
}
