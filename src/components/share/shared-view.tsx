"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import Link from "next/link";
import { Download, Save, Check, Pencil, TriangleAlert } from "lucide-react";
import { useMap } from "@/components/map/use-map";
import { ElevationChart } from "@/components/route/elevation-chart";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import { decodeShared, readHash, type SharedRoute } from "@/lib/embed";
import { buildProfile } from "@/lib/profile";
import { poiMarkerEl, poiPopupEl } from "@/lib/poi-icons";
import { routeMarkerEl } from "@/lib/route-markers";
import { bboxOf, fmtKm, fmtM } from "@/lib/geo";
import { SPORTS } from "@/lib/sports";
import { FORMATS, download, safeName, serialize } from "@/lib/formats";
import { fromTrack } from "@/lib/editor-core";
import { routesRepo } from "@/lib/repo";
import { uid } from "@/lib/types";
import { BASE, editorHref, withBase } from "@/lib/url";

/** Vue d'un parcours reçu par lien. `embed` : version dépouillée pour une iframe (pas de navigation, pas d'accès au stockage). */
export function SharedView({ embed }: { embed: boolean }) {
  const { el, map, ml, ready } = useMap();
  const [state, setState] = useState<{ r: SharedRoute | null; stats: boolean; profile: boolean; read: boolean }>({ r: null, stats: true, profile: true, read: false });
  const [hover, setHover] = useState<number | null>(null); const [msg, setMsg] = useState<string | null>(null); const [savedId, setSavedId] = useState<string | null>(null);
  useEffect(() => { const go = () => { const h = readHash(location.hash); setState({ r: h.code ? decodeShared(h.code) : null, stats: h.stats, profile: h.profile, read: true }); }; go(); window.addEventListener("hashchange", go); return () => window.removeEventListener("hashchange", go); }, []);
  const r = state.r; const profile = useMemo(() => (r ? buildProfile(r.coords) : []), [r]);
  const marks = useRef<Marker[]>([]); const hov = useRef<Marker | null>(null);
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready || !r) return;
    if (!m.getSource("sh")) { m.addSource("sh", { type: "geojson", data: { type: "FeatureCollection", features: [] } }); m.addLayer({ id: "sh-casing", type: "line", source: "sh", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#fff", "line-width": 8 } }); m.addLayer({ id: "sh-line", type: "line", source: "sh", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f0612b", "line-width": 4.5 } }); }
    (m.getSource("sh") as GeoJSONSource).setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.coords.map((c) => [c[0], c[1]]) } }] });
    marks.current.forEach((x) => x.remove()); marks.current = [];
    const f = r.coords[0], l = r.coords[r.coords.length - 1], loop = Math.abs(f[0] - l[0]) < 1e-4 && Math.abs(f[1] - l[1]) < 1e-4;
    const flag = (k: "start" | "finish" | "loop", at: readonly number[]) => marks.current.push(new lib.Marker({ element: routeMarkerEl(k), anchor: "bottom" }).setLngLat([at[0], at[1]]).addTo(m));
    if (loop) flag("loop", f); else { flag("start", f); flag("finish", l); }
    for (const p of r.pois) { const e = poiMarkerEl(p.type, p.name); e.addEventListener("click", (ev) => { ev.stopPropagation(); new lib.Popup({ closeButton: true, closeOnClick: false, offset: 40 }).setLngLat([p.lng, p.lat]).setDOMContent(poiPopupEl(p.type, p.name)).addTo(m); }); marks.current.push(new lib.Marker({ element: e, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m)); }
    const b = bboxOf(r.coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 45, maxZoom: 15, duration: 0 });
  }, [r, ready, map, ml]);
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready || !r) return;
    if (hover == null || !r.coords[hover]) { hov.current?.remove(); hov.current = null; return; }
    const c = r.coords[hover];
    if (!hov.current) { const d = document.createElement("div"); d.className = "size-4 rounded-full border-2 border-white bg-glacier-500 shadow-[0_0_0_5px_rgb(59_166_201/0.35)]"; hov.current = new lib.Marker({ element: d }).setLngLat([c[0], c[1]]).addTo(m); } else hov.current.setLngLat([c[0], c[1]]);
  }, [hover, r, ready, map, ml]);

  const gpx = () => { if (r) download(`${safeName(r.name)}.gpx`, serialize("gpx", { name: r.name, description: r.description, coords: r.coords, pois: r.pois.map((p, i) => ({ id: `p${i}`, ...p })) }), FORMATS.gpx.mime); };
  const save = (open: boolean) => {
    if (!r) return; if (savedId) { if (open) location.assign(withBase(editorHref(savedId))); return; }
    const st = fromTrack(r.coords, []), now = Date.now(), id = uid();
    const res = routesRepo.upsert({ id, name: r.name, description: r.description, sport: r.sport, segs: st.segs, waypoints: st.waypoints, coords: r.coords, pois: r.pois.map((p) => ({ id: uid(), ...p })), terrain: [], visibility: "prive", region: r.region, country: "", source: "import", createdAt: now, updatedAt: now });
    if (!res.ok) { setMsg(res.error ?? "Enregistrement impossible."); return; }
    setSavedId(id); if (open) location.assign(withBase(editorHref(id))); else setMsg("Copie ajoutée à votre bibliothèque (privée). Le parcours d'origine reste celui de son auteur.");
  };
  const items = r ? [["Distance", fmtKm(r.distanceM)], ["D+", fmtM(r.gainM)], ["D−", fmtM(r.lossM)]] : [];
  const bad = state.read && !r;

  if (embed) return (
    <div data-embed className="flex h-dvh flex-col bg-white text-ink-900">
      {r && state.stats && <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-ink-100 px-3 py-2"><p className="min-w-0 flex-1 truncate font-display text-sm font-bold">{r.name}</p><dl className="flex gap-4 text-xs">{items.map(([l, v]) => <div key={l} className="flex items-baseline gap-1"><dt className="uppercase tracking-wide text-ink-400">{l}</dt><dd className="font-display text-sm font-bold">{v}</dd></div>)}</dl></div>}
      <div className="relative min-h-0 flex-1"><div ref={el} className="absolute inset-0" role="region" aria-label={r ? `Carte du parcours ${r.name}` : "Carte"} />
        {bad && <p className="absolute inset-0 z-10 grid place-items-center bg-white/90 p-6 text-center text-sm text-ink-600">Ce code d'intégration est incomplet ou invalide.</p>}</div>
      {r && state.profile && <div className="border-t border-ink-100 px-1 pt-1"><ElevationChart points={profile} onHover={setHover} height={120} /></div>}
      <a href={`${BASE}/`} target="_blank" rel="noopener" className="flex items-center justify-end gap-1.5 border-t border-ink-100 px-3 py-1 text-[11px] text-ink-500 hover:text-ink-900"><LogoMark className="size-4" />Carte créée avec Crête</a>
    </div>
  );
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {bad ? <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-ink-100"><h1 className="text-2xl">Lien de partage invalide</h1><p className="mt-2 text-ink-600">Ce lien est incomplet ou a été modifié. Demandez à son auteur de le copier à nouveau.</p><Link href="/parcours" className="mt-4 inline-block font-semibold text-pine-700 underline">Aller à la bibliothèque</Link></div> : (<>
        <p className="eyebrow">Parcours partagé</p>
        <h1 className="mt-2 text-3xl sm:text-4xl">{r?.name ?? "Chargement…"}</h1>
        {r && <p className="mt-1 text-ink-600">{SPORTS[r.sport].label}{r.region ? ` · ${r.region}` : ""}</p>}
        {r?.description && <p className="mt-3 max-w-3xl whitespace-pre-line text-ink-700">{r.description}</p>}
        <dl className="mt-5 grid grid-cols-3 gap-3 sm:max-w-md">{items.map(([l, v]) => <div key={l} className="rounded-xl bg-white p-3 ring-1 ring-ink-100"><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{l}</dt><dd className="font-display text-lg font-bold">{v}</dd></div>)}</dl>
        <div className="relative mt-5 h-[26rem] overflow-hidden rounded-2xl ring-1 ring-ink-100"><div ref={el} className="absolute inset-0" role="region" aria-label="Carte du parcours partagé" /></div>
        {r && <div className="mt-4 rounded-2xl bg-white p-3 ring-1 ring-ink-100"><ElevationChart points={profile} onHover={setHover} height={170} /></div>}
        {r && <div className="mt-4 flex flex-wrap gap-2"><Button onClick={gpx}><Download className="size-4" />Télécharger le GPX</Button><Button variant="secondary" disabled={!!savedId} onClick={() => save(false)}>{savedId ? <><Check className="size-4" />Dans ma bibliothèque</> : <><Save className="size-4" />Ajouter à ma bibliothèque</>}</Button><Button variant="secondary" onClick={() => save(true)}><Pencil className="size-4" />Créer mon parcours à partir de celui-ci</Button></div>}
        {msg && <p role="status" className="mt-3 rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-700">{msg}</p>}
        {r && r.sourcePoints > r.coords.length && <p className="mt-3 flex gap-2 text-xs text-ink-500"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />Tracé allégé pour tenir dans un lien : {r.coords.length} points sur {r.sourcePoints} (écart maximal {r.maxDevM} m). Distance et dénivelés sont ceux du tracé complet de l'auteur.</p>}
        <p className="mt-2 text-xs text-ink-500">Vous consultez une copie : vous ne pouvez pas modifier le parcours de l'auteur. Toute modification se fait sur votre propre copie.</p>
      </>)}
    </div>
  );
}
