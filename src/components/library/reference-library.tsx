"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import type { MutableRefObject } from "react";
import { Search, Download, Pencil, Save, TriangleAlert, Loader2, Check, ExternalLink, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import type { ML } from "@/components/map/use-map";
import { ElevationChart } from "@/components/route/elevation-chart";
import { Button } from "@/components/ui/button";
import { CATEGORIES, PRACTICE_LABEL, attributionText, entryIssues, loadCoords, loadIndex, norm, practiceSport, toSavedRoute, validateCoords, type LibCategory, type LibEntry } from "@/lib/library";
import { routesRepo } from "@/lib/repo";
import { buildProfile } from "@/lib/profile";
import { FORMATS, download, safeName, serialize } from "@/lib/formats";
import { bboxOf, fmtKm, fmtM, fmtDuration, trackStats } from "@/lib/geo";
import { estimateMinutes } from "@/lib/sports";
import { editorHref, routeHref, withBase } from "@/lib/url";
import { uid, type Pt } from "@/lib/types";

/**
 * Itinéraires de référence (GR, grandes traversées, véloroutes) affichés sur la carte de l'Explorer : liste, recherche, catégories,
 * détail, profil, contrôle du tracé, GPX, ajout à « Mes parcours ». `visible` montre ou masque leurs repères sur la carte.
 */
export function ReferencePanel({ map, ml, ready, visible, setVisible, initialId, onSelect }: { map: MutableRefObject<MLMap | null>; ml: MutableRefObject<ML | null>; ready: boolean; visible: boolean; setVisible: (v: boolean) => void; initialId?: string | null; onSelect?: () => void }) {
  const [entries, setEntries] = useState<LibEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<LibCategory | "all">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [coords, setCoords] = useState<Pt[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const mine = routesRepo.useAll();

  // lien direct : /explorer/?itineraire=gr20
  useEffect(() => { if (initialId && /^[\w-]{2,60}$/.test(initialId)) setSel(initialId); }, [initialId]);
  // index chargé à la première ouverture seulement
  useEffect(() => { if (!visible || entries) return; loadIndex().then(setEntries).catch((e) => setError(e instanceof Error ? e.message : "Bibliothèque indisponible.")); }, [visible, entries]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const e of entries ?? []) c[e.category] = (c[e.category] ?? 0) + 1; return c; }, [entries]);
  const list = useMemo(() => {
    const n = norm(q);
    return (entries ?? []).filter((e) => (cat === "all" || e.category === cat) && (!n || norm(`${e.name} ${e.ref ?? ""} ${e.region} ${e.from ?? ""} ${e.to ?? ""}`).includes(n)));
  }, [entries, cat, q]);
  const selected = entries?.find((e) => e.id === sel) ?? null;

  useEffect(() => {
    if (!sel) { setCoords(null); return; }
    let live = true; setLoading(true); setCoords(null); setMsg(null);
    loadCoords(sel).then((c) => { if (live) setCoords(c); }).catch(() => { if (live) setMsg({ kind: "err", text: "Impossible de charger le tracé de cet itinéraire." }); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [sel]);

  const onSel = useRef(onSelect); onSel.current = onSelect;
  // visibilité des itinéraires sur la carte
  useEffect(() => {
    const m = map.current; if (!m || !ready || !m.getSource("lib")) return;
    for (const l of ["lib-pts", "lib-sel-casing", "lib-sel-line"]) if (m.getLayer(l)) m.setLayoutProperty(l, "visibility", visible ? "visible" : "none");
    if (!visible) { hoverMk.current?.remove(); hoverMk.current = null; }
  }, [visible, ready, map, coords]);
  const profile = useMemo(() => (coords ? buildProfile(coords) : []), [coords]);
  const stats = useMemo(() => (coords ? trackStats(coords, 3) : null), [coords]);
  const problems = useMemo(() => (coords && selected ? [...validateCoords(coords, { maxJumpM: 3000 }), ...entryIssues(selected)] : []), [coords, selected]);
  const already = selected ? mine.find((r) => r.sourceUrl === selected.source.url) : undefined;

  // carte : départs de tous les itinéraires filtrés + tracé sélectionné
  useEffect(() => {
    const m = map.current; if (!m || !ready || m.getSource("lib")) return;
    m.addSource("lib", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addSource("lib-sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    m.addLayer({ id: "lib-sel-casing", type: "line", source: "lib-sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 8 } });
    m.addLayer({ id: "lib-sel-line", type: "line", source: "lib-sel", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f0612b", "line-width": 4.5 } });
    m.addLayer({ id: "lib-pts", type: "circle", source: "lib", paint: { "circle-radius": 7, "circle-color": "#1e7a58", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    m.on("click", "lib-pts", (e) => { const id = e.features?.[0]?.properties?.id; if (id) { setSel(id as string); onSel.current?.(); } });
    m.on("mouseenter", "lib-pts", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "lib-pts", () => (m.getCanvas().style.cursor = ""));
  }, [ready, map]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    (m.getSource("lib") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: list.map((e) => ({ type: "Feature", properties: { id: e.id, name: e.name }, geometry: { type: "Point", coordinates: e.start } })) });
  }, [list, ready, map]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    (m.getSource("lib-sel") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: coords ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords.map((c) => [c[0], c[1]]) } }] : [] });
    if (coords && coords.length > 1 && visible) { const b = bboxOf(coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, maxZoom: 14 }); }
  }, [coords, ready, map]);
  const hoverMk = useRef<import("maplibre-gl").Marker | null>(null);
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (hover == null || !coords?.[hover]) { hoverMk.current?.remove(); hoverMk.current = null; return; }
    if (!hoverMk.current) { const d = document.createElement("div"); d.className = "size-4 rounded-full border-2 border-white bg-glacier-500 shadow-[0_0_0_5px_rgb(59_166_201/0.35)]"; hoverMk.current = new lib.Marker({ element: d }).setLngLat([coords[hover][0], coords[hover][1]]).addTo(m); }
    else hoverMk.current.setLngLat([coords[hover][0], coords[hover][1]]);
  }, [hover, coords, ready, map, ml]);

  const gpx = () => { if (!selected || !coords) return; download(`${safeName(selected.name)}.gpx`, serialize("gpx", { name: selected.name, description: attributionText(selected), coords, pois: [] }), FORMATS.gpx.mime); };
  const save = (open: boolean) => {
    if (!selected || !coords) return;
    if (already) { if (open) location.assign(withBase(editorHref(already.id))); else setMsg({ kind: "warn", text: "Cet itinéraire est déjà dans « Mes parcours »." }); return; }
    const r = toSavedRoute(selected, coords, uid()); const res = routesRepo.upsert(r);
    if (!res.ok) { setMsg({ kind: "err", text: res.error ?? "Enregistrement impossible." }); return; }
    if (open) location.assign(withBase(editorHref(r.id))); else setMsg({ kind: "ok", text: "Ajouté à « Mes parcours » : vous pouvez l'ouvrir, le modifier, l'exporter, voir la météo ou le préparer hors ligne." });
  };

  const chip = (on: boolean) => clsx("rounded-full border px-3 py-1.5 text-sm font-medium transition", on ? "border-pine-600 bg-pine-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-pine-400");

  return (
    <div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-sm font-semibold"><span>Afficher les itinéraires sur la carte<span className="block text-xs font-normal text-ink-500">Repères de départ et tracé sélectionné, visibles aussi depuis les autres onglets.</span></span>
          <input type="checkbox" role="switch" aria-label="Afficher les itinéraires de référence sur la carte" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-5 shrink-0 accent-[var(--color-pine-600)]" /></label>
        <h2 className="mt-4 font-display text-base font-bold">Itinéraires de référence</h2>
        <p className="mt-1 text-sm text-ink-500">GR, grandes traversées et véloroutes : tracés ouverts (OpenStreetMap, ODbL) avec distance, D+/D− et profil calculés. Sélectionnez un itinéraire pour le voir sur la carte, le télécharger ou l'utiliser dans l'éditeur.</p>

        <label className="relative mt-3 block"><span className="sr-only">Rechercher un itinéraire</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="GR 20, ViaRhôna, Loire…" className="h-10 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm" /></label>
        <div role="group" aria-label="Catégories" className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")} className={chip(cat === "all")}>Tous{entries ? ` (${entries.length})` : ""}</button>
          {CATEGORIES.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} title={c.hint} className={chip(cat === c.id)}>{c.label} ({counts[c.id] ?? 0})</button>)}
        </div>
        {cat !== "all" && !(counts[cat] ?? 0) && <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">Aucun itinéraire dans cette catégorie pour l'instant : seuls des tracés dont la licence permet la réutilisation sont intégrés (voir « Ajouter des itinéraires » dans la documentation).</p>}

        {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        {!entries && !error && <p className="mt-4 flex items-center gap-2 text-sm text-ink-500"><Loader2 className="size-4 animate-spin" />Chargement…</p>}
        <ul className="mt-3 grid gap-2">
          {list.map((e) => (
            <li key={e.id}><button type="button" aria-pressed={e.id === sel} onClick={() => { setSel(e.id); if (!visible) setVisible(true); }} className={clsx("w-full rounded-xl border p-3 text-left transition", e.id === sel ? "border-pine-600 bg-pine-50" : "border-ink-100 hover:border-ink-200")}>
              <span className="block font-semibold leading-snug">{e.name}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{PRACTICE_LABEL[e.practice] ?? e.practice} · {e.region}</span>
              <span className="mt-1.5 flex gap-4 text-sm"><span><b className="font-display">{fmtKm(e.distanceM)}</b></span><span><b className="font-display">{fmtM(e.gainM)}</b> D+</span><span><b className="font-display">{fmtM(e.lossM)}</b> D−</span></span>
            </button></li>
          ))}
          {entries && !list.length && <li className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">Aucun itinéraire ne correspond.</li>}
        </ul>

        {selected && (
          <section className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-ink-100 pt-4" aria-label="Détail de l'itinéraire">
            <h2 className="font-display text-lg font-bold">{selected.name}</h2>
            <p className="text-sm text-ink-600">{selected.from && selected.to ? <>De <b>{selected.from}</b> à <b>{selected.to}</b> · </> : null}{selected.loop ? "Boucle" : "Itinéraire linéaire"} · {PRACTICE_LABEL[selected.practice] ?? selected.practice} · {selected.region}</p>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              {[["Distance", stats ? fmtKm(stats.distanceM) : fmtKm(selected.distanceM)], ["D+", fmtM(stats?.gainM ?? selected.gainM)], ["D−", fmtM(stats?.lossM ?? selected.lossM)], ["Alt. min", fmtM(stats?.minEle ?? selected.minEle)], ["Alt. max", fmtM(stats?.maxEle ?? selected.maxEle)], ["Durée est.", fmtDuration(estimateMinutes(practiceSport(selected.practice), stats?.distanceM ?? selected.distanceM, stats?.gainM ?? selected.gainM))]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-ink-50 p-2"><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{l}</dt><dd className="font-display font-bold">{v}</dd></div>
              ))}
            </dl>
            {loading && <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="size-4 animate-spin" />Chargement du tracé…</p>}
            {coords && <ElevationChart points={profile} onHover={setHover} height={160} />}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!coords} onClick={gpx}><Download className="size-4" />Télécharger le GPX</Button>
              <Button size="sm" variant="secondary" disabled={!coords} onClick={() => save(true)}><Pencil className="size-4" />Ouvrir dans l'éditeur</Button>
              <Button size="sm" variant="secondary" disabled={!coords || !!already} onClick={() => save(false)}>{already ? <><Check className="size-4" />Déjà dans Mes parcours</> : <><Save className="size-4" />Ajouter à Mes parcours</>}</Button>
              {already && <Link href={routeHref(already.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-pine-700 underline">Fiche complète (météo, hors ligne)</Link>}
            </div>
            {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={clsx("rounded-lg px-3 py-2 text-sm", msg.kind === "err" ? "bg-danger/10 text-danger" : msg.kind === "warn" ? "bg-warn/10 text-ink-700" : "bg-pine-50 text-pine-700")}>{msg.text}</p>}
            {problems.length > 0
              ? <div role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-ink-700"><p className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="size-4 text-warn" />Contrôle automatique : points d'attention</p><ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
              : coords && <p className="flex items-center gap-1.5 text-sm text-pine-700"><ShieldCheck className="size-4" />Contrôle automatique : tracé continu, sans point invalide ni trou.</p>}
            <div className="rounded-lg border border-ink-100 p-3 text-xs text-ink-600">
              <p className="font-semibold text-ink-800">Source et licence</p>
              <p className="mt-1">{selected.source.attribution}, licence {selected.source.license} (réutilisation avec attribution ; les bases dérivées restent sous la même licence). <a className="inline-flex items-center gap-0.5 font-medium underline" href={selected.source.url} target="_blank" rel="noreferrer noopener">Relation OSM {selected.source.relation}<ExternalLink className="size-3" /></a></p>
              <p className="mt-1">Altitudes : {selected.source.elevation}. Données du {selected.source.retrieved}.</p>
              <p className="mt-1">Itinéraire non officiel : le balisage, les déviations et les règles d'accès peuvent différer. Consultez l'organisme gestionnaire avant de partir.</p>
            </div>
          </section>
        )}
    </div>
  );
}
