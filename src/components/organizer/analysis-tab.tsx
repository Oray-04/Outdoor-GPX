"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { Loader2, Square, Download, FileDown, Copy, ShieldAlert, Trees, Footprints, Landmark, Search, Layers, Building2, ExternalLink, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { MapFrame, StatBanner } from "@/components/map/map-frame";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { routesRepo } from "@/lib/repo";
import { analyzeRoute, GROUP_LABEL, ZONE_KINDS, ZONE_STATUS, type Analysis, sliceByDistance, type Portion, type Ring, type ZoneStatus } from "@/lib/analysis";
import { loadAnalysis, saveAnalysis, toStored, routeSig, synthesize, routeCsv, synthesisCsv, crossedParcels, touchedParcels, communesOf, zoneStatus, type StoredAnalysis, type StoredZone } from "@/lib/cadastre";
import { download, safeName } from "@/lib/formats";
import { bboxOf, fmtKm, cumulative } from "@/lib/geo";
import type { EventModel } from "@/lib/events";
import type { LL, SavedRoute } from "@/lib/types";

const COLOR = { prive: "#d4202a", ok: "#1e7a58", inconnu: "#f0612b" } as const;
const ROUTE_COLORS = ["#f0612b", "#1f6feb", "#8a3ffc", "#0f9d58", "#c2185b", "#b7791f"];
const portionColor = (p: Portion) => (!p.matched || p.prive === null ? COLOR.inconnu : p.prive ? COLOR.prive : COLOR.ok);
const km = (m: number, d = 2) => (m / 1000).toFixed(d).replace(".", ",");

/** Contours des parcelles et zones de la dernière analyse de chaque parcours (session) : trop lourds pour le stockage. */
const GEOM = new Map<string, { sig: string; parcels: Map<string, Ring>; zones: Map<string, Ring> }>();

function coloredSegments(coords: LL[], portions: Portion[]) {
  const cum = cumulative(coords); const out: { color: string; gr: boolean; line: LL[] }[] = [];
  for (const p of portions) { const line = sliceByDistance(coords, cum, p.fromM, p.toM); if (line.length >= 2) out.push({ color: portionColor(p), gr: p.gr, line }); }
  return out;
}
const coordsOf = (r: SavedRoute | undefined): LL[] => (r ? r.coords.map((c) => [c[0], c[1]] as LL) : []);

interface Entry { routeId: string; label: string; route: SavedRoute; color: string }
type Busy = { routeId: string; label: string; n: number; of: number; s: string; d: number; t: number };

