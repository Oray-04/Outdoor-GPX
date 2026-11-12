"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import { Sparkles, LocateFixed, Search, Loader2, Square, Download, Pencil, Save, TriangleAlert, Mountain, Check, Route as RouteIcon } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { MapFrame, StatBanner } from "@/components/map/map-frame";
import { ElevationChart } from "@/components/route/elevation-chart";
import { Button } from "@/components/ui/button";
import { generateLoops, GenerationError, type Proposal, type Progress } from "@/lib/generator";
import { PROFILE_HINT, profileForSport, routeVia, surfaceShare } from "@/lib/routing";
import { addElevation, lastElevationSource } from "@/lib/ign";
import { buildProfile } from "@/lib/profile";
import { fromTrack } from "@/lib/editor-core";
import { routesRepo } from "@/lib/repo";
import { geocode } from "@/lib/geocode";
import { FORMATS, download, safeName, serialize } from "@/lib/formats";
import { bboxOf, fmtKm, fmtM } from "@/lib/geo";
import { editorHref, withBase } from "@/lib/url";
import { uid, type LL, type SavedRoute } from "@/lib/types";
import type { Sport } from "@/lib/sports";

type Practice = "trail" | "rando" | "vtt" | "velo";
/** Plages de distance et de D+ par pratique (une sortie route est bien plus longue qu'un trail). */
const PRACTICES: { id: Practice; label: string; sport: Sport; maxKm: number; stepKm: number; maxGain: number; defKm: number; defGain: number }[] = [
  { id: "trail", label: "Trail", sport: "trail", maxKm: 80, stepKm: 1, maxGain: 3500, defKm: 12, defGain: 500 },
  { id: "rando", label: "Randonnée", sport: "rando", maxKm: 60, stepKm: 1, maxGain: 3500, defKm: 12, defGain: 500 },
  { id: "vtt", label: "VTT", sport: "vtt", maxKm: 120, stepKm: 1, maxGain: 3500, defKm: 30, defGain: 800 },
  { id: "velo", label: "Vélo de route", sport: "velo", maxKm: 200, stepKm: 5, maxGain: 5000, defKm: 60, defGain: 1000 },
];
const COLORS = ["#f0612b", "#3ba6c9", "#7a4bd1", "#1e7a58", "#c98a0b", "#d4202a"];
const PHASE: Record<Progress["phase"], string> = { relief: "Mesure du relief autour du départ", tracé: "Calcul des boucles", altitudes: "Mesure des dénivelés", analyse: "Analyse des chemins" };

