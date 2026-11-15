"use client";
import { Field, RequiredLegend, filled } from "@/components/ui/field";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GeoJSONSource, Marker, Popup } from "maplibre-gl";
import { ArrowLeft, Plus, Trash2, FileDown, Printer, Users, X, UserPlus, Sparkles, Check, Flag, FlagTriangleRight, Maximize2, Minimize2, MapPinned, ArrowRight } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { PoiIcon } from "@/components/ui/poi-icon";
import { poiPinSvg } from "@/lib/poi-icons";
import { routeMarkerSvg } from "@/lib/route-markers";
import { Button, ButtonLink } from "@/components/ui/button";
import { eventsRepo, routesRepo, syncEventsWithRoutes } from "@/lib/repo";
import { POST_KINDS, passageTable, raceFactsFromRoute, raceOutOfSync, POST_ICON, POST_COLOR, postNumbers, postLabel, volunteersAt, assignVolunteer, addVolunteerAt, cleanAssignments, type EventModel, type Post, type PostKind, type Volunteer } from "@/lib/events";
import { KIND_TO_POI, STAFF_DEFAULT, isEndpoint, placeOn, poiPostId, proposeShared } from "@/lib/poi-sync";
import { estimateMinutes } from "@/lib/sports";
import { bboxOf } from "@/lib/geo";
import { download, safeName } from "@/lib/formats";
import { passagePdf, volunteersPdf, mapPdf } from "@/lib/pdf";
import { uid, type Poi } from "@/lib/types";
import { logisticsHref, manageHref } from "@/lib/url";

const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
export type P = { ev: EventModel; save: (fn: (e: EventModel) => EventModel) => void };

/** Sous-onglets : mêmes pastilles partout. */
export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string][]; label: string }) {
  return <div role="tablist" aria-label={label} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-ink-100 p-1">{items.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={value === k} onClick={() => onChange(k)} className={clsx("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition", value === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900")}>{l}</button>)}</div>;
}

/**
 * Cohérence des données, quel que soit l'écran ouvert : courses réalignées sur leur parcours s'il a changé,
 * postes réalignés sur les POI partagés du parcours (départ / arrivée compris), fiches bénévoles dont le poste a disparu remises à « non affecté ».
 */