export function AnalysisTab({ ev }: { ev: EventModel }) {
  const routes = routesRepo.useAll();
  // un parcours = un tracé ; deux courses sur le même tracé sont regroupées (jamais analysé ni compté deux fois)
  const entries: Entry[] = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const r of ev.races) { const route = routes.find((x) => x.id === r.routeId); if (!route) continue; const e = m.get(route.id); if (e) e.label += ` + ${r.label}`; else m.set(route.id, { routeId: route.id, label: r.label, route, color: ROUTE_COLORS[m.size % ROUTE_COLORS.length] }); }
    return [...m.values()];
  }, [ev.races, routes]);
  const others = routes.filter((r) => !entries.some((e) => e.routeId === r.id));
  const [rev, setRev] = useState(0); // relecture des analyses enregistrées
  const stored = useMemo(() => { void rev; const m = new Map<string, StoredAnalysis>(); for (const r of routes) { const a = loadAnalysis(r.id); if (a) m.set(r.id, a); } return m; }, [routes, rev]);
  const [view, setView] = useState<string>(entries[0]?.routeId ?? "synthese");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const stateOf = (r: SavedRoute) => { const a = stored.get(r.id); return !a ? "none" : a.sig === routeSig(r.coords) ? "ok" : "stale"; };
  const labelOf = (routeId: string) => entries.find((e) => e.routeId === routeId)?.label ?? routes.find((r) => r.id === routeId)?.name ?? "Parcours";

  async function analyse(list: { routeId: string; label: string }[]) {
    ctrl.current?.abort(); const c = new AbortController(); ctrl.current = c; setErr(null); setNote(null);
    const failed: string[] = []; let saved = true;
    try {
      for (let i = 0; i < list.length; i++) {
        const { routeId, label } = list[i], route = routes.find((r) => r.id === routeId); if (!route) continue;
        setBusy({ routeId, label, n: i + 1, of: list.length, s: "Préparation", d: 0, t: 1 });
        try {
          const coords = coordsOf(route), sig = routeSig(route.coords);
          const a: Analysis = await analyzeRoute(coords, { signal: c.signal, onStep: (s, d, t) => setBusy({ routeId, label, n: i + 1, of: list.length, s, d, t }) });
          GEOM.set(routeId, { sig, parcels: new Map(a.parcels.map((p) => [p.id, p.geometry])), zones: new Map(a.zones.map((z) => [z.id, z.geometry])) });
          saved = saveAnalysis(toStored(routeId, route.name, sig, a)) && saved; setRev((x) => x + 1);
        } catch (e) { if ((e as Error).name === "AbortError") throw e; failed.push(`${label} : ${((e as Error).message || "analyse impossible").replace(/\.$/, "")}`); }
      }
      if (failed.length) setErr(`Analyse incomplète — ${failed.join(" ; ")}. Relancez ce(s) parcours dans un instant.`);
      if (!saved) setNote("Stockage du navigateur plein : les résultats restent affichés pendant cette session, exportez-les maintenant.");
    } catch { /* arrêt demandé */ } finally { setBusy(null); }
  }
  const runOne = (routeId: string) => { setView(routeId); analyse([{ routeId, label: labelOf(routeId) }]); };
  const runAll = () => { setView("synthese"); analyse(entries.map((e) => ({ routeId: e.routeId, label: e.label }))); };

  const synth = useMemo(() => synthesize(entries.map((e) => ({ routeId: e.routeId, label: e.label, a: stored.get(e.routeId) ?? null }))), [entries, stored]);
  const exportRoute = async (routeId: string, kind: "csv" | "pdf") => {
    const a = stored.get(routeId); if (!a) return; const label = labelOf(routeId);
    if (kind === "csv") download(`${safeName(ev.name)}-${safeName(label)}-parcelles.csv`, routeCsv(a), "text/csv;charset=utf-8");
    else { const { routeCadastrePdf } = await import("@/lib/cadastre-pdf"); download(`${safeName(ev.name)}-${safeName(label)}-analyse-cadastrale.pdf`, await routeCadastrePdf(ev.name, label, a), "application/pdf"); }
  };
  const exportSynth = async (kind: "csv" | "pdf") => {
    if (!synth.routes.length) return;
    if (kind === "csv") download(`${safeName(ev.name)}-synthese-parcelles.csv`, synthesisCsv(synth), "text/csv;charset=utf-8");
    else { const { synthesisPdf } = await import("@/lib/cadastre-pdf"); download(`${safeName(ev.name)}-synthese-cadastrale.pdf`, await synthesisPdf(ev.name, synth), "application/pdf"); }
  };

  if (!routes.length) return <p className="rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Aucun parcours enregistré : créez ou importez un tracé, puis revenez l&apos;analyser.</p>;
  const isOther = view !== "synthese" && !entries.some((e) => e.routeId === view);
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" data-cadastre>
      <div role="note" className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-ink-800">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
        <p><b>Aide à la préparation, pas une validation.</b> Aucun droit de passage n&apos;est confirmé et le cadastre <b>ne donne pas l&apos;identité des propriétaires</b> (à demander au service de la publicité foncière ou en mairie avec les références). Un zonage environnemental <b>n&apos;est pas une interdiction de passage</b> : il signale une réglementation à lire, une démarche possible ou une simple vigilance ; seuls les textes officiels font foi.</p>
      </div>

      {/* Parcours de l'événement : analyse individuelle ou globale */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-ink-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h4 className="font-semibold">Parcours de l&apos;événement</h4><p className="text-xs text-ink-500">Parcelles cadastrales, Natura 2000, parcs, réserves, arrêtés de protection, ZNIEFF et forêts publiques — sources officielles IGN et INPN.</p></div>
          <div className="flex flex-wrap gap-2">
            {busy ? <Button variant="secondary" onClick={() => ctrl.current?.abort()}><Square className="size-4" />Arrêter</Button>
              : <Button variant="brand" onClick={runAll} disabled={!entries.length} data-action="cadastre-tous"><Layers className="size-4" />Analyser tous les parcours</Button>}
          </div>
        </div>
        {!entries.length && <p className="mt-3 text-sm text-ink-500">Aucune course n&apos;est encore liée à un parcours : liez-les dans « Votre trail », ou analysez un de vos parcours ci-dessous.</p>}
        <ul className="mt-3 grid gap-2">
          {entries.map((e) => {
            const st = stateOf(e.route), a = stored.get(e.routeId), running = busy?.routeId === e.routeId;
            return (
              <li key={e.routeId} data-cadastre-route={e.label} className={clsx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 ring-1", view === e.routeId ? "bg-pine-50 ring-pine-300" : "ring-ink-100")}>
                <i className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: e.color }} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setView(e.routeId)}>
                  <p className="font-semibold">{e.label} <span className="font-normal text-ink-500">· {e.route.name} · {fmtKm(cumulative(e.route.coords).at(-1) ?? 0)}</span></p>
                  <p className="text-xs text-ink-500" data-cadastre-state={st}>{running ? <span className="inline-flex items-center gap-1 text-pine-700"><Loader2 className="size-3 animate-spin" />Analyse en cours…</span> : st === "none" ? "Pas encore analysé" : <>{st === "stale" && <b className="text-ember-600">Parcours modifié depuis l&apos;analyse : à relancer · </b>}{crossedParcels(a!).length} parcelles · {communesOf(a!).length} commune(s) · {a!.zones.length} zonage(s) · le {new Date(a!.at).toLocaleDateString("fr-FR")}</>}</p>
                </button>
                <div className="flex basis-full flex-wrap gap-1.5 pl-4.5 sm:basis-auto sm:pl-0">
                  <Button size="sm" variant={st === "ok" ? "secondary" : "brand"} disabled={!!busy} onClick={() => runOne(e.routeId)} data-action="cadastre-un">{st === "none" ? <Search className="size-4" /> : <RefreshCw className="size-4" />}{st === "none" ? "Analyser" : "Relancer"}</Button>
                  {a && <><Button size="sm" variant="secondary" onClick={() => exportRoute(e.routeId, "csv")} data-action="cadastre-csv"><Download className="size-4" />CSV</Button><Button size="sm" variant="secondary" onClick={() => exportRoute(e.routeId, "pdf")} data-action="cadastre-pdf"><FileDown className="size-4" />PDF</Button></>}
                </div>
              </li>
            );
          })}
        </ul>
        {entries.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <button type="button" onClick={() => setView("synthese")} className={clsx("rounded-full px-3 py-1.5 text-sm font-semibold", view === "synthese" ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700")} data-action="cadastre-voir-synthese">Synthèse de l&apos;événement</button>
          <span className="text-xs text-ink-500">{synth.routes.length}/{entries.length} parcours analysé(s){synth.routes.length ? ` · ${synth.totals.parcels} parcelles uniques, dont ${synth.totals.shared} communes à plusieurs parcours` : ""}</span>
          <span className="hidden flex-1 sm:block" />
          <span className="basis-full text-[11px] text-ink-400 sm:order-last">Synthèse PDF : parcelles uniques, communes et zonages de l&apos;événement, puis le détail de chaque parcours en annexe.</span>
          <Button size="sm" variant="secondary" disabled={!synth.routes.length} onClick={() => exportSynth("csv")} data-action="synthese-csv"><Download className="size-4" />Synthèse CSV</Button>
          <Button size="sm" variant="secondary" disabled={!synth.routes.length} onClick={() => exportSynth("pdf")} data-action="synthese-pdf"><FileDown className="size-4" />Synthèse PDF</Button>
        </div>}
        {others.length > 0 && <label className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3 text-sm text-ink-600">Autre de mes parcours (hors événement) :
          <select className="h-9 min-w-[12rem] rounded-lg border border-ink-200 bg-white px-2 text-sm" value={isOther ? view : ""} onChange={(e) => e.target.value && setView(e.target.value)}><option value="">Choisir…</option>{others.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          {isOther && <Button size="sm" variant={stored.get(view) ? "secondary" : "brand"} disabled={!!busy} onClick={() => runOne(view)}><Search className="size-4" />{stored.get(view) ? "Relancer" : "Analyser"}</Button>}
          {isOther && stored.get(view) && <><Button size="sm" variant="secondary" onClick={() => exportRoute(view, "csv")}><Download className="size-4" />CSV</Button><Button size="sm" variant="secondary" onClick={() => exportRoute(view, "pdf")}><FileDown className="size-4" />PDF</Button></>}
        </label>}
      </section>

      {busy && <div role="status" aria-live="polite" data-cadastre-progress><div className="flex justify-between gap-3 text-sm text-ink-600"><span className="inline-flex min-w-0 items-center gap-2"><Loader2 className="size-4 shrink-0 animate-spin" /><span className="truncate">{busy.of > 1 ? `Parcours ${busy.n}/${busy.of} · ` : ""}{busy.label} — {busy.s}…</span></span><span>{busy.d}/{busy.t}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-pine-500 transition-all" style={{ width: `${(((busy.n - 1) + busy.d / Math.max(1, busy.t)) / busy.of) * 100}%` }} /></div></div>}
      {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      {note && <p role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-ink-700">{note}</p>}

      {view === "synthese" ? <SynthesisView entries={entries} synth={synth} /> : <RouteView key={view} route={routes.find((r) => r.id === view)} label={labelOf(view)} a={stored.get(view) ?? null} stale={!!routes.find((r) => r.id === view) && stateOf(routes.find((r) => r.id === view)!) === "stale"} />}
    </div>
  );
}

// ── Carte commune aux deux vues ──
function useAnalysisMap() {
  const { el, map, ml, ready } = useMap();
  useEffect(() => {
    const m = map.current; if (!m || !ready || m.getSource("z")) return;
    for (const id of ["z", "p", "r", "g"]) m.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "z-fill", type: "fill", source: "z", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 } });
    m.addLayer({ id: "z-line", type: "line", source: "z", paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [3, 2] } });
    m.addLayer({ id: "p-fill", type: "fill", source: "p", paint: { "fill-color": ["case", ["get", "shared"], "#8a3ffc", "#f0612b"], "fill-opacity": ["case", ["get", "shared"], 0.22, 0.12] } });
    m.addLayer({ id: "p-line", type: "line", source: "p", paint: { "line-color": ["case", ["get", "shared"], "#6b21a8", "#c2410c"], "line-width": 1.2 } });
    m.addLayer({ id: "g-line", type: "line", source: "g", layout: { "line-cap": "round" }, paint: { "line-color": "#7a4bd1", "line-width": 11, "line-opacity": 0.45 } });
    m.addLayer({ id: "r-casing", type: "line", source: "r", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 8 } });
    m.addLayer({ id: "r-line", type: "line", source: "r", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5 } });
    m.on("click", "p-fill", (e) => { const f = e.features?.[0]; if (!f || !ml.current) return; const box = document.createElement("div"); const b = document.createElement("b"); b.textContent = String(f.properties?.ref); const s = document.createElement("div"); s.textContent = String(f.properties?.info ?? ""); box.append(b, s); new ml.current.Popup({ closeButton: false }).setLngLat(e.lngLat).setDOMContent(box).addTo(m); });
    m.on("mouseenter", "p-fill", () => (m.getCanvas().style.cursor = "pointer")); m.on("mouseleave", "p-fill", () => (m.getCanvas().style.cursor = ""));
  }, [ready, map, ml]);
  const set = useCallback((id: string, features: object[]) => { const m = map.current; if (!m || !ready || !m.getSource(id)) return; (m.getSource(id) as GeoJSONSource).setData({ type: "FeatureCollection", features } as never); }, [map, ready]);
  return { el, map, ready, set };
}
const zoneColor = (z: StoredZone) => ZONE_STATUS[zoneStatus(z)].color;

