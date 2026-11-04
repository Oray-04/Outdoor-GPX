"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { Download, Trash2, WifiOff, Wifi, CheckCircle2, CircleAlert, Loader2, MapPin, HardDrive, Square } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BASEMAPS } from "@/lib/basemaps";
import { routesRepo } from "@/lib/repo";
import { MAX_TILES, MIN_ZOOM, OFFLINE_BASEMAPS, bboxAround, countTiles, deletePackTiles, downloadTiles, estimateMB, packsCoverRoute, prepareApp, savePacks, storageUsage, tileList, tileUrl, unionBBox, usePacks, type BBox, type DownloadProgress, type OfflinePack } from "@/lib/offline";
import { uid } from "@/lib/types";
import { bboxOf, fmtKm } from "@/lib/geo";
import { fromSaved } from "@/lib/route-model";

const fmtMB = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} Go` : `${Math.round(mb)} Mo`);

export function OfflinePage() {
  const { el, map, ready } = useMap({ center: [2.5, 46.6], zoom: 5.3 });
  const routes = routesRepo.useAll();
  const packs = usePacks();
  const [mode, setMode] = useState<"view" | "routes">("view");
  const [picked, setPicked] = useState<string[]>([]);
  const [basemap, setBasemap] = useState("ign-plan");
  const [zmax, setZmax] = useState(15);
  const [name, setName] = useState("");
  const [view, setView] = useState<BBox | null>(null);
  const [online, setOnline] = useState(true);
  const [sw, setSw] = useState<"inconnu" | "actif" | "absent">("inconnu");
  const [usage, setUsage] = useState<{ usedMB: number; quotaMB: number } | null>(null);
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(null);
  const [prepDone, setPrepDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const form = useRef<HTMLElement>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    navigator.serviceWorker?.ready.then(() => setSw("actif")).catch(() => setSw("absent")); if (!("serviceWorker" in navigator)) setSw("absent");
    storageUsage().then(setUsage);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // emprise visible
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    const upd = () => { const b = m.getBounds(); setView([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]); };
    m.on("moveend", upd); upd();
    m.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#f0612b", "fill-opacity": 0.1 } });
    m.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#f0612b", "line-width": 2.5, "line-dasharray": [2, 1] } });
    m.addSource("rts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "rts-line", type: "line", source: "rts", paint: { "line-color": "#1e7a58", "line-width": 3.5 } });
    return () => { m.off("moveend", upd); };
  }, [ready, map]);

  const pickedRoutes = useMemo(() => routes.filter((r) => picked.includes(r.id)), [routes, picked]);
  const area: BBox | null = mode === "routes" ? (pickedRoutes.length ? unionBBox(pickedRoutes.map((r) => bboxAround(r.coords, 1.5))) : null) : view;
  const tiles = area ? countTiles(area, MIN_ZOOM, zmax) : 0;
  const mb = estimateMB(tiles, basemap);
  const tooBig = tiles > MAX_TILES;

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    const a = area && mode === "routes" ? { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [[[area[0], area[1]], [area[2], area[1]], [area[2], area[3]], [area[0], area[3]], [area[0], area[1]]]] } } : null;
    (m.getSource("area") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: a ? [a] : [] });
    (m.getSource("rts") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: pickedRoutes.map((r) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.coords.map((c) => [c[0], c[1]]) } })) });
  }, [area, mode, pickedRoutes, ready, map]);
  useEffect(() => { if (mode === "routes" && pickedRoutes.length && map.current) { const b = bboxOf(pickedRoutes.flatMap((r) => r.coords)); map.current.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 14 }); } }, [pickedRoutes.length, mode, map]); // eslint-disable-line react-hooks/exhaustive-deps

  async function prepare() {
    setPrep({ done: 0, total: 1 }); setPrepDone(false); setMsg(null);
    try { await prepareApp((done, total) => setPrep({ done, total })); setPrepDone(true); setMsg({ kind: "ok", text: "Application prête : ses pages principales fonctionnent maintenant sans connexion." }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message || "Préparation impossible." }); }
    finally { setPrep(null); storageUsage().then(setUsage); }
  }

  async function download() {
    if (!area || tooBig) return;
    const b = BASEMAPS.find((x) => x.id === basemap)!;
    if (usage && usage.quotaMB && mb > (usage.quotaMB - usage.usedMB) * 0.9) { setMsg({ kind: "err", text: `Espace de stockage insuffisant (≈ ${fmtMB(mb)} nécessaires, ${fmtMB(usage.quotaMB - usage.usedMB)} disponibles).` }); return; }
    const urls = [...tileList(area, MIN_ZOOM, zmax)].map(([z, x, y]) => tileUrl(b, z, x, y));
    ctrl.current?.abort(); const c = new AbortController(); ctrl.current = c;
    setBusy(true); setMsg(null); setProgress({ done: 0, total: urls.length, bytes: 0, failed: 0 });
    try {
      const r = await downloadTiles(urls, { signal: c.signal, onProgress: setProgress });
      const pack: OfflinePack = { id: uid(), name: name.trim() || (mode === "routes" && pickedRoutes[0] ? pickedRoutes[0].name : `Zone ${packs.length + 1}`), bbox: area, zmin: MIN_ZOOM, zmax, basemap, tiles: r.total - r.failed, bytes: r.bytes, failed: r.failed, createdAt: Date.now(), routeIds: mode === "routes" ? picked : [] };
      savePacks([pack, ...packs]); setName("");
      setMsg({ kind: r.failed ? "warn" : "ok", text: `Zone téléchargée : ${pack.tiles} tuiles${r.failed ? ` (${r.failed} échec(s) : relancez le téléchargement pour compléter)` : ""}.` });
    } catch (e) { setMsg({ kind: (e as Error).name === "AbortError" ? "warn" : "err", text: (e as Error).name === "AbortError" ? "Téléchargement interrompu : les tuiles déjà reçues sont conservées." : (e as Error).message }); }
    finally { setBusy(false); setProgress(null); storageUsage().then(setUsage); }
  }

  async function remove(p: OfflinePack) {
    if (!confirm(`Supprimer la zone « ${p.name} » ?`)) return;
    await deletePackTiles(p, packs); savePacks(packs.filter((x) => x.id !== p.id)); storageUsage().then(setUsage);
  }
  const prepareRoute = (id: string) => { setMode("routes"); setPicked([id]); form.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const card = "rounded-2xl bg-white p-5 ring-1 ring-ink-100";
  const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Hors ligne</h1>
      <p className="mt-2 max-w-3xl text-ink-600">Téléchargez à l'avance le fond de carte d'une zone et vos parcours pour les consulter, et suivre votre itinéraire, sans réseau (montagne, zones blanches).</p>

      <section className={clsx(card, "mt-6")} aria-label="État">
        <h2 className="text-lg font-bold">État de l'appareil</h2>
        <ul className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <li className="flex items-center gap-2">{online ? <Wifi className="size-5 text-pine-600" /> : <WifiOff className="size-5 text-warn" />}<span><b>{online ? "En ligne" : "Hors ligne"}</b><br /><span className="text-ink-500">{online ? "Téléchargements possibles" : "Cartes téléchargées uniquement"}</span></span></li>
          <li className="flex items-center gap-2">{sw === "actif" ? <CheckCircle2 className="size-5 text-pine-600" /> : <CircleAlert className="size-5 text-warn" />}<span><b>Mode hors ligne : {sw === "actif" ? "actif" : sw === "absent" ? "indisponible" : "…"}</b><br /><span className="text-ink-500">{sw === "absent" ? "Navigateur non compatible, ou version de développement" : "Service worker enregistré"}</span></span></li>
          <li className="flex items-center gap-2"><HardDrive className="size-5 text-ink-500" /><span><b>{usage ? `${fmtMB(usage.usedMB)} utilisés` : "Stockage"}</b><br /><span className="text-ink-500">{usage?.quotaMB ? `sur ${fmtMB(usage.quotaMB)} disponibles` : "mesure indisponible"}</span></span></li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={prepare} disabled={!!prep || sw !== "actif" || !online}>{prep ? <><Loader2 className="size-4 animate-spin" />Préparation {prep.done}/{prep.total}</> : "Préparer l'application hors ligne"}</Button>
          {prepDone && <Badge tone="pine"><CheckCircle2 className="size-3" />Application prête</Badge>}
          <p className="text-xs text-ink-500">Met en cache les pages principales pour qu'elles s'ouvrent sans connexion. À faire une fois, en ligne.</p>
        </div>
        {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={clsx("mt-3 rounded-lg px-3 py-2 text-sm", msg.kind === "err" ? "bg-danger/10 text-danger" : msg.kind === "warn" ? "bg-warn/10 text-ink-700" : "bg-pine-50 text-pine-700")}>{msg.text}</p>}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_1fr]">
        <section ref={form} className={card} aria-label="Télécharger une zone">
          <h2 className="text-lg font-bold">Télécharger une zone</h2>
          <div role="group" aria-label="Zone à télécharger" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1">
            {([["view", "Zone visible"], ["routes", "Autour de parcours"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={clsx("rounded-lg py-2 text-sm font-semibold", mode === k ? "bg-white shadow" : "text-ink-600")}>{l}</button>)}
          </div>
          {mode === "view" ? <p className="mt-2 text-xs text-ink-500">La zone téléchargée est celle que vous voyez sur la carte : déplacez et zoomez pour la cadrer.</p> : (
            <fieldset className="mt-3"><legend className="text-sm font-medium">Parcours à emporter (marge de 1,5 km)</legend>
              {routes.length ? <ul className="mt-1 grid max-h-44 gap-1 overflow-y-auto">{routes.map((r) => <li key={r.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(r.id)} onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))} className="accent-[var(--color-pine-600)]" />{r.name} <span className="text-ink-400">{fmtKm(fromSaved(r).stats.distanceM)}</span></label></li>)}</ul> : <p className="mt-1 text-sm text-ink-500">Aucun parcours enregistré sur cet appareil.</p>}
            </fieldset>)}
          <label className="mt-3 grid gap-1 text-sm font-medium">Fond de carte<select className={inp} value={basemap} onChange={(e) => setBasemap(e.target.value)}>{OFFLINE_BASEMAPS.map((id) => <option key={id} value={id}>{BASEMAPS.find((b) => b.id === id)!.label}</option>)}</select></label>
          <label className="mt-3 grid gap-1 text-sm font-medium"><span className="flex justify-between"><span>Niveau de détail maximal</span><b className="font-display">zoom {zmax}</b></span><input type="range" min={13} max={17} step={1} value={zmax} onChange={(e) => setZmax(+e.target.value)} className="h-8 accent-[var(--color-pine-600)]" aria-label="Zoom maximal" /></label>
          <p className="text-xs text-ink-500">Zoom 15 : chemins lisibles ; 16-17 : très détaillé mais volumineux.</p>
          <label className="mt-3 grid gap-1 text-sm font-medium">Nom<input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Week-end Vercors" maxLength={60} /></label>
          <div className={clsx("mt-3 rounded-xl p-3 text-sm", tooBig ? "bg-danger/10 text-danger" : "bg-ink-50")} aria-live="polite">
            {area ? <><b>{tiles.toLocaleString("fr-FR")}</b> tuiles · environ <b>{fmtMB(mb)}</b>{tooBig && <p className="mt-1">Zone trop grande (maximum {MAX_TILES.toLocaleString("fr-FR")} tuiles) : réduisez la zone ou le niveau de détail.</p>}</> : "Choisissez au moins un parcours."}
          </div>
          {busy && progress ? <div className="mt-3" role="status"><div className="flex justify-between text-xs text-ink-500"><span>Téléchargement…</span><span>{progress.done}/{progress.total}{progress.failed ? ` · ${progress.failed} échec(s)` : ""}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-pine-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div><Button className="mt-2" variant="secondary" size="sm" onClick={() => ctrl.current?.abort()}><Square className="size-4" />Arrêter</Button></div>
            : <Button className="mt-3 w-full" size="lg" onClick={download} disabled={!area || tooBig || !online || sw !== "actif"}><Download className="size-5" />Télécharger</Button>}
          {(!online || sw !== "actif") && <p className="mt-2 text-xs text-ink-500">{!online ? "Connexion requise pour télécharger." : "Le mode hors ligne n'est pas actif sur ce navigateur."}</p>}
          <p className="mt-3 text-xs text-ink-500">Cartes IGN (Géoplateforme), à usage personnel et raisonnable. Les fonds OpenStreetMap, OpenTopoMap et Thunderforest ne sont pas téléchargeables (leurs conditions l'interdisent ou le déconseillent). Couverture : France.</p>
        </section>

        <div className="relative h-[22rem] overflow-hidden rounded-2xl ring-1 ring-ink-100 lg:h-auto lg:min-h-[28rem]"><div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte de cadrage de la zone" /></div></div>
      </div>

      <section className={clsx(card, "mt-6")} aria-label="Mes téléchargements">
        <h2 className="text-lg font-bold">Mes zones téléchargées ({packs.length})</h2>
        {packs.length ? <ul className="mt-3 grid gap-2">{packs.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink-50 p-3">
            <div className="min-w-0 flex-1"><p className="font-semibold">{p.name}</p><p className="text-xs text-ink-500">{BASEMAPS.find((b) => b.id === p.basemap)?.label} · zoom {p.zmin}–{p.zmax} · {p.tiles.toLocaleString("fr-FR")} tuiles{p.failed ? ` (${p.failed} manquantes)` : ""} · ≈ {fmtMB(estimateMB(p.tiles, p.basemap))} · {new Date(p.createdAt).toLocaleDateString("fr-FR")}</p></div>
            <Button size="sm" variant="secondary" onClick={() => { setMode("view"); map.current?.fitBounds([[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]], { padding: 30 }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><MapPin className="size-4" />Voir</Button>
            <Button size="sm" variant="ghost" aria-label={`Supprimer ${p.name}`} onClick={() => remove(p)}><Trash2 className="size-4" /></Button></li>))}</ul> : <p className="mt-2 text-sm text-ink-500">Aucune zone téléchargée.</p>}
      </section>

      <section className={clsx(card, "mt-6")} aria-label="Parcours prêts pour la sortie">
        <h2 className="text-lg font-bold">Parcours prêts pour la sortie</h2>
        <p className="mt-1 text-sm text-ink-500">Un parcours est prêt s'il est enregistré sur cet appareil et qu'une zone téléchargée le couvre entièrement (zoom 12 à 14 au moins) : vous pouvez alors le suivre dans « Suivi GPS » sans réseau.</p>
        {routes.length ? <ul className="mt-3 grid gap-2">{routes.map((r) => { const ok = packsCoverRoute(packs, bboxAround(r.coords, 0)); return (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink-50 p-3"><span className="min-w-0 flex-1 font-medium">{r.name}</span>
            {ok ? <Badge tone="pine"><CheckCircle2 className="size-3" />Prêt · {ok.name}</Badge> : <><Badge tone="ember"><CircleAlert className="size-3" />Carte non téléchargée</Badge><Button size="sm" variant="secondary" onClick={() => prepareRoute(r.id)}>Préparer</Button></>}</li>); })}</ul> : <p className="mt-2 text-sm text-ink-500">Aucun parcours enregistré. Créez-en un, importez un GPX, ou enregistrez un parcours de la communauté sur votre appareil.</p>}
      </section>
    </div>
  );
}