export function GeneratorPage() {
  const { el, map, ml, ready } = useMap();
  const [start, setStart] = useState<LL | null>(null);
  const [practice, setPractice] = useState<Practice>("trail");
  const prac = PRACTICES.find((x) => x.id === practice)!;
  const [km, setKm] = useState(12);
  const [gain, setGain] = useState(500);
  const [anyGain, setAnyGain] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [props, setProps] = useState<Proposal[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const startMarker = useRef<Marker | null>(null);
  const selected = props.find((p) => p.id === sel) ?? null;
  const profile = useMemo(() => (selected ? buildProfile(selected.coords) : []), [selected]);

  // carte : lignes des propositions
  useEffect(() => {
    const m = map.current; if (!m || !ready || m.getSource("gen")) return;
    m.addSource("gen", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "gen-casing", type: "line", source: "gen", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": ["case", ["get", "sel"], 9, 6] } });
    m.addLayer({ id: "gen-line", type: "line", source: "gen", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "sel"], 5, 3.5], "line-opacity": ["case", ["get", "sel"], 1, 0.75] } });
    m.on("mouseenter", "gen-line", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "gen-line", () => (m.getCanvas().style.cursor = ""));
  }, [ready, map]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    (m.getSource("gen") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: props.map((p, i) => ({ type: "Feature", properties: { id: p.id, color: COLORS[i % COLORS.length], sel: p.id === sel }, geometry: { type: "LineString", coordinates: p.line } })) });
  }, [props, sel, ready, map]);

  // clic : sélectionner une proposition, sinon placer le départ
  const clickRef = useRef<(lng: number, lat: number, px: { x: number; y: number }) => void>(() => {});
  clickRef.current = (lng, lat, px) => {
    const m = map.current; if (!m || busy) return;
    const hit = m.queryRenderedFeatures([[px.x - 8, px.y - 8], [px.x + 8, px.y + 8]], { layers: ["gen-line"] })[0];
    if (hit) { setSel(hit.properties?.id ?? null); return; }
    setStart([lng, lat]); setProps([]); setSel(null);
  };
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    const h = (e: { lngLat: { lng: number; lat: number }; point: { x: number; y: number } }) => clickRef.current(e.lngLat.lng, e.lngLat.lat, e.point);
    m.on("click", h); return () => { m.off("click", h); };
  }, [ready, map]);

  // marqueur de départ (déplaçable)
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (!start) { startMarker.current?.remove(); startMarker.current = null; return; }
    if (!startMarker.current) {
      const d = document.createElement("div"); d.className = "grid size-8 place-items-center rounded-full border-2 border-white bg-pine-600 text-xs font-bold text-white shadow-lg"; d.textContent = "D"; d.title = "Départ : glissez pour déplacer";
      const mk = new lib.Marker({ element: d, draggable: true }).setLngLat(start).addTo(m);
      mk.on("dragend", () => { const p = mk.getLngLat(); setStart([p.lng, p.lat]); setProps([]); setSel(null); });
      startMarker.current = mk;
    } else startMarker.current.setLngLat(start);
  }, [start, ready, map, ml]);

  // position survolée sur le profil
  const hoverMk = useRef<Marker | null>(null);
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (hover == null || !selected?.coords[hover]) { hoverMk.current?.remove(); hoverMk.current = null; return; }
    const c = selected.coords[hover];
    if (!hoverMk.current) { const d = document.createElement("div"); d.className = "size-4 rounded-full border-2 border-white bg-glacier-500 shadow-[0_0_0_5px_rgb(59_166_201/0.35)]"; hoverMk.current = new lib.Marker({ element: d }).setLngLat([c[0], c[1]]).addTo(m); } else hoverMk.current.setLngLat([c[0], c[1]]);
  }, [hover, selected, ready, map, ml]);

  const locate = () => navigator.geolocation?.getCurrentPosition((p) => { const s: LL = [p.coords.longitude, p.coords.latitude]; setStart(s); setProps([]); map.current?.flyTo({ center: s, zoom: 13 }); }, () => setMsg({ kind: "warn", text: "Position indisponible ou refusée." }));
  const search = async (e: React.FormEvent) => {
    e.preventDefault(); if (!q.trim()) return;
    try { const h = await geocode(q); if (!h) { setMsg({ kind: "warn", text: "Aucun lieu trouvé." }); return; } const s: LL = [h.lng, h.lat]; setStart(s); setProps([]); map.current?.flyTo({ center: s, zoom: Math.max(h.zoom, 12) }); setMsg({ kind: "ok", text: `Départ : ${h.label}` }); }
    catch { setMsg({ kind: "err", text: "Recherche indisponible pour le moment." }); }
  };

  /** Message selon la vraie cause (hors ligne, limite de requêtes, panne d'un service…). */
  const explain = (e: unknown): string => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return "Pas de connexion Internet : la génération a besoin du réseau (calcul d'itinéraires et altitudes).";
    if (e instanceof GenerationError) {
      const { reason, status } = e.detail; const code = status ? ` (code ${status})` : "";
      const why = reason === "rate" ? `limite de requêtes atteinte${code}` : reason === "server" ? `le service a renvoyé une erreur${code}` : "service injoignable (réseau, délai dépassé ou blocage du navigateur)";
      return e.kind === "routing"
        ? `Le service de calcul d'itinéraires (OpenStreetMap / FOSSGIS) n'a pas répondu : ${why}. Vos critères ne sont pas en cause ; réessayez dans une minute ou choisissez un départ plus proche d'un chemin.`
        : `Les boucles ont été calculées mais le service d'altitudes (IGN, puis Open-Meteo en secours) n'a pas répondu : ${why}. Sans altitudes le dénivelé ne peut pas être mesuré ; réessayez dans une minute.`;
    }
    return `Erreur inattendue pendant la génération (${e instanceof Error ? e.message : "inconnue"}). Réessayez ; si elle persiste, signalez-la avec ce texte.`;
  };

  async function run() {
    if (!start) { setMsg({ kind: "warn", text: "Choisissez d'abord un point de départ (clic sur la carte, adresse ou position)." }); return; }
    ctrl.current?.abort(); const c = new AbortController(); ctrl.current = c;
    setBusy(true); setMsg(null); setProps([]); setSel(null); setProgress({ phase: "tracé", done: 0, total: 12 });
    try {
      const res = await generateLoops({ start, targetKm: km, targetGain: anyGain ? null : gain, profile: profileForSport(PRACTICES.find((x) => x.id === practice)!.sport), count: 4 },
        { via: routeVia, elevate: addElevation, surface: surfaceShare, ...(km > 35 ? { elevateFast: (l: LL[], sg?: AbortSignal) => addElevation(l, sg, Math.min(120, Math.round(km * 1.2))) } : {}) }, { signal: c.signal, onProgress: setProgress });
      setProps(res); setSel(res[0]?.id ?? null);
      if (res.length && lastElevationSource === "open-meteo") setMsg({ kind: "warn", text: "Altitudes IGN indisponibles : les dénivelés sont mesurés avec le modèle mondial Open-Meteo (90 m), moins précis ; ils seront recalculés avec l'IGN à l'ouverture dans l'éditeur." });
      if (!res.length) setMsg({ kind: "warn", text: "Aucune boucle trouvée depuis ce départ : essayez un autre point, une distance plus courte, ou une autre pratique." });
      else {
        if (!anyGain && !res.some((p) => p.gainOk)) setMsg({ kind: "warn", text: `Aucune boucle de ${km} km ne respecte ${gain} m de D+ (±20 %) depuis ce départ : le relief accessible ne le permet pas. Les propositions les plus proches sont affichées avec leur D+ réel.` });
        const b = bboxOf(res.flatMap((p) => p.line)); map.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 15 });
      }
    } catch (e) { if ((e as Error).name !== "AbortError") setMsg({ kind: "err", text: explain(e) }); }
    finally { setBusy(false); setProgress(null); }
  }

  const toRoute = (p: Proposal): SavedRoute => {
    const st = fromTrack(p.coords, []); const now = Date.now(); const sport = PRACTICES.find((x) => x.id === practice)!.sport;
    return { id: uid(), name: `Boucle ${Math.round(p.distanceM / 1000)} km · ${Math.round(p.gainM)} m D+ (générée)`, description: `Générée automatiquement (cible ${km} km${anyGain ? "" : `, ${gain} m D+`}).`, sport, segs: st.segs, waypoints: st.waypoints, coords: p.coords, pois: [], terrain: [], visibility: "prive", region: "", country: "", layer: "mine", source: "creation", createdAt: now, updatedAt: now };
  };
  const saveIt = (p: Proposal, open: boolean) => { const r = toRoute(p); const res = routesRepo.upsert(r); if (!res.ok) { setMsg({ kind: "err", text: res.error ?? "Enregistrement impossible." }); return; } if (open) location.assign(withBase(editorHref(r.id))); else setMsg({ kind: "ok", text: "Parcours enregistré dans « Mes parcours »." }); };

  const idx = (p: Proposal) => props.findIndex((x) => x.id === p.id);
  const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
  const banner = <StatBanner title={selected ? `Proposition ${idx(selected) + 1}` : "Générateur de parcours"} items={selected ? [{ label: "Distance", value: fmtKm(selected.distanceM) }, { label: "D+", value: fmtM(selected.gainM) }, { label: "D−", value: fmtM(selected.lossM) }] : [{ label: "Cible", value: `${km} km` }, { label: "D+ cible", value: anyGain ? "indifférent" : fmtM(gain) }]} />;

  return (
    <div className="grid min-h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-4rem)] lg:grid-cols-[25rem_1fr]">
      <aside className="order-2 min-h-0 overflow-y-auto border-ink-100 bg-white p-4 lg:order-1 lg:border-r">
        <h1 className="flex items-center gap-2 text-xl font-extrabold"><Sparkles className="size-5 text-ember-500" />Générer des parcours</h1>
        <p className="mt-1 text-sm text-ink-500">Indiquez un départ, une distance et un dénivelé : plusieurs boucles vous sont proposées, en privilégiant chemins et sentiers.</p>

        <section className="mt-4 grid gap-2" aria-label="Point de départ">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">1 · Départ</h2>
          <form onSubmit={search} role="search" className="flex gap-2">
            <label className="relative min-w-0 flex-1"><span className="sr-only">Adresse ou lieu</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Adresse, village, parking…" className={clsx(inp, "pl-9")} /></label>
            <Button type="submit" variant="brand" size="sm" className="h-10" aria-label="Chercher"><Search className="size-4" /></Button>
            <Button type="button" variant="secondary" size="sm" className="h-10" onClick={locate} aria-label="Ma position"><LocateFixed className="size-4" /></Button>
          </form>
          <p className="text-xs text-ink-500">{start ? `Départ : ${start[1].toFixed(4)}, ${start[0].toFixed(4)} (glissez le marqueur pour l'ajuster)` : "Ou cliquez sur la carte."}</p>
        </section>

        <section className="mt-4 grid gap-3" aria-label="Critères">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">2 · Critères</h2>
          <div role="group" aria-label="Pratique" className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 sm:grid-cols-4">{PRACTICES.map((x) => <button key={x.id} type="button" aria-pressed={practice === x.id} onClick={() => { setPractice(x.id); setKm(x.defKm); setGain(x.defGain); setProps([]); setSel(null); }} className={clsx("rounded-lg px-1 py-2 text-[13px] font-semibold leading-tight", practice === x.id ? "bg-white shadow" : "text-ink-600")}>{x.label}</button>)}</div>
          <p className="-mt-1 text-xs text-ink-500">Le moteur privilégie les <b>{PROFILE_HINT[profileForSport(prac.sport)]}</b>.</p>
          <label className="grid gap-1 text-sm font-medium"><span className="flex justify-between"><span className="flex items-center gap-1.5"><RouteIcon className="size-4" />Distance</span><b className="font-display">{km} km</b></span>
            <input type="range" min={prac.id === "velo" ? 10 : 3} max={prac.maxKm} step={prac.stepKm} value={km} onChange={(e) => setKm(+e.target.value)} className="h-8 w-full accent-[var(--color-pine-600)]" aria-label="Distance cible en kilomètres" /></label>
          <label className="grid gap-1 text-sm font-medium"><span className="flex justify-between"><span className="flex items-center gap-1.5"><Mountain className="size-4" />Dénivelé positif</span><b className="font-display">{anyGain ? "indifférent" : `${gain} m`}</b></span>
            <input type="range" min={0} max={prac.maxGain} step={50} value={gain} disabled={anyGain} onChange={(e) => setGain(+e.target.value)} className="h-8 w-full accent-[var(--color-pine-600)] disabled:opacity-40" aria-label="Dénivelé positif cible en mètres" aria-describedby="gain-note" /></label>
          <p id="gain-note" className="-mt-1 text-xs text-ink-500">Le dénivelé indiqué est une estimation. Une marge d'erreur de ±20 % peut être appliquée afin de trouver un parcours adapté au terrain. Pour mieux atteindre le D+ demandé, la distance peut dépasser la cible de 10 % au plus.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={anyGain} onChange={(e) => setAnyGain(e.target.checked)} className="accent-[var(--color-pine-600)]" />Dénivelé indifférent</label>
          {busy ? <Button variant="secondary" size="lg" onClick={() => ctrl.current?.abort()}><Square className="size-4" />Arrêter</Button> : <Button size="lg" onClick={run}><Sparkles className="size-5" />Générer 4 propositions</Button>}
          {busy && progress && <div role="status" aria-live="polite"><div className="flex justify-between text-xs text-ink-500"><span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" />{PHASE[progress.phase]}…</span><span>{progress.done}/{progress.total}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-pine-500 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div></div>}
          {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={clsx("rounded-lg px-3 py-2 text-sm", msg.kind === "err" ? "bg-danger/10 text-danger" : msg.kind === "warn" ? "bg-warn/10 text-ink-700" : "bg-pine-50 text-pine-700")}>{msg.text}</p>}
        </section>

        {props.length > 0 && (
          <section className="mt-5 grid gap-2" aria-label="Propositions">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">3 · Propositions</h2>
            <ul className="grid gap-2">{props.map((p, i) => {
              const dk = p.distanceM / 1000 - km, dg = p.gainM - gain; const on = p.id === sel;
              return (
                <li key={p.id}><button type="button" aria-pressed={on} onClick={() => setSel(p.id)} className={clsx("w-full rounded-xl border p-3 text-left transition", on ? "border-ink-300 bg-ink-50" : "border-ink-100 hover:border-ink-200")} style={on ? { borderLeft: `4px solid ${COLORS[i % COLORS.length]}` } : undefined}>
                  <span className="flex items-center gap-2 font-semibold"><span className="size-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />Proposition {i + 1}</span>
                  <span className="mt-1 grid grid-cols-3 gap-2 text-sm"><span><b className="font-display">{fmtKm(p.distanceM)}</b><br /><small className="text-ink-400">{dk >= 0 ? "+" : ""}{dk.toFixed(1).replace(".", ",")} km</small></span>
                    <span><b className="font-display">{fmtM(p.gainM)}</b> D+<br /><small className="text-ink-400">{anyGain ? "" : `${dg >= 0 ? "+" : ""}${Math.round(dg)} m`}</small></span>
                    {practice === "velo" ? <span><b className="font-display">{p.pavedPct != null ? `${p.pavedPct} %` : "—"}</b><br /><small className="text-ink-400">revêtu</small></span> : <span><b className="font-display">{p.offRoadPct != null ? `${p.offRoadPct} %` : "—"}</b><br /><small className="text-ink-400">chemins</small></span>}</span>
                  {p.stretched && <span className="mt-1 flex items-center gap-1 text-xs text-ink-500"><Check className="size-3.5" />Distance allongée (dans la limite de +10 %) pour se rapprocher du D+ demandé</span>}
                  {p.coarse && <span className="mt-1 flex items-center gap-1 text-xs text-warn"><TriangleAlert className="size-3.5" />D+ mesuré au pas large : il sera précisé à l'ouverture dans l'éditeur</span>}
                  {p.gainOk != null && <span className={clsx("mt-1 flex items-center gap-1 text-xs", p.gainOk ? "text-pine-700" : "text-warn")}>{p.gainOk ? <><Check className="size-3.5" />D+ mesuré dans la marge de ±20 % ({Math.round(gain * 0.8)}–{Math.round(gain * 1.2)} m)</> : <><TriangleAlert className="size-3.5" />D+ hors de la marge de ±20 %</>}</span>}
                  {p.cleanedM >= 50 && <span className="mt-1 flex items-center gap-1 text-xs text-ink-500"><Check className="size-3.5" />{fmtKm(p.cleanedM)} d'allers-retours parasites retirés</span>}
                  {p.overlapPct >= 15 && <span className="mt-1 flex items-center gap-1 text-xs text-warn"><TriangleAlert className="size-3.5" />{p.overlapPct} % en aller-retour</span>}
                </button></li>);
            })}</ul>
            {selected && <div className="grid gap-2">
              <ElevationChart points={profile} onHover={setHover} height={150} />
              <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => saveIt(selected, true)}><Pencil className="size-4" />Modifier dans l'éditeur</Button><Button size="sm" variant="secondary" onClick={() => saveIt(selected, false)}><Save className="size-4" />Enregistrer</Button>
                <Button size="sm" variant="secondary" onClick={() => download(`${safeName("boucle-generee")}.gpx`, serialize("gpx", { name: toRoute(selected).name, coords: selected.coords, pois: [] }), FORMATS.gpx.mime)}><Download className="size-4" />GPX</Button></div>
            </div>}
            <p className="text-xs text-ink-500">La part d'aller-retour dépend du réseau de chemins du secteur (forte en vallée ou en montagne, plus faible en forêt) : essayez un autre départ pour d'autres boucles. Calcul sur les données OpenStreetMap ; la distance et le dénivelé sont mesurés, mais aucun résultat n'est garanti : vérifiez toujours le tracé (praticabilité, accès) avant de partir.</p>
          </section>
        )}
      </aside>
      <MapFrame className="order-1 h-[52vh] min-h-[20rem] lg:order-2 lg:h-auto" banner={banner}>
        <div className="absolute inset-0"><div ref={el} className="size-full" role="application" aria-label="Carte : cliquez pour choisir le départ" /></div>
        <LayerControl map={map} ready={ready} />
        {!start && ready && <p className="pointer-events-none absolute left-3 top-3 max-w-[16rem] rounded-lg bg-white/95 px-3 py-2 text-sm shadow">Cliquez sur la carte pour choisir le départ.</p>}
      </MapFrame>
    </div>
  );
}