function RouteView({ route, label, a, stale }: { route: SavedRoute | undefined; label: string; a: StoredAnalysis | null; stale: boolean }) {
  const { el, map, ready, set } = useAnalysisMap();
  const [tab, setTab] = useState<"parcelles" | "communes" | "zones" | "chemins">("parcelles");
  const [q, setQ] = useState(""); const [msg, setMsg] = useState<string | null>(null);
  const coords = useMemo(() => coordsOf(route), [route]);
  const geom = route ? GEOM.get(route.id) : undefined, hasGeom = !!geom && !!a && geom.sig === a.sig;
  useEffect(() => {
    if (!ready) return;
    const segs = a?.portions?.length && !stale ? coloredSegments(coords, a.portions) : [];
    set("r", segs.length ? segs.map((s) => ({ type: "Feature", properties: { color: s.color }, geometry: { type: "LineString", coordinates: s.line } })) : coords.length > 1 ? [{ type: "Feature", properties: { color: "#f0612b" }, geometry: { type: "LineString", coordinates: coords } }] : []);
    set("g", segs.filter((s) => s.gr).map((s) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: s.line } })));
    set("p", hasGeom ? a!.parcels.filter((p) => geom!.parcels.has(p.id)).map((p) => ({ type: "Feature", properties: { ref: p.ref, info: `${p.commune} · ${km(p.lengthM, 3)} km sur la parcelle`, shared: false }, geometry: geom!.parcels.get(p.id) })) : []);
    set("z", hasGeom ? a!.zones.filter((z) => geom!.zones.has(z.id)).map((z) => ({ type: "Feature", properties: { color: zoneColor(z) }, geometry: geom!.zones.get(z.id) })) : []);
    const m = map.current; if (m && coords.length > 1) { const b = bboxOf(coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 16, duration: 0 }); }
  }, [a, coords, ready, set, map, hasGeom, geom, stale]);
  const crossed = useMemo(() => (a ? crossedParcels(a) : []), [a]);
  const shown = crossed.filter((p) => !q.trim() || `${p.commune} ${p.ref} ${p.insee}`.toLowerCase().includes(q.trim().toLowerCase()));
  const comm = a ? communesOf(a) : [], touched = a ? touchedParcels(a) : [];
  const copyRefs = async () => { try { await navigator.clipboard.writeText(crossed.map((p) => `${p.commune} — ${p.ref}`).join("\n")); setMsg("Références copiées."); } catch { setMsg("Copie impossible : utilisez l'export CSV."); } };
  const s = a?.summary;
  const banner = <StatBanner title={`${label}${route ? ` · ${route.name}` : ""}`} items={a ? [{ label: "Parcelles", value: String(crossed.length) }, { label: "Communes", value: String(comm.length) }, { label: "Hors parcelles", value: `${km(a.nonCadastralM, 1)} km` }, { label: "Zonages", value: String(a.zones.length) }] : [{ label: "Distance", value: fmtKm(coords.length > 1 ? cumulative(coords).at(-1)! : 0) }]} />;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_30rem]" data-cadastre-view="parcours">
      <MapFrame className="h-[26rem] overflow-hidden rounded-2xl ring-1 ring-ink-100 lg:h-[36rem]" banner={banner}>
        <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte de l'analyse" /></div>
        <LayerControl map={map} ready={ready} />
        {a && <ul className="absolute bottom-9 left-2 z-10 rounded-lg bg-white/95 p-2 text-[11px] shadow" aria-label="Légende">
          {([["Privé selon la source", COLOR.prive], ["Non signalé privé", COLOR.ok], ["À vérifier / hors réseau", COLOR.inconnu]] as const).map(([l, c]) => <li key={l} className="flex items-center gap-1.5"><i className="inline-block h-1 w-4 rounded" style={{ background: c }} />{l}</li>)}
          <li className="flex items-center gap-1.5"><i className="inline-block size-3 border border-orange-700 bg-orange-100" />Parcelle traversée</li>
          {(["reglementaire", "procedure", "vigilance"] as ZoneStatus[]).map((k) => <li key={k} className="flex items-center gap-1.5"><i className="inline-block size-3 border border-dashed" style={{ borderColor: ZONE_STATUS[k].color, background: `${ZONE_STATUS[k].color}22` }} />{ZONE_STATUS[k].short}</li>)}</ul>}
        {a && !hasGeom && <p className="absolute left-2 top-2 z-10 max-w-[16rem] rounded-lg bg-white/95 px-2 py-1.5 text-[11px] text-ink-600 shadow">Contours des parcelles et zones : relancez l&apos;analyse pour les afficher (les tableaux et exports sont à jour).</p>}
      </MapFrame>

      <div className="min-w-0 rounded-2xl bg-white ring-1 ring-ink-100">
        <div className="flex overflow-x-auto border-b border-ink-100 text-sm font-semibold" role="tablist">
          {([["parcelles", "Parcelles", Landmark, crossed.length], ["communes", "Communes", Building2, comm.length], ["zones", "Zonages", Trees, a?.zones.length ?? 0], ["chemins", "Chemins", Footprints, s?.itineraires.length ?? 0]] as const).map(([k, l, I, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("flex flex-1 items-center justify-center gap-1 whitespace-nowrap px-2 py-3", tab === k ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}><I className="hidden size-4 sm:block" />{l}{a && <Badge tone="neutral">{n}</Badge>}</button>)}
        </div>
        <div className="max-h-[32rem] overflow-y-auto p-3 text-sm">
          {!a ? <p className="p-3 text-ink-500">Lancez l&apos;analyse de ce parcours : parcelles traversées (référence, commune, distance), communes, zonages environnementaux et réglementaires, chemins.</p>
          : tab === "parcelles" ? (<>
            {stale && <p className="mb-2 rounded-lg bg-ember-100 px-2 py-1.5 text-xs text-ember-600">Le parcours a été modifié depuis cette analyse : relancez-la.</p>}
            <div className="mb-2 flex gap-2"><input aria-label="Filtrer les parcelles" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer (commune, section, numéro…)" className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 px-3" /><Button size="sm" variant="secondary" onClick={copyRefs}><Copy className="size-4" />Copier</Button></div>
            {msg && <p className="mb-2 text-xs text-pine-700">{msg}</p>}
            <p className="mb-2 text-xs text-ink-500">{shown.length} parcelle(s), dans l&apos;ordre du parcours. Sur parcelles : {km(a.routeM - a.nonCadastralM, 2)} km · hors parcelles (voirie, cours d&apos;eau non cadastrés…) : {km(a.nonCadastralM, 2)} km.</p>
            <table className="w-full text-left text-xs" data-cadastre-table="parcelles"><thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-1">Commune</th><th>Référence</th><th className="text-right">Entrée</th><th className="text-right">Sur parcelle</th></tr></thead>
              <tbody>{shown.slice(0, 400).map((p) => <tr key={p.id} className="border-b border-ink-50 align-top last:border-0"><td className="py-1 pr-1">{p.commune}{p.comAbs && <span className="text-ink-400"> (anc. {p.comAbs})</span>}</td><td><span className="font-mono">{p.ref}</span>{p.areaM2 > 0 && <span className="block text-[10px] text-ink-400">{p.areaM2.toLocaleString("fr-FR")} m²{(p.passages ?? 1) > 1 ? ` · ${p.passages} passages` : ""}</span>}{(p.zoneIds ?? []).map((id) => a.zones.find((z) => z.id === id)).filter(Boolean).map((z) => <span key={z!.id} className="mr-1 mt-0.5 inline-block rounded px-1 text-[10px] font-semibold text-white" style={{ background: zoneColor(z!) }} title={z!.name}>{ZONE_STATUS[zoneStatus(z!)].short} · {ZONE_KINDS[z!.kind]?.label.split(" — ")[0]}</span>)}</td><td className="text-right">{p.fromM != null ? `${km(p.fromM, 1)} km` : "—"}</td><td className="text-right font-semibold">{km(p.lengthM, 3)} km</td></tr>)}</tbody></table>
            {shown.length > 400 && <p className="mt-2 text-xs text-ink-500">Affichage limité à 400 lignes : le CSV et le PDF contiennent toutes les parcelles.</p>}
            {touched.length > 0 && <p className="mt-3 text-xs text-ink-500"><b>{touched.length} parcelle(s) en limite</b> (le tracé touche la limite sans la traverser) : {touched.slice(0, 12).map((p) => p.ref).join(", ")}{touched.length > 12 ? "…" : ""}</p>}
          </>) : tab === "communes" ? (
            <table className="w-full text-left text-xs"><thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-1">Commune</th><th>INSEE</th><th className="text-right">Parcelles</th><th className="text-right">Distance</th></tr></thead>
              <tbody>{comm.map((c) => <tr key={c.insee} className="border-b border-ink-50 last:border-0"><td className="py-1 font-semibold">{c.name}</td><td>{c.insee}</td><td className="text-right">{c.parcels}</td><td className="text-right">{km(c.lengthM, 2)} km</td></tr>)}</tbody></table>
          ) : tab === "zones" ? <ZoneList zones={a.zones} /> : (<div className="grid gap-4">
            <div><p className="font-semibold">Statut des chemins empruntés</p>
              <ul className="mt-1.5 grid gap-1">{([["Privé selon la source (BD TOPO)", s!.priveKm, COLOR.prive], ["Non signalé privé", s!.nonPriveKm, COLOR.ok], ["Statut inconnu ou hors réseau recensé", s!.inconnuKm, COLOR.inconnu]] as const).map(([l, v, c]) => <li key={l} className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full" style={{ background: c }} />{l}</span><b>{v.toFixed(1).replace(".", ",")} km</b></li>)}</ul>
              <p className="mt-1.5 text-xs text-ink-500">« Non signalé privé » ne veut pas dire « public » : à vérifier (chemins ruraux, servitudes, accords).</p></div>
            <div><p className="font-semibold">Nature des chemins</p><ul className="mt-1.5 grid gap-1">{s!.byNature.map((n) => <li key={n.nature} className="flex justify-between"><span>{n.nature}</span><b>{n.km.toFixed(1).replace(".", ",")} km</b></li>)}</ul></div>
            <div><p className="font-semibold">Itinéraires de randonnée balisés rencontrés</p>
              {s!.itineraires.length ? <ul className="mt-1.5 grid gap-1">{s!.itineraires.map((i) => <li key={i.name} className="flex items-center justify-between gap-2"><span>{i.name} {i.gr && <Badge tone="glacier">GR</Badge>}</span><b>{i.km.toFixed(1).replace(".", ",")} km</b></li>)}</ul> : <p className="mt-1 text-ink-500">Aucun dans les données IGN.</p>}</div>
            {a.waymarked.length > 0 && <div><p className="font-semibold">Itinéraires de longue distance dans la zone (OpenStreetMap)</p><ul className="mt-1.5 flex flex-wrap gap-1.5">{a.waymarked.map((r, i) => <li key={i}><Badge tone="neutral">{r.ref || r.name}{r.group && ` · ${GROUP_LABEL[r.group] ?? r.group}`}</Badge></li>)}</ul><p className="mt-1.5 text-xs text-ink-500">Présents dans l&apos;emprise du tracé, sans garantie qu&apos;ils le croisent.</p></div>}
          </div>)}
          {a?.warnings.map((w) => <p key={w} role="status" className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-xs text-ink-700">{w}</p>)}
        </div>
      </div>
    </div>
  );
}

function ZoneList({ zones }: { zones: (StoredZone & { byRoute?: { label: string; lengthM: number }[] })[] }) {
  if (!zones.length) return <p className="text-ink-500">Aucun espace protégé, site Natura 2000, ZNIEFF ni forêt publique recensé sur le tracé (sources consultées : INPN, BD TOPO).</p>;
  return (
    <div className="grid gap-3" data-cadastre-zones>
      {(["reglementaire", "procedure", "vigilance"] as ZoneStatus[]).map((st) => { const list = zones.filter((z) => zoneStatus(z) === st); if (!list.length) return null; return (
        <div key={st}><p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: ZONE_STATUS[st].color }}><i className="inline-block size-2.5 rounded-full" style={{ background: ZONE_STATUS[st].color }} />{ZONE_STATUS[st].label}</p>
          <ul className="grid gap-2">{list.map((z) => <li key={z.id} className="rounded-lg bg-ink-50 p-3">
            <p className="font-semibold">{z.name}</p>
            <p className="text-xs text-ink-600">{ZONE_KINDS[z.kind]?.label ?? z.nature} · {z.byRoute ? z.byRoute.map((b) => `${b.label} : ${km(b.lengthM, 2)} km`).join(" · ") : `${km(z.lengthM, 2)} km de parcours dans la zone`}</p>
            <p className="mt-1 text-xs text-ink-500">{ZONE_KINDS[z.kind]?.note}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-400">{z.manager && <span>Gestion : {z.manager}</span>}{z.source && <span>Source : {z.source}</span>}{z.url && <a href={z.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-pine-700 underline">Fiche officielle<ExternalLink className="size-3" /></a>}</p>
          </li>)}</ul></div>); })}
    </div>
  );
}

function SynthesisView({ entries, synth }: { entries: Entry[]; synth: ReturnType<typeof synthesize> }) {
  const { el, map, ready, set } = useAnalysisMap();
  const [tab, setTab] = useState<"parcelles" | "communes" | "zones">("parcelles");
  const [only, setOnly] = useState(false); const [q, setQ] = useState("");
  useEffect(() => {
    if (!ready) return;
    set("r", entries.filter((e) => e.route.coords.length > 1).map((e) => ({ type: "Feature", properties: { color: e.color }, geometry: { type: "LineString", coordinates: coordsOf(e.route) } })));
    set("g", []);
    const geoms = new Map<string, Ring>(), zg = new Map<string, Ring>();
    for (const r of synth.routes) { const g = GEOM.get(r.routeId); if (g && g.sig === r.a.sig) { g.parcels.forEach((v, k) => geoms.set(k, v)); g.zones.forEach((v, k) => zg.set(k, v)); } }
    set("p", synth.parcels.filter((p) => geoms.has(p.id)).map((p) => ({ type: "Feature", properties: { ref: p.ref, info: `${p.commune} · ${p.byRoute.map((b) => `${b.label} ${km(b.lengthM, 3)} km`).join(" · ")}`, shared: p.byRoute.length > 1 }, geometry: geoms.get(p.id) })));
    set("z", synth.zones.filter((z) => zg.has(z.id)).map((z) => ({ type: "Feature", properties: { color: zoneColor(z) }, geometry: zg.get(z.id) })));
    const all = entries.flatMap((e) => coordsOf(e.route)); const m = map.current;
    if (m && all.length > 1) { const b = bboxOf(all); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 16, duration: 0 }); }
  }, [entries, synth, ready, set, map]);
  const parcels = synth.parcels.filter((p) => (!only || p.byRoute.length > 1) && (!q.trim() || `${p.commune} ${p.ref}`.toLowerCase().includes(q.trim().toLowerCase())));
  const t = synth.totals;
  const banner = <StatBanner title="Synthèse de l'événement" items={[{ label: "Parcelles uniques", value: String(t.parcels) }, { label: "Parcelles communes", value: String(t.shared) }, { label: "Communes", value: String(t.communes) }, { label: "Distance cumulée", value: `${km(t.cumulM, 1)} km` }]} />;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_32rem]" data-cadastre-view="synthese">
      <MapFrame className="h-[26rem] overflow-hidden rounded-2xl ring-1 ring-ink-100 lg:h-[36rem]" banner={banner}>
        <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte de la synthèse" /></div>
        <LayerControl map={map} ready={ready} />
        <ul className="absolute bottom-9 left-2 z-10 rounded-lg bg-white/95 p-2 text-[11px] shadow" aria-label="Légende">
          {entries.map((e) => <li key={e.routeId} className="flex items-center gap-1.5"><i className="inline-block h-1 w-4 rounded" style={{ background: e.color }} />{e.label}</li>)}
          <li className="flex items-center gap-1.5"><i className="inline-block size-3 border border-purple-800 bg-purple-200" />Parcelle commune à plusieurs parcours</li></ul>
      </MapFrame>
      <div className="min-w-0 rounded-2xl bg-white ring-1 ring-ink-100">
        {!synth.routes.length ? <p className="p-4 text-sm text-ink-500">Analysez les parcours (un par un ou « Analyser tous les parcours ») : la synthèse regroupe alors toutes les parcelles traversées, chacune une seule fois, avec les parcours concernés.</p> : <>
          {synth.missing.length > 0 && <p className="m-3 mb-0 rounded-lg bg-ember-100 px-3 py-2 text-xs text-ember-600" data-cadastre-missing>Pas encore analysé(s), absent(s) de la synthèse : {synth.missing.map((m) => m.label).join(", ")}.</p>}
          <div className="flex border-b border-ink-100 text-sm font-semibold" role="tablist">
            {([["parcelles", "Parcelles", Landmark, t.parcels], ["communes", "Communes", Building2, t.communes], ["zones", "Zonages", Trees, synth.zones.length]] as const).map(([k, l, I, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("flex flex-1 items-center justify-center gap-1.5 py-3", tab === k ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}><I className="hidden size-4 sm:block" />{l}<Badge tone="neutral">{n}</Badge></button>)}
          </div>
          <div className="max-h-[32rem] overflow-y-auto p-3 text-sm">
            {tab === "parcelles" ? (<>
              <div className="mb-2 flex flex-wrap items-center gap-2"><input aria-label="Filtrer les parcelles" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer (commune, référence…)" className="h-9 min-w-[10rem] flex-1 rounded-lg border border-ink-200 px-3" /><label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} data-action="seulement-communes" />Seulement les parcelles communes</label></div>
              <p className="mb-2 text-xs text-ink-500">Chaque parcelle n&apos;apparaît qu&apos;une fois. Distance cumulée = somme des distances parcourues sur la parcelle par chaque parcours.</p>
              <table className="w-full text-left text-xs" data-cadastre-table="synthese"><thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-1">Commune · référence</th><th>Parcours concernés</th><th className="text-right">Cumul</th></tr></thead>
                <tbody>{parcels.slice(0, 400).map((p) => <tr key={p.id} data-shared={p.byRoute.length > 1 || undefined} className={clsx("border-b border-ink-50 align-top last:border-0", p.byRoute.length > 1 && "bg-purple-50")}><td className="py-1 pr-1">{p.commune}<span className="block font-mono">{p.ref}</span></td><td>{p.byRoute.map((b) => <span key={b.routeId} className="mb-0.5 mr-1 inline-flex items-center gap-1 rounded-full bg-white px-1.5 ring-1 ring-ink-100"><i className="size-1.5 rounded-full" style={{ background: entries.find((e) => e.routeId === b.routeId)?.color }} />{b.label} · {km(b.lengthM, 3)}</span>)}</td><td className="text-right font-semibold">{km(p.totalM, 3)} km</td></tr>)}</tbody></table>
              {parcels.length > 400 && <p className="mt-2 text-xs text-ink-500">Affichage limité à 400 lignes : la synthèse CSV et PDF contient toutes les parcelles.</p>}
            </>) : tab === "communes" ? (
              <table className="w-full text-left text-xs"><thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-1">Commune</th><th className="text-right">Parcelles</th><th className="text-right">dont communes</th><th className="text-right">Cumul</th><th className="pl-2">Parcours</th></tr></thead>
                <tbody>{synth.communes.map((c) => <tr key={c.insee} className="border-b border-ink-50 last:border-0"><td className="py-1 font-semibold">{c.name} <span className="font-normal text-ink-400">{c.insee}</span></td><td className="text-right">{c.parcels}</td><td className="text-right">{c.sharedParcels}</td><td className="text-right">{km(c.totalM, 2)} km</td><td className="pl-2">{c.routes.join(", ")}</td></tr>)}</tbody></table>
            ) : <ZoneList zones={synth.zones} />}
          </div>
        </>}
      </div>
    </div>
  );
}
