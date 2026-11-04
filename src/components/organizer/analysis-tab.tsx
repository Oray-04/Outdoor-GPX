"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource } from "maplibre-gl";
import { Loader2, Square, Download, FileDown, Copy, ShieldAlert, Trees, Footprints, Landmark, Search } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { MapFrame, StatBanner } from "@/components/map/map-frame";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { routesRepo } from "@/lib/repo";
import { analyzeRoute, parcelsCsv, GROUP_LABEL, type Analysis, type Portion } from "@/lib/analysis";
import { analysisPdf } from "@/lib/pdf";
import { download, safeName } from "@/lib/formats";
import { bboxOf, fmtKm, cumulative } from "@/lib/geo";
import type { EventModel } from "@/lib/events";
import type { LL, SavedRoute } from "@/lib/types";

const COLOR = { prive: "#d4202a", ok: "#1e7a58", inconnu: "#f0612b" } as const;
const portionColor = (p: Portion) => (!p.matched || p.prive === null ? COLOR.inconnu : p.prive ? COLOR.prive : COLOR.ok);

/** Découpe le tracé en tronçons colorés selon le statut des portions. */
function coloredSegments(coords: LL[], portions: Portion[]) {
  const cum = cumulative(coords); const out: { color: string; gr: boolean; line: LL[] }[] = [];
  for (const p of portions) {
    const idx: number[] = []; cum.forEach((d, i) => { if (d >= p.fromM - 1e-6 && d <= p.toM + 1e-6) idx.push(i); });
    if (idx.length >= 2) out.push({ color: portionColor(p), gr: p.gr, line: idx.map((i) => coords[i]) });
  }
  return out;
}