export function Consistency({ ev, save }: P) {
  const routes = routesRepo.useAll();
  useEffect(() => {
    const stale = ev.races.filter((r) => { const rt = r.routeId ? routes.find((x) => x.id === r.routeId) : null; return rt && raceOutOfSync(r, rt.coords); });
    const orphan = cleanAssignments(ev) !== ev;
    if (stale.length || orphan) save((e) => cleanAssignments({ ...e, races: e.races.map((r) => { const rt = stale.some((x) => x.id === r.id) ? routes.find((x) => x.id === r.routeId) : null; return rt ? { ...r, ...raceFactsFromRoute(rt.coords) } : r; }) }));
    syncEventsWithRoutes(); // idempotent : n'écrit que si un poste doit suivre son POI
  }, [ev, routes]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function PostIcon({ kind, size = 28 }: { kind: PostKind; size?: number }) {
  const ic = POST_ICON[kind];
  if (ic === "start" || ic === "finish") { const I = ic === "start" ? FlagTriangleRight : Flag; return <span className="inline-grid shrink-0 place-items-center rounded-[30%] text-white shadow-sm ring-1 ring-black/10" style={{ width: size, height: size, background: POST_COLOR[kind] }} role="img" aria-label={POST_KINDS[kind].label}><I style={{ width: size * 0.58, height: size * 0.58 }} /></span>; }
  return <PoiIcon type={ic} size={size} />;
}
/** Marqueur de carte d'un poste : épingle du site, numéro du poste, bénévoles affectés / nécessaires. */
function postMarkerEl(kind: PostKind, n: number, staff: string, short: boolean, selected: boolean, auto: boolean, title: string): HTMLButtonElement {
  const ic = POST_ICON[kind], b = document.createElement("button"); b.type = "button"; b.className = "group relative block cursor-pointer bg-transparent p-0 leading-none"; b.title = title; b.setAttribute("aria-label", title); b.dataset.post = kind;
  const inner = document.createElement("span"); inner.className = "block origin-bottom transition-transform duration-150 group-hover:scale-110" + (selected ? " scale-110 drop-shadow-[0_0_0_2px_#0a1514]" : "");
  inner.innerHTML = ic === "start" || ic === "finish" ? routeMarkerSvg(ic, 44) : poiPinSvg(ic, 34);
  const num = document.createElement("span"); num.className = "absolute -left-2 -top-1.5 grid min-w-[1.15rem] place-items-center rounded-full border border-white bg-ink-950 px-1 text-[10px] font-bold leading-[1.05rem] text-white shadow"; num.textContent = String(n); num.dataset.num = "1";
  const c = document.createElement("span"); c.className = "absolute -right-3 -top-1.5 rounded-full border border-white px-1 text-[10px] font-bold leading-[1.05rem] text-white shadow"; c.style.background = short ? "#c0362c" : "#1e7a58"; c.textContent = staff; c.dataset.staff = "1";
  b.append(inner, num, c);
  if (auto) { const a = document.createElement("span"); a.className = "absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full border border-white bg-brass-400"; a.title = "Poste proposé, à vérifier"; b.append(a); }
  return b;
}

export function Logistics({ ev, save, full, setFull }: P & { full: boolean; setFull: (v: boolean) => void }) {
  const routes = routesRepo.useAll();
  const [raceId, setRaceId] = useState(ev.races[0]?.id ?? "");
  const race = ev.races.find((r) => r.id === raceId) ?? ev.races[0];
  const route = race?.routeId ? routes.find((r) => r.id === race.routeId) : undefined;
  const hasRoute = !!route && route.coords.length > 1;
  const palette = (Object.keys(POST_KINDS) as PostKind[]).filter((k) => !hasRoute || !isEndpoint(k));
  const [kind, setKind] = useState<PostKind>("ravito");
  const [msg, setMsg] = useState<string | null>(null);
  const posts = useMemo(() => ev.posts.filter((p) => p.raceId === race?.id).sort((a, b) => a.km - b.km), [ev.posts, race]);
  const { el, map, ml, ready } = useMap({ preserveBuffer: true });
  const marks = useRef<Marker[]>([]); const popup = useRef<Popup | null>(null);
  const [sel, setSel] = useState<string | null>(null); const [newName, setNewName] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [listOpen, setListOpen] = useState(false);
  const clickRef = useRef<(lng: number, lat: number) => void>(() => {});
  const moveRef = useRef<(p: Post, lng: number, lat: number) => void>(() => {});

  const routeNow = () => (race?.routeId ? routesRepo.get(race.routeId) : undefined); // lecture fraîche avant chaque écriture
  /** Écrit les POI du parcours : la logistique de tous les événements qui l'utilisent est réalignée aussitôt (POI partagés). */
  const writePois = (fn: (pois: Poi[]) => Poi[]) => { const rt = routeNow(); if (!rt) return false; const r = routesRepo.upsert({ ...rt, pois: fn(rt.pois ?? []), updatedAt: Date.now() }); if (!r.ok) setMsg(r.error ?? "Enregistrement impossible."); return r.ok; };
  const upd = (id: string, patch: Partial<Post>) => save((e) => ({ ...e, posts: e.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  clickRef.current = (lng, lat) => {
    if (!race) return;
    const rt = routeNow();
    if (rt && rt.coords.length > 1 && !isEndpoint(kind)) {
      const at = placeOn(rt.coords, kind, lng, lat), id = uid(), n = posts.filter((p) => p.kind === kind).length + 1;
      if (writePois((pois) => [...pois, { id, type: KIND_TO_POI[kind]!, name: `${POST_KINDS[kind].label} ${n}`, lng: at.lng, lat: at.lat }])) {
        setSel(poiPostId(race.id, id));
        setMsg(`${POST_KINDS[kind].label} ${n} placé ${at.offTrackM ? `à ${at.offTrackM} m du tracé` : "sur le tracé"} (km ${at.km.toFixed(1).replace(".", ",")}). Il figure aussi dans les points d'intérêt du parcours « ${rt.name} ». Glissez le marqueur pour l'ajuster.`);
      }
      return;
    }
    // course sans parcours lié : poste seul, kilomètre saisi à la main (ancien fonctionnement)
    const n = posts.filter((p) => p.kind === kind).length + 1;
    save((e) => ({ ...e, posts: [...e.posts, { id: uid(), raceId: race.id, kind, name: `${POST_KINDS[kind].label} ${n}`, km: 0, lng: +lng.toFixed(6), lat: +lat.toFixed(6), staffNeeded: STAFF_DEFAULT[kind], note: "" }] }));
    setMsg("Course sans parcours lié : kilomètre à saisir à la main. Liez un parcours à la course pour partager les postes avec lui.");
  };
  moveRef.current = (p, lng, lat) => {
    const rt = routeNow();
    if (rt && rt.coords.length > 1 && p.poiId) {
      const at = placeOn(rt.coords, p.kind, lng, lat);
      if (writePois((pois) => pois.map((q) => (q.id === p.poiId ? { ...q, lng: at.lng, lat: at.lat } : q)))) setMsg(`« ${p.name} » déplacé ${at.offTrackM ? `à ${at.offTrackM} m du tracé` : "sur le tracé"} (km ${at.km.toFixed(1).replace(".", ",")}) — parcours mis à jour.`);
      return;
    }
    if (rt && rt.coords.length > 1 && isEndpoint(p.kind)) {
      const at = placeOn(rt.coords, p.kind, lng, lat);
      upd(p.id, { lng: at.lng, lat: at.lat, km: at.km, offTrackM: at.offTrackM, pinned: true });
      setMsg(`${POST_KINDS[p.kind].label} déplacé à la main : il n'est plus recalé sur le parcours (bouton « Recaler » pour revenir à l'extrémité du tracé).`);
      return;
    }
    upd(p.id, { lng: +lng.toFixed(6), lat: +lat.toFixed(6) });
  };
  const rename = (p: Post) => {
    const v = draft[p.id]; if (v == null) return;
    const n = v.replace(/\s+/g, " ").trim() || POST_KINDS[p.kind].label;
    if (n !== p.name) { if (p.poiId && routeNow()) writePois((pois) => pois.map((q) => (q.id === p.poiId ? { ...q, name: n } : q))); else upd(p.id, { name: n }); }
    setDraft((d) => { const x = { ...d }; delete x[p.id]; return x; });
  };
  const remove = (p: Post) => {
    const vols = volunteersAt(ev, p.id), rt = routeNow();
    if (p.poiId && rt) {
      if (!window.confirm(`Supprimer « ${p.name} » ?\n\nCe point est partagé : il sera aussi retiré du parcours « ${rt.name} »${vols.length ? `, et ${vols.length} bénévole(s) seront remis à « non affecté » (fiches conservées)` : ""}.`)) return;
      writePois((pois) => pois.filter((q) => q.id !== p.poiId));
    } else save((e) => ({ ...e, posts: e.posts.filter((x) => x.id !== p.id), volunteers: e.volunteers.map((v) => (v.postId === p.id ? { ...v, postId: "" } : v)) }));
    if (sel === p.id) setSel(null);
  };
  const focus = (p: Post) => { setSel(p.id); const m = map.current; if (m && p.lng != null && p.lat != null) m.easeTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 14), duration: 500 }); };

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    const h = (e: { lngLat: { lng: number; lat: number } }) => clickRef.current(e.lngLat.lng, e.lngLat.lat);
    m.on("click", h); return () => { m.off("click", h); };
  }, [ready, map]);

  const fitKey = `${route?.id}:${route?.coords.length}`;
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (!m.getSource("rt")) {
      m.addSource("rt", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "rt-c", type: "line", source: "rt", paint: { "line-color": "#fff", "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "rt-l", type: "line", source: "rt", paint: { "line-color": "#f0612b", "line-width": 4 }, layout: { "line-cap": "round", "line-join": "round" } });
    }
    (m.getSource("rt") as GeoJSONSource).setData({ type: "FeatureCollection", features: route ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coords.map((c) => [c[0], c[1]]) } }] : [] });
    if (route && route.coords.length > 1) { const b = bboxOf(route.coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, duration: 0, maxZoom: 15 }); }
  }, [fitKey, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    marks.current.forEach((x) => x.remove()); marks.current = [];
    posts.forEach((p, i) => {
      if (p.lng == null || p.lat == null) return;
      const vols = volunteersAt(ev, p.id), need = Math.max(0, p.staffNeeded), short = vols.length < need;
      const b = postMarkerEl(p.kind, i + 1, `${vols.length}/${need}`, short, sel === p.id, !!p.auto, `Poste ${i + 1} — ${p.name} (km ${p.km})${p.offTrackM ? `, à ${p.offTrackM} m du tracé` : ""} : ${vols.length ? vols.map((v) => v.name).join(", ") : "aucun bénévole"}${p.auto ? " — proposé, à vérifier" : ""}. Glisser pour déplacer.`);
      b.addEventListener("click", (e) => { e.stopPropagation(); setSel(p.id); setListOpen(true); setTimeout(() => document.getElementById(`post-${p.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50); });
      const mk = new lib.Marker({ element: b, anchor: "bottom", draggable: true }).setLngLat([p.lng, p.lat]).addTo(m);
      mk.on("dragend", () => { const ll = mk.getLngLat(); moveRef.current(p, ll.lng, ll.lat); });
      marks.current.push(mk);
    });
  }, [posts, ev.volunteers, sel, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    popup.current?.remove(); popup.current = null;
    const idx = posts.findIndex((x) => x.id === sel), p = posts[idx]; if (!p || p.lng == null || p.lat == null) return;
    const vols = volunteersAt(ev, p.id), box = document.createElement("div"); box.className = "text-sm";
    const h = document.createElement("div"); h.className = "font-semibold"; h.textContent = `Poste ${idx + 1} — ${p.name}`;
    const k = document.createElement("div"); k.className = "text-xs text-gray-600"; k.textContent = `${POST_KINDS[p.kind].label} · km ${p.km}${p.offTrackM ? ` · ${p.offTrackM} m du tracé` : ""} · ${vols.length}/${p.staffNeeded} bénévole(s)`;
    const l = document.createElement("div"); l.className = "mt-1 text-xs"; l.textContent = vols.length ? vols.map((v) => v.name).join(", ") : "Aucun bénévole affecté";
    box.append(h, k, l);
    popup.current = new lib.Popup({ closeButton: true, closeOnClick: false, offset: 40 }).setLngLat([p.lng, p.lat]).setDOMContent(box).addTo(m);
    popup.current.on("close", () => setSel((x) => (x === p.id ? null : x)));
  }, [sel, posts, ev.volunteers, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps
  // plein écran : Échap pour sortir, page figée derrière
  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target as HTMLElement)?.closest?.("input,textarea,select")) setFull(false); };
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; window.addEventListener("keydown", k);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", k); };
  }, [full, setFull]);

  const autoN = posts.filter((p) => p.auto).length;
  const propose = () => {
    const rt = routeNow(); if (!race || !rt) return;
    const { pois, posts: add } = proposeShared(eventsRepo.get(ev.id) ?? ev, race, rt, uid);
    if (!add.length) { setMsg("Rien à ajouter : tous les postes proposés existent déjà."); return; }
    save((e) => ({ ...e, posts: [...e.posts.filter((p) => !add.some((a) => a.id === p.id)), ...add] })); // postes d'abord (données d'organisation), puis POI du parcours
    writePois((ps) => [...ps, ...pois.filter((q) => !ps.some((x) => x.id === q.id))]);
    setMsg(`${add.length} poste(s) proposé(s), ajoutés aussi aux points d'intérêt du parcours : vérifiez chacun, glissez-le si besoin, puis confirmez.${ev.prep?.roads?.[race.id] ? "" : " Les signaleurs aux traversées de routes seront proposés après l'analyse des parcours."}`);
  };
  const exportMap = async () => {
    const m = map.current; if (!m || !race) return;
    try {
      m.triggerRepaint(); await new Promise((r) => requestAnimationFrame(() => r(null)));
      const c = m.getCanvas(); const k = c.width / c.clientWidth;
      const pins = posts.flatMap((p, i) => (p.lng == null || p.lat == null ? [] : [{ n: i + 1, ...(() => { const q = m.project([p.lng!, p.lat!]); return { x: q.x * k, y: q.y * k }; })(), color: POST_KINDS[p.kind].color, label: `${p.name} (km ${p.km.toFixed(1)})` }]));
      download(`${safeName(ev.name)}-${safeName(race.label)}-carte.pdf`, await mapPdf(ev, race, c.toDataURL("image/png"), c.width, c.height, pins), "application/pdf");
    } catch { setMsg("Export de la carte impossible."); }
  };

  if (!ev.races.length) return <p className="rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Ajoutez d&apos;abord une course dans l&apos;étape « Votre trail ».</p>;
  const counts = (Object.keys(POST_KINDS) as PostKind[]).map((k) => [k, posts.filter((p) => p.kind === k).length] as const).filter(([, n]) => n > 0);
  const tools = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <select aria-label="Course" className="h-10 rounded-full border border-ink-200 bg-white px-3 text-sm font-semibold" value={race?.id} onChange={(e) => { setRaceId(e.target.value); setSel(null); }}>{ev.races.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      <div role="group" aria-label="Type de poste à placer" className="-mx-1 flex w-full min-w-0 gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">{palette.map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={clsx("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition", kind === k ? "border-ink-900 bg-ink-950 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400")}><PostIcon kind={k} size={22} />{POST_KINDS[k].label}</button>)}</div>
    </div>
  );
  const actions = (
    <div className="flex flex-wrap gap-2">
      {hasRoute && <Button size="sm" onClick={propose} data-action="proposer"><Sparkles className="size-4" />{posts.some((p) => !isEndpoint(p.kind)) ? "Compléter avec les postes proposés" : "Proposer les postes automatiquement"}</Button>}
      {autoN > 0 && <Button size="sm" variant="secondary" onClick={() => save((e) => ({ ...e, posts: e.posts.map((p) => (p.raceId === race?.id ? { ...p, auto: undefined } : p)) }))}><Check className="size-4" />Confirmer les {autoN} postes proposés</Button>}
      <Button size="sm" variant="secondary" onClick={exportMap} disabled={!posts.length}><FileDown className="size-4" />Carte en PDF</Button>
      {!full && <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="size-4" />Imprimer</Button>}
    </div>
  );
  const list = (
    <ul className={clsx("grid content-start gap-2.5 overflow-y-auto p-0.5", full ? "min-h-0" : "max-h-[40rem]")} aria-label="Postes de la course">
      {posts.map((p, i) => { const linked = !!p.poiId && hasRoute, endpoint = isEndpoint(p.kind) && hasRoute; return (
        <li key={p.id} id={`post-${p.id}`} aria-label={`Poste ${i + 1} — ${p.name}`} className={clsx("rounded-2xl bg-white p-3 shadow-card ring-1", sel === p.id ? "ring-2 ring-pine-600" : "ring-ink-100")}>
          <div className="flex items-center gap-2"><button type="button" onClick={() => focus(p)} title="Voir sur la carte" aria-label={`Voir le poste ${i + 1} sur la carte`} className="relative shrink-0"><PostIcon kind={p.kind} size={30} /><span className="absolute -left-1.5 -top-1.5 grid min-w-[1.1rem] place-items-center rounded-full border border-white bg-ink-950 px-1 text-[10px] font-bold leading-4 text-white">{i + 1}</span></button>
            <input aria-label="Nom du poste" className="min-w-0 flex-1 rounded border border-transparent px-1 text-sm font-semibold hover:border-ink-200" value={draft[p.id] ?? p.name} onFocus={() => setSel(p.id)} onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))} onBlur={() => rename(p)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            {endpoint ? (p.pinned ? <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-pine-700 underline" onClick={() => { upd(p.id, { pinned: undefined }); syncEventsWithRoutes(race?.routeId); setMsg(`${POST_KINDS[p.kind].label} recalé sur l'extrémité du parcours.`); }}>Recaler</button> : null)
              : <button aria-label="Supprimer le poste" className="grid size-7 place-items-center rounded hover:bg-ink-100" onClick={() => remove(p)}><Trash2 className="size-4" /></button>}</div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-10 text-xs text-ink-500">{POST_KINDS[p.kind].label} · km {p.km.toFixed(1).replace(".", ",")}
            {p.offTrackM ? <span className="rounded-full bg-glacier-100 px-2 py-0.5 font-semibold text-glacier-600">Hors tracé · {p.offTrackM} m</span> : null}
            {linked && <span className="rounded-full bg-pine-50 px-2 py-0.5 font-semibold text-pine-700" title="Nom, type et position partagés avec les points d'intérêt du parcours : une seule saisie">Partagé avec le parcours</span>}
            {endpoint && <span className="rounded-full bg-ink-50 px-2 py-0.5 font-semibold text-ink-600">{p.pinned ? "Déplacé à la main" : "Extrémité du parcours"}</span>}
            {p.auto && <><span className="rounded-full bg-brass-100 px-2 py-0.5 font-semibold text-brass-600">Proposé — à vérifier</span><button type="button" className="font-semibold text-pine-700 underline" onClick={() => upd(p.id, { auto: undefined })}>Confirmer</button></>}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">{hasRoute ? <span className="grid content-start gap-0.5"><span>Km</span><span className="flex h-8 items-center rounded bg-ink-50 px-1.5 font-semibold" title="Calculé sur le parcours">{p.km.toFixed(2).replace(".", ",")}</span></span> : <label>Km<input type="number" step="0.1" className="h-8 w-full rounded border border-ink-200 px-1" value={p.km} onChange={(e) => upd(p.id, { km: +e.target.value || 0 })} /></label>}
            <label>Barrière (h)<input type="number" step="0.25" min={0} className="h-8 w-full rounded border border-ink-200 px-1" value={p.cutoffH ?? ""} onChange={(e) => upd(p.id, { cutoffH: e.target.value === "" ? undefined : +e.target.value })} /></label>
            <label>Bénévoles<input type="number" min={0} className="h-8 w-full rounded border border-ink-200 px-1" value={p.staffNeeded} onChange={(e) => upd(p.id, { staffNeeded: +e.target.value || 0 })} /></label></div>
          <input aria-label="Note" placeholder="Matériel, consignes…" className="mt-2 h-8 w-full rounded border border-ink-200 px-2 text-xs" value={p.note} onChange={(e) => upd(p.id, { note: e.target.value })} />
          {(() => { const vols = volunteersAt(ev, p.id), others = ev.volunteers.filter((v) => v.postId !== p.id), nums = postNumbers(ev); return (
            <div className="mt-2 border-t border-ink-100 pt-2">
              <p className={clsx("text-xs font-semibold", vols.length < p.staffNeeded ? "text-danger" : "text-pine-700")}>Bénévoles à ce poste : {vols.length}/{p.staffNeeded}</p>
              {vols.length > 0 && <ul className="mt-1 flex flex-wrap gap-1">{vols.map((v) => <li key={v.id} className="inline-flex items-center gap-1 rounded-full bg-pine-50 py-0.5 pl-2 pr-0.5 text-xs font-medium text-pine-700">{v.name}<button type="button" aria-label={`Retirer ${v.name} de ce poste`} title="Retirer de ce poste (la fiche est conservée)" className="grid size-5 place-items-center rounded-full hover:bg-pine-100" onClick={() => save((e) => assignVolunteer(e, v.id, ""))}><X className="size-3" /></button></li>)}</ul>}
              <div className="mt-1.5 grid gap-1.5">
                {others.length > 0 && <select aria-label={`Affecter un bénévole existant au poste ${i + 1}`} className="h-8 w-full rounded border border-ink-200 bg-white px-1 text-xs" value="" onChange={(e) => { if (e.target.value) save((x) => assignVolunteer(x, e.target.value, p.id)); }}><option value="">Affecter un bénévole existant…</option>{others.map((v) => { const cur = v.postId ? nums.get(v.postId) : null; return <option key={v.id} value={v.id}>{v.name}{cur ? ` (actuellement poste ${cur.n}${ev.races.length > 1 && cur.race ? `, ${cur.race.label}` : ""})` : " (non affecté)"}</option>; })}</select>}
                <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const n = (newName[p.id] ?? "").trim(); if (!n) return; save((x) => addVolunteerAt(x, n, p.id, uid())); setNewName((s) => ({ ...s, [p.id]: "" })); }}>
                  <input aria-label={`Nom d'un nouveau bénévole pour le poste ${i + 1}`} placeholder="Nouveau bénévole (nom)" className="h-8 min-w-0 flex-1 rounded border border-ink-200 px-2 text-xs" value={newName[p.id] ?? ""} onChange={(e) => setNewName((s) => ({ ...s, [p.id]: e.target.value }))} />
                  <button type="submit" aria-label={`Ajouter ce bénévole au poste ${i + 1}`} className="grid size-8 shrink-0 place-items-center rounded border border-ink-200 hover:bg-ink-50 disabled:opacity-40" disabled={!(newName[p.id] ?? "").trim()}><UserPlus className="size-4" /></button></form>
              </div>
            </div>); })()}
        </li>); })}
      {!posts.length && <li className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">Aucun poste pour cette course.</li>}
    </ul>
  );
  const hint = msg ?? (hasRoute ? `Choisissez un type puis cliquez sur la carte : près du tracé, le poste s'aimante sur la trace ; plus loin (parking, secours sur accès véhicule…), il reste où vous cliquez. Glissez un marqueur pour l'ajuster. Chaque poste est aussi un point d'intérêt du parcours « ${route!.name} » : une seule saisie, visible des deux côtés.` : "Liez un parcours à cette course pour placer les postes sur le tracé et les partager avec lui.");
  return (
    <div data-fullscreen={full ? "true" : undefined} className={clsx(full ? "fixed inset-0 z-[80] flex flex-col gap-2 bg-paper p-2 sm:p-3" : "grid grid-cols-[minmax(0,1fr)] gap-3")}>
      <div className={clsx("flex flex-wrap items-start gap-2", full && "rounded-2xl bg-white/90 p-2 shadow-card ring-1 ring-ink-100")}>
        <div className="min-w-0 flex-1">{tools}</div>
        <Button size="sm" variant={full ? "primary" : "secondary"} onClick={() => setFull(!full)} aria-label={full ? "Quitter le plein écran" : "Passer la carte en plein écran"} data-action="plein-ecran" className="shrink-0">{full ? <><Minimize2 className="size-4" />Quitter le plein écran</> : <><Maximize2 className="size-4" />Plein écran</>}</Button>
      </div>
      {counts.length > 0 && <ul aria-label="Équipements et postes sur la carte" className="flex flex-wrap gap-1.5 text-xs">{counts.map(([k, n]) => <li key={k} className="inline-flex items-center gap-1 rounded-full bg-white py-0.5 pl-0.5 pr-2.5 font-semibold text-ink-700 ring-1 ring-ink-100"><PostIcon kind={k} size={18} />{POST_KINDS[k].label} · {n}</li>)}</ul>}
      <div className={clsx("grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]", full && "min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-rows-1")}>
        <div className={clsx("flex min-h-0 flex-col", full && "min-h-[50vh]")}>
          <div className={clsx("relative overflow-hidden rounded-2xl shadow-card ring-1 ring-ink-100", full ? "min-h-0 flex-1" : "h-[min(70vh,38rem)] min-h-[24rem]")}><div className="absolute inset-0"><div ref={el} className="size-full" role="application" aria-label="Carte logistique : cliquez pour placer un poste, glissez un poste pour le déplacer" /></div><LayerControl map={map} ready={ready} />
          </div>
          <p className={clsx("mt-2 text-xs text-ink-500", full && "line-clamp-2 lg:line-clamp-none")} aria-live="polite">{hint}</p>
          <div className="mt-2">{actions}</div>
        </div>
        {full ? <div className={clsx("min-h-0 flex-col lg:flex", listOpen ? "flex max-h-[45vh] lg:max-h-none" : "hidden")}>{list}</div> : list}
        {full && <button type="button" onClick={() => setListOpen((v) => !v)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-card ring-1 ring-ink-100 lg:hidden" aria-expanded={listOpen}>{listOpen ? "Masquer la liste" : `Liste des postes (${posts.length})`}</button>}
      </div>
    </div>
  );
}

export function Volunteers({ ev, save }: P) {
  const [f, setF] = useState({ name: "", phone: "", postId: "", from: "", to: "", instructions: "" });
  const [nameErr, setNameErr] = useState(false);
  const add = (e: React.FormEvent) => { e.preventDefault(); if (!filled(f.name)) { setNameErr(true); return; } setNameErr(false); save((x) => ({ ...x, volunteers: [...x.volunteers, { id: uid(), ...f, name: f.name.trim() }] })); setF({ name: "", phone: "", postId: "", from: "", to: "", instructions: "" }); };
  const pdf = async (vols: Volunteer[], name: string) => download(`${safeName(ev.name)}-${name}.pdf`, await volunteersPdf(ev, vols, ev.posts), "application/pdf");
  const count = (postId: string) => ev.volunteers.filter((v) => v.postId === postId).length;
  const nums = postNumbers(ev), sorted = [...ev.posts].sort((a, b) => (ev.races.findIndex((r) => r.id === a.raceId) - ev.races.findIndex((r) => r.id === b.raceId)) || (nums.get(a.id)!.n - nums.get(b.id)!.n));
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={add} noValidate className="grid content-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100"><h2 className="font-bold">Nouvelle fiche bénévole</h2><RequiredLegend />
        <Field l="Nom" required error={nameErr && !filled(f.name) ? "Le nom du bénévole est obligatoire." : null}><input required aria-invalid={nameErr && !filled(f.name)} className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field l="Téléphone"><input className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field l="Poste"><select className={inp} value={f.postId} onChange={(e) => setF({ ...f, postId: e.target.value })}><option value="">Non affecté</option>{sorted.map((p) => <option key={p.id} value={p.id}>{postLabel(ev, p)}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2"><Field l="De"><input type="time" className={inp} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field><Field l="À"><input type="time" className={inp} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field></div>
        <Field l="Consignes"><textarea rows={3} className="rounded-lg border border-ink-200 p-2 text-sm" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
        <Button type="submit" variant="brand"><Plus className="size-4" />Ajouter</Button></form>
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold"><Users className="size-5" />{ev.volunteers.length} bénévole(s)</h2><Button size="sm" variant="secondary" disabled={!ev.volunteers.length} onClick={() => pdf(ev.volunteers, "fiches-benevoles")}><FileDown className="size-4" />Toutes les fiches (PDF)</Button></div>
        <ul className="grid gap-2">{ev.volunteers.map((v) => { const p = ev.posts.find((x) => x.id === v.postId); return (
          <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-100"><div className="min-w-0 flex-1"><p className="font-semibold">{v.name}</p><p className="text-xs text-ink-500">{v.from || "?"}–{v.to || "?"} · {v.phone || "pas de téléphone"}</p></div>
            <label className="flex items-center gap-1.5 text-xs font-medium">Poste<select aria-label={`Poste de ${v.name}`} className={clsx("h-9 max-w-[16rem] rounded-lg border bg-white px-2 text-sm", p ? "border-ink-200" : "border-warn/60")} value={p ? v.postId : ""} onChange={(e) => save((x) => assignVolunteer(x, v.id, e.target.value))}><option value="">Non affecté</option>{sorted.map((q) => <option key={q.id} value={q.id}>{postLabel(ev, q)}</option>)}</select></label>
            <Button size="sm" variant="ghost" onClick={() => pdf([v], safeName(v.name))}><FileDown className="size-4" />Fiche</Button><Button size="sm" variant="ghost" aria-label={`Supprimer la fiche de ${v.name}`} onClick={() => confirm(`Supprimer la fiche de ${v.name} ?`) && save((x) => ({ ...x, volunteers: x.volunteers.filter((y) => y.id !== v.id) }))}><Trash2 className="size-4" /></Button></li>); })}</ul>
        {ev.posts.length > 0 && <div className="mt-5 rounded-xl bg-ink-50 p-3"><p className="mb-2 text-sm font-semibold">Couverture des postes</p><ul className="grid gap-1 text-sm">{sorted.map((p) => <li key={p.id} className="flex justify-between gap-3"><span>{postLabel(ev, p)}</span><span className={count(p.id) < p.staffNeeded ? "font-semibold text-danger" : "text-pine-700"}>{count(p.id)} / {p.staffNeeded}</span></li>)}</ul></div>}
      </div>
    </div>
  );
}

export function Passages({ ev }: { ev: EventModel }) {
  const routes = routesRepo.useAll();
  const [raceId, setRaceId] = useState(ev.races[0]?.id ?? "");
  const race = ev.races.find((r) => r.id === raceId) ?? ev.races[0];
  const est = race ? estimateMinutes(race.sport, race.distanceKm * 1000, race.gainM) / 60 : 1;
  const [hours, setHours] = useState<[number, number, number] | null>(null);
  const fin: [number, number, number] = hours ?? [+(est * 0.8).toFixed(2), +est.toFixed(2), +(est * 1.35).toFixed(2)];
  const labels = ["Rapide", "Médian", "Lent"];
  const coords = race?.routeId ? routes.find((r) => r.id === race.routeId)?.coords ?? null : null;
  const rows = useMemo(() => (race ? passageTable(race, ev.posts, coords, fin) : []), [race, ev.posts, coords, fin[0], fin[1], fin[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!race) return <p className="rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Ajoutez une course et des postes pour calculer les temps de passage.</p>;
  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Field l="Course"><select className={inp} value={race.id} onChange={(e) => { setRaceId(e.target.value); setHours(null); }}>{ev.races.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></Field>
        {labels.map((l, i) => <Field key={l} l={`${l} : durée totale (h)`}><input type="number" min={0.1} step="0.05" className={inp} value={fin[i]} onChange={(e) => { const v = [...fin] as [number, number, number]; v[i] = +e.target.value || 0.1; setHours(v); }} /></Field>)}
        <Button variant="secondary" disabled={!rows.length} onClick={async () => download(`${safeName(ev.name)}-${safeName(race.label)}-passages.pdf`, await passagePdf(ev, race, rows, labels, fin), "application/pdf")}><FileDown className="size-4" />PDF</Button>
      </div>
      <p className="mt-2 text-xs text-ink-500">Départ {race.startTime}. {coords ? "Répartition selon l'effort (km + D+/100) calculé sur le parcours lié." : "Aucun parcours lié : répartition proportionnelle aux kilomètres."} Les durées sont des scénarios saisis par vous, non des prévisions.</p>
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100"><table className="w-full min-w-[40rem] text-sm"><thead><tr className="border-b border-ink-100 text-left text-ink-500"><th className="p-3">Km</th><th>Poste</th><th>Barrière</th>{labels.map((l) => <th key={l}>{l}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.post.id} className="border-b border-ink-50 last:border-0"><td className="p-3 font-medium">{r.km.toFixed(1)}</td><td>{r.post.name}</td><td>{r.post.cutoffH != null ? `${r.post.cutoffH} h` : "—"}</td>{r.times.map((t, i) => <td key={i} className={r.late[i] ? "font-semibold text-danger" : ""}>{t.clock}{r.late[i] && " ⚠"}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={6} className="p-4 text-ink-500">Aucun poste sur cette course : placez-en dans l'onglet Logistique.</td></tr>}</tbody></table></div>
      <p className="mt-2 text-xs text-ink-500">⚠ : le coureur de ce scénario passerait après la barrière horaire.</p>
    </div>
  );
}


/** Résumé de la logistique dans le parcours guidé : ce qui est placé, ce qui manque, accès à la page dédiée. */
export function LogisticsSummary({ ev }: { ev: EventModel }) {
  const routes = routesRepo.useAll();
  return (
    <div className="rounded-2xl bg-ink-950 p-5 text-white shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className="eyebrow !text-brass-400">Page dédiée</p><h3 className="mt-1 text-xl font-bold">Préparation logistique</h3>
        <p className="mt-1 max-w-xl text-sm text-white/70">Grande carte, plein écran, placement au clic, déplacement par glisser-déposer, bénévoles et temps de passage. Les points d&apos;intérêt des parcours y apparaissent d&apos;eux-mêmes ; ce que vous y ajoutez est repris dans les parcours.</p></div>
        <ButtonLink href={logisticsHref(ev.id)} size="lg" data-action="ouvrir-logistique"><MapPinned className="size-5" />Ouvrir la logistique<ArrowRight className="size-4" /></ButtonLink></div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">{ev.races.map((r) => { const ps = ev.posts.filter((p) => p.raceId === r.id), rt = routes.find((x) => x.id === r.routeId), need = ps.reduce((s, p) => s + p.staffNeeded, 0), got = ps.reduce((s, p) => s + Math.min(p.staffNeeded, volunteersAt(ev, p.id).length), 0), auto = ps.filter((p) => p.auto).length; return (
        <li key={r.id} className="rounded-xl bg-white/10 p-3 text-sm"><p className="font-semibold">{r.label}{rt ? <span className="font-normal text-white/60"> · {rt.name}</span> : <span className="text-warn"> · sans parcours</span>}</p>
          <p className="mt-1 flex flex-wrap gap-1.5">{(Object.keys(POST_KINDS) as PostKind[]).map((k) => [k, ps.filter((p) => p.kind === k).length] as const).filter(([, n]) => n).map(([k, n]) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-white/90 py-0.5 pl-0.5 pr-2 text-xs font-semibold text-ink-800"><PostIcon kind={k} size={16} />{n}</span>)}</p>
          <p className="mt-1 text-xs text-white/70">{ps.length} poste(s) · bénévoles {got}/{need}{auto ? ` · ${auto} proposé(s) à vérifier` : ""}</p></li>); })}</ul>
    </div>
  );
}

/** Page dédiée à la préparation logistique d'un événement. */
export function LogisticsPage({ id }: { id: string }) {
  const ev = eventsRepo.useAll().find((e) => e.id === id);
  const [sub, setSub] = useState<"postes" | "benevoles" | "passages">("postes");
  const [full, setFull] = useState(false);
  if (!ev) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-3xl font-bold">Événement introuvable</h1><p className="mt-2 text-ink-600">Les événements sont enregistrés sur cet appareil.</p><Link href="/organisateurs" className="mt-6 inline-block font-semibold text-pine-700 underline">Retour</Link></div>;
  const save = (fn: (e: EventModel) => EventModel) => { eventsRepo.upsert(fn(eventsRepo.get(ev.id) ?? ev)); };
  return (
    <div className="mx-auto max-w-[96rem] px-3 py-5 sm:px-6">
      <Consistency ev={ev} save={save} />
      <Link href={manageHref(ev.id)} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />{ev.name} — organisation</Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p className="eyebrow">Étape 3 · Logistique</p><h1 className="text-3xl sm:text-4xl">Préparation logistique</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-600">Départ et arrivée sont pris aux extrémités de chaque parcours ; les points d&apos;intérêt du parcours (ravitaillements, eau, secours, parkings, passages…) sont repris d&apos;eux-mêmes. Ajoutez, déplacez ou supprimez : le parcours est mis à jour en même temps.</p></div>
        <Tabs label="Logistique" value={sub} onChange={setSub} items={[["postes", `Carte et postes (${ev.posts.length})`], ["benevoles", `Bénévoles (${ev.volunteers.length})`], ["passages", "Temps de passage"]]} /></header>
      <div className="mt-4">
        {sub === "postes" && <Logistics ev={ev} save={save} full={full} setFull={setFull} />}
        {sub === "benevoles" && <Volunteers ev={ev} save={save} />}
        {sub === "passages" && <Passages ev={ev} />}
      </div>
    </div>
  );
}