export function AnalysisTab({ ev }: { ev: EventModel }) {
  const routes = routesRepo.useAll();
  const linked = useMemo(() => ev.races.map((r) => ({ race: r, route: routes.find((x) => x.id === r.routeId) })).filter((x): x is { race: typeof x.race; route: SavedRoute } => !!x.route), [ev.races, routes]);
  const [routeId, setRouteId] = useState(linked[0]?.route.id ?? routes[0]?.id ?? "");
  const route = routes.find((r) => r.id === routeId);
  const { el, map, ml, ready } = useMap();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<{ s: string; d: number; t: number } | null>(null);
  const [res, setRes] = useState<{ routeId: string; a: Analysis } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"parcelles" | "chemins" | "zones">("parcelles");
  const [q, setQ] = useState("");
  const ctrl = useRef<AbortController | null>(null);
  const a = res && res.routeId === routeId ? res.a : null;
  const coords: LL[] = useMemo(() => (route ? route.coords.map((c) => [c[0], c[1]] as LL) : []), [route]);

  useEffect(() => {
    const m = map.current; if (!m || !ready || m.getSource("z")) return;
    for (const id of ["z", "p", "r", "g"]) m.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "z-fill", type: "fill", source: "z", paint: { "fill-color": ["match", ["get", "kind"], "parc", "#7a4bd1", "#1e7a58"], "fill-opacity": 0.14 } });
    m.addLayer({ id: "z-line", type: "line", source: "z", paint: { "line-color": ["match", ["get", "kind"], "parc", "#7a4bd1", "#1e7a58"], "line-width": 1.5, "line-dasharray": [3, 2] } });
    m.addLayer({ id: "p-fill", type: "fill", source: "p", paint: { "fill-color": "#f0612b", "fill-opacity": 0.12 } });
    m.addLayer({ id: "p-line", type: "line", source: "p", paint: { "line-color": "#c2410c", "line-width": 1.2 } });
    m.addLayer({ id: "g-line", type: "line", source: "g", layout: { "line-cap": "round" }, paint: { "line-color": "#7a4bd1", "line-width": 11, "line-opacity": 0.45 } });
    m.addLayer({ id: "r-casing", type: "line", source: "r", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 8 } });
    m.addLayer({ id: "r-line", type: "line", source: "r", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": 5 } });
    m.on("click", "p-fill", (e) => { const f = e.features?.[0]; if (!f || !ml.current) return; const box = document.createElement("div"); const b = document.createElement("b"); b.textContent = String(f.properties?.ref); const s = document.createElement("div"); s.textContent = `${f.properties?.commune} · ${Math.round(Number(f.properties?.lengthM))} m de tracé`; box.append(b, s); new ml.current.Popup({ closeButton: false }).setLngLat(e.lngLat).setDOMContent(box).addTo(m); });
    m.on("mouseenter", "p-fill", () => (m.getCanvas().style.cursor = "pointer")); m.on("mouseleave", "p-fill", () => (m.getCanvas().style.cursor = ""));
  }, [ready, map, ml]);

  useEffect(() => {
    const m = map.current; if (!m || !ready || !m.getSource("z")) return;
    const set = (id: string, features: object[]) => (m.getSource(id) as GeoJSONSource).setData({ type: "FeatureCollection", features } as never);
    const segs = a ? coloredSegments(coords, a.portions) : [];
    set("r", segs.length ? segs.map((s) => ({ type: "Feature", properties: { color: s.color }, geometry: { type: "LineString", coordinates: s.line } })) : coords.length > 1 ? [{ type: "Feature", properties: { color: "#f0612b" }, geometry: { type: "LineString", coordinates: coords } }] : []);
    set("g", segs.filter((s) => s.gr).map((s) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: s.line } })));
    set("p", (a?.parcels ?? []).map((p) => ({ type: "Feature", properties: { ref: p.ref, commune: p.commune, lengthM: p.lengthM }, geometry: p.geometry })));
    set("z", (a?.zones ?? []).map((z) => ({ type: "Feature", properties: { kind: z.kind, name: z.name }, geometry: z.geometry })));
    if (coords.length > 1) { const b = bboxOf(coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 16, duration: 0 }); }
  }, [a, coords, ready, map]);

  async function run() {
    if (!route) return;
    ctrl.current?.abort(); const c = new AbortController(); ctrl.current = c;
    setBusy(true); setErr(null); setStep({ s: "Préparation", d: 0, t: 1 });
    try { const r = await analyzeRoute(coords, { signal: c.signal, onStep: (s, d, t) => setStep({ s, d, t }) }); setRes({ routeId: route.id, a: r }); }
    catch (e) { if ((e as Error).name !== "AbortError") setErr((e as Error).message || "Analyse impossible pour le moment."); }
    finally { setBusy(false); setStep(null); }
  }
  const parcels = useMemo(() => (a?.parcels ?? []).filter((p) => !q.trim() || `${p.commune} ${p.ref}`.toLowerCase().includes(q.trim().toLowerCase())), [a, q]);
  const copyRefs = async () => { try { await navigator.clipboard.writeText((a?.parcels ?? []).map((p) => `${p.commune} — ${p.ref}`).join("\n")); setErr(null); } catch { setErr("Copie impossible : utilisez l'export CSV."); } };
  const s = a?.summary;
  const banner = <StatBanner title={route?.name ?? "Analyse"} items={a ? [{ label: "Parcelles", value: String(a.parcels.length) }, { label: "Communes", value: String(new Set(a.parcels.map((p) => p.insee)).size) }, { label: "Privé selon IGN", value: `${s!.priveKm.toFixed(1).replace(".", ",")} km` }, { label: "À vérifier", value: `${s!.inconnuKm.toFixed(1).replace(".", ",")} km` }, { label: "Zones", value: String(a.zones.length) }] : [{ label: "Distance", value: fmtKm(route ? route.coords.length > 1 ? cumulative(route.coords).at(-1)! : 0 : 0) }]} />;

  if (!routes.length) return <p className="rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Aucun parcours enregistré : créez ou importez un tracé, puis revenez l'analyser.</p>;
  return (
    <div className="grid gap-4">
      <div role="note" className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-ink-800">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" />
        <p><b>Aide à la préparation, pas une validation.</b> Cette analyse ne confirme aucun droit de passage ni autorisation. Les données publiques peuvent être incomplètes ou datées, et le cadastre <b>ne donne pas l'identité des propriétaires</b> : pour l'obtenir, adressez-vous au service de la publicité foncière ou à la mairie en indiquant les références ci-dessous. Chemins ruraux, servitudes et accords privés restent à vérifier sur le terrain et auprès des communes.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-[14rem] flex-1 gap-1 text-sm font-medium">Tracé à analyser<select className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          {linked.length > 0 && <optgroup label="Courses de cet événement">{linked.map(({ race, route: r }) => <option key={race.id} value={r.id}>{race.label} — {r.name}</option>)}</optgroup>}
          <optgroup label="Tous mes parcours">{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup></select></label>
        {busy ? <Button variant="secondary" onClick={() => ctrl.current?.abort()}><Square className="size-4" />Arrêter</Button> : <Button variant="brand" onClick={run} disabled={!route}><Search className="size-4" />Analyser le tracé</Button>}
        {a && <><Button variant="secondary" onClick={() => download(`${safeName(route!.name)}-parcelles.csv`, "﻿" + parcelsCsv(a), "text/csv;charset=utf-8")}><Download className="size-4" />CSV des parcelles</Button><Button variant="secondary" onClick={async () => download(`${safeName(route!.name)}-analyse.pdf`, await analysisPdf(route!.name, a), "application/pdf")}><FileDown className="size-4" />Récapitulatif PDF</Button></>}
      </div>
      {busy && step && <div role="status" aria-live="polite"><div className="flex justify-between text-sm text-ink-600"><span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{step.s}…</span><span>{step.d}/{step.t}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-pine-500 transition-all" style={{ width: `${(step.d / Math.max(1, step.t)) * 100}%` }} /></div></div>}
      {err && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      {a?.warnings.map((w) => <p key={w} role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-ink-700">{w}</p>)}

      <div className="grid gap-4 lg:grid-cols-[1fr_26rem]">
        <MapFrame className="h-[26rem] overflow-hidden rounded-2xl ring-1 ring-ink-100 lg:h-[34rem]" banner={banner}>
          <div className="absolute inset-0"><div ref={el} className="size-full" role="region" aria-label="Carte de l'analyse" /></div>
          <LayerControl map={map} ready={ready} />
          {a && <ul className="absolute bottom-9 left-2 z-10 rounded-lg bg-white/95 p-2 text-[11px] shadow" aria-label="Légende">
            {([["Privé selon la source", COLOR.prive], ["Non signalé privé", COLOR.ok], ["À vérifier / hors réseau", COLOR.inconnu]] as const).map(([l, c]) => <li key={l} className="flex items-center gap-1.5"><i className="inline-block h-1 w-4 rounded" style={{ background: c }} />{l}</li>)}
            <li className="flex items-center gap-1.5"><i className="inline-block h-2 w-4 rounded" style={{ background: "#7a4bd160" }} />Itinéraire GR</li><li className="flex items-center gap-1.5"><i className="inline-block size-3 border border-orange-700 bg-orange-100" />Parcelle traversée</li></ul>}
        </MapFrame>

        <div className="min-w-0 rounded-2xl bg-white ring-1 ring-ink-100">
          <div className="flex border-b border-ink-100 text-sm font-semibold" role="tablist">
            {([["parcelles", "Parcelles", Landmark], ["chemins", "Chemins", Footprints], ["zones", "Zones", Trees]] as const).map(([k, l, I]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("flex flex-1 items-center justify-center gap-1.5 py-3", tab === k ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}><I className="size-4" />{l}{a && <Badge tone="neutral">{k === "parcelles" ? a.parcels.length : k === "zones" ? a.zones.length : a.summary.itineraires.length}</Badge>}</button>)}
          </div>
          <div className="max-h-[30rem] overflow-y-auto p-3 text-sm">
            {!a ? <p className="p-3 text-ink-500">Lancez l'analyse pour obtenir les parcelles, les chemins et les zones réglementées traversés par ce tracé.</p> : tab === "parcelles" ? (<>
              <div className="mb-2 flex gap-2"><input aria-label="Filtrer les parcelles" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer (commune, section…)" className="h-9 min-w-0 flex-1 rounded-lg border border-ink-200 px-3" /><Button size="sm" variant="secondary" onClick={copyRefs}><Copy className="size-4" />Copier</Button></div>
              <p className="mb-2 text-xs text-ink-500">{parcels.length} parcelle(s) sur {new Set(a.parcels.map((p) => p.insee)).size} commune(s). Cliquez une parcelle sur la carte pour sa référence.</p>
              <table className="w-full text-left text-xs"><thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-1">Commune</th><th>Réf.</th><th className="text-right">Tracé</th></tr></thead>
                <tbody>{parcels.slice(0, 300).map((p) => <tr key={p.id} className="border-b border-ink-50 last:border-0"><td className="py-1 pr-1">{p.commune}</td><td className="font-mono">{p.ref}</td><td className="text-right">{Math.round(p.lengthM)} m</td></tr>)}</tbody></table>
              {parcels.length > 300 && <p className="mt-2 text-xs text-ink-500">Affichage limité à 300 lignes : le CSV et le PDF contiennent toutes les parcelles.</p>}
            </>) : tab === "chemins" ? (<div className="grid gap-4">
              <div><p className="font-semibold">Statut des chemins empruntés</p>
                <ul className="mt-1.5 grid gap-1">{([["Privé selon la source (BD TOPO)", s!.priveKm, COLOR.prive], ["Non signalé privé", s!.nonPriveKm, COLOR.ok], ["Statut inconnu ou hors réseau recensé", s!.inconnuKm, COLOR.inconnu]] as const).map(([l, km, c]) => <li key={l} className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-full" style={{ background: c }} />{l}</span><b>{km.toFixed(1).replace(".", ",")} km</b></li>)}</ul>
                <p className="mt-1.5 text-xs text-ink-500">« Non signalé privé » ne veut pas dire « public » : à vérifier (chemins ruraux, servitudes, accords).</p></div>
              <div><p className="font-semibold">Nature des chemins</p><ul className="mt-1.5 grid gap-1">{s!.byNature.map((n) => <li key={n.nature} className="flex justify-between"><span>{n.nature}</span><b>{n.km.toFixed(1).replace(".", ",")} km</b></li>)}</ul></div>
              <div><p className="font-semibold">Itinéraires de randonnée balisés rencontrés</p>
                {s!.itineraires.length ? <ul className="mt-1.5 grid gap-1">{s!.itineraires.map((i) => <li key={i.name} className="flex items-center justify-between gap-2"><span>{i.name} {i.gr && <Badge tone="glacier">GR</Badge>}</span><b>{i.km.toFixed(1).replace(".", ",")} km</b></li>)}</ul> : <p className="mt-1 text-ink-500">Aucun dans les données IGN.</p>}
                <p className="mt-1.5 text-xs text-ink-500">Un GR n'est repéré que si son nom l'indique ; le numéro de GR n'est pas toujours fourni par la source IGN.</p></div>
              {a.waymarked.length > 0 && <div><p className="font-semibold">Itinéraires de longue distance recensés dans la zone (OpenStreetMap)</p><ul className="mt-1.5 flex flex-wrap gap-1.5">{a.waymarked.map((r, i) => <li key={i}><Badge tone="neutral">{r.ref || r.name}{r.group && ` · ${GROUP_LABEL[r.group] ?? r.group}`}</Badge></li>)}</ul><p className="mt-1.5 text-xs text-ink-500">Présents dans l'emprise du tracé, sans garantie qu'ils le croisent : à vérifier sur la carte (fond « Outdoors » ou « OpenCycleMap »).</p></div>}
            </div>) : (<div className="grid gap-2">
              {a.zones.length ? a.zones.map((z) => <div key={z.id} className="rounded-lg bg-ink-50 p-3"><p className="flex items-center gap-1.5 font-semibold"><Badge tone={z.kind === "parc" ? "ember" : "pine"}>{z.kind === "parc" ? "Parc / réserve" : "Forêt publique"}</Badge>{z.name}</p><p className="mt-0.5 text-xs text-ink-500">{z.nature || "—"} · {(z.lengthM / 1000).toFixed(2).replace(".", ",")} km de tracé dans la zone</p></div>) : <p className="text-ink-500">Aucune forêt publique ni zone protégée recensée sur ce tracé.</p>}
              <p className="text-xs text-ink-500">Forêts publiques (ONF, communes) et parcs, réserves, sites Natura 2000 : une autorisation ou une consultation du gestionnaire peut être nécessaire.</p></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
