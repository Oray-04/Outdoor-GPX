"use client";
import { Field, RequiredLegend, filled } from "@/components/ui/field";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GeoJSONSource, Marker, Popup } from "maplibre-gl";
import { ArrowLeft, Plus, Trash2, FileDown, Printer, Users, X, UserPlus, Sparkles, Check, Flag, FlagTriangleRight, MapPinned, ArrowRight, CircleAlert, CircleDashed, ChevronDown, Loader2, Sheet } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { PoiIcon } from "@/components/ui/poi-icon";
import { poiPinSvg } from "@/lib/poi-icons";
import { routeMarkerSvg } from "@/lib/route-markers";
import { Button, ButtonLink } from "@/components/ui/button";
import { eventsRepo, routesRepo, syncEventsWithRoutes } from "@/lib/repo";
import { POST_KINDS, passageTable, raceFactsFromRoute, raceOutOfSync, POST_ICON, POST_COLOR, postNumbers, postLabel, volunteersAt, assignVolunteer, addVolunteerAt, cleanAssignments, postsOfRace, postRaceIds, postStatus, POST_STATUS, staffing, type PostStatus, type EventModel, type Post, type PostKind, type Volunteer } from "@/lib/events";
import { KIND_TO_POI, STAFF_DEFAULT, commonCandidates, groupVolunteers, trackCandidates, isEndpoint, mergeEndpoints, mergePoiPlan, placeOn, poiPostId, proposeShared, routesWithPoi, splitEndpoint } from "@/lib/poi-sync";
import { estimateMinutes } from "@/lib/sports";
import { bboxOf } from "@/lib/geo";
import { download, safeName } from "@/lib/formats";
import { logisticsMapsPdf, passagePdf, volunteersPdf } from "@/lib/logistics-pdf";
import { volunteersCsv } from "@/lib/volunteers-csv";
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
function postMarkerEl(kind: PostKind, n: number, staff: string, statusColor: string, selected: boolean, auto: boolean, title: string): HTMLButtonElement {
  const ic = POST_ICON[kind], b = document.createElement("button"); b.type = "button"; b.className = "group relative block cursor-pointer bg-transparent p-0 leading-none"; b.title = title; b.setAttribute("aria-label", title); b.dataset.post = kind;
  const inner = document.createElement("span"); inner.className = "block origin-bottom transition-transform duration-150 group-hover:scale-110" + (selected ? " scale-110 drop-shadow-[0_0_0_2px_#0a1514]" : "");
  inner.innerHTML = ic === "start" || ic === "finish" ? routeMarkerSvg(ic, 44) : poiPinSvg(ic, 34);
  const num = document.createElement("span"); num.className = "absolute -left-2 -top-1.5 grid min-w-[1.15rem] place-items-center rounded-full border border-white bg-ink-950 px-1 text-[10px] font-bold leading-[1.05rem] text-white shadow"; num.textContent = String(n); num.dataset.num = "1";
  const c = document.createElement("span"); c.className = "absolute -right-3 -top-1.5 rounded-full border border-white px-1 text-[10px] font-bold leading-[1.05rem] text-white shadow"; c.style.background = statusColor; c.textContent = staff; c.dataset.staff = "1";
  b.append(inner, num, c);
  if (auto) { const a = document.createElement("span"); a.className = "absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full border border-white bg-brass-400"; a.title = "Poste proposé, à vérifier"; b.append(a); }
  return b;
}

export function Logistics({ ev, save }: P) {
  const routes = routesRepo.useAll();
  const [raceId, setRaceId] = useState(ev.races[0]?.id ?? "");
  const race = ev.races.find((r) => r.id === raceId) ?? ev.races[0];
  const route = race?.routeId ? routes.find((r) => r.id === race.routeId) : undefined;
  const hasRoute = !!route && route.coords.length > 1;
  const palette = (Object.keys(POST_KINDS) as PostKind[]).filter((k) => !hasRoute || !isEndpoint(k));
  const [kind, setKind] = useState<PostKind>("ravito");
  const [msg, setMsg] = useState<string | null>(null);
  const posts = useMemo(() => (race ? postsOfRace(ev.posts, race.id) : []).sort((a, b) => a.km - b.km), [ev.posts, race]); // y compris les postes communs à plusieurs parcours
  const { el, map, ml, ready } = useMap({ preserveBuffer: true });
  const marks = useRef<Marker[]>([]); const popup = useRef<Popup | null>(null); const markOf = useRef(new Map<string, Marker>());
  const [sel, setSel] = useState<string | null>(null); const [newName, setNewName] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"tous" | PostStatus>("tous");
  const [editIns, setEditIns] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const clickRef = useRef<(lng: number, lat: number) => void>(() => {});
  const moveRef = useRef<(p: Post, lng: number, lat: number) => void>(() => {});

  const routeNow = () => (race?.routeId ? routesRepo.get(race.routeId) : undefined); // lecture fraîche avant chaque écriture
  /** Écrit les POI du parcours : la logistique de tous les événements qui l'utilisent est réalignée aussitôt (POI partagés). */
  const writeRoute = (routeId: string | undefined, fn: (pois: Poi[]) => Poi[]) => { const rt = routeId ? routesRepo.get(routeId) : undefined; if (!rt) return false; const r = routesRepo.upsert({ ...rt, pois: fn(rt.pois ?? []), updatedAt: Date.now() }); if (!r.ok) setMsg(r.error ?? "Enregistrement impossible."); return r.ok; };
  const writePois = (fn: (pois: Poi[]) => Poi[]) => writeRoute(race?.routeId, fn);
  // parcours distincts de l'événement (deux courses sur le même parcours n'en font qu'un)
  const eventRoutes = useMemo(() => { const m = new Map<string, { routeId: string; name: string; races: string[] }>(); for (const r of ev.races) { const rt = r.routeId ? routes.find((x) => x.id === r.routeId) : undefined; if (!rt || rt.coords.length < 2) continue; const cur = m.get(rt.id) ?? { routeId: rt.id, name: rt.name, races: [] }; cur.races.push(r.label); m.set(rt.id, cur); } return [...m.values()]; }, [ev.races, routes]);
  /** POI commun : ajoute ou retire ce point d'un autre parcours (même fiche, même poste, même équipe). */
  const setOnRoute = (p: Post, routeId: string, on: boolean) => {
    const src = routes.find((r) => r.pois.some((q) => q.id === p.poiId)), poi = src?.pois.find((q) => q.id === p.poiId); if (!poi) return;
    const holders = routesWithPoi(routes, p.poiId!);
    if (on) {
      for (const h of holders) if (!h.pois.find((q) => q.id === poi.id)?.common) writeRoute(h.id, (ps) => ps.map((q) => (q.id === poi.id ? { ...q, common: true } : q)));
      writeRoute(routeId, (ps) => (ps.some((q) => q.id === poi.id) ? ps : [...ps, { ...poi, common: true }]));
      setMsg(`« ${poi.name} » est maintenant commun au parcours « ${routes.find((r) => r.id === routeId)?.name} » : un seul poste, une seule équipe.`);
    } else {
      if (holders.length <= 1) return;
      writeRoute(routeId, (ps) => ps.filter((q) => q.id !== poi.id));
      if (holders.length === 2) { const last = holders.find((h) => h.id !== routeId)!; writeRoute(last.id, (ps) => ps.map((q) => (q.id === poi.id ? { id: q.id, type: q.type, name: q.name, lng: q.lng, lat: q.lat } : q))); }
      setMsg(`« ${poi.name} » retiré du parcours « ${routes.find((r) => r.id === routeId)?.name} » ; il reste sur les autres parcours.`);
    }
  };
  const setCommon = (p: Post, on: boolean) => {
    const holders = routesWithPoi(routes, p.poiId!);
    if (on) { for (const h of holders) writeRoute(h.id, (ps) => ps.map((q) => (q.id === p.poiId ? { ...q, common: true } : q))); return; }
    const keep = race?.routeId && holders.some((h) => h.id === race.routeId) ? race.routeId : holders[0]?.id;
    if (holders.length > 1 && !window.confirm(`Ne plus partager « ${p.name} » ?\n\nIl sera retiré de ${holders.length - 1} autre(s) parcours et restera seulement sur « ${routes.find((r) => r.id === keep)?.name} ».`)) return;
    for (const h of holders) if (h.id !== keep) writeRoute(h.id, (ps) => ps.filter((q) => q.id !== p.poiId));
    writeRoute(keep, (ps) => ps.map((q) => (q.id === p.poiId ? { id: q.id, type: q.type, name: q.name, lng: q.lng, lat: q.lat } : q)));
  };
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
      const holders = routesWithPoi(routesRepo.getAll(), p.poiId);
      if (!window.confirm(`Supprimer « ${p.name} » ?\n\nCe point est partagé avec ${holders.length > 1 ? `les parcours ${holders.map((h) => `« ${h.name} »`).join(", ")}` : `le parcours « ${rt.name} »`} : il en sera retiré${vols.length ? `, et ${vols.length} bénévole(s) seront remis à « non affecté » (fiches conservées)` : ""}.${holders.length > 1 ? "\n\nPour le retirer d'un seul parcours, décochez ce parcours dans « Commun à plusieurs parcours »." : ""}`)) return;
      for (const h of holders) writeRoute(h.id, (pois) => pois.filter((q) => q.id !== p.poiId));
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
    marks.current.forEach((x) => x.remove()); marks.current = []; markOf.current.clear();
    posts.forEach((p, i) => {
      if (p.lng == null || p.lat == null) return;
      const vols = volunteersAt(ev, p.id), need = Math.max(0, p.staffNeeded);
      const b = postMarkerEl(p.kind, postNumbers(ev).get(p.id)?.n ?? i + 1, `${vols.length}/${need}`, POST_STATUS[postStatus(ev, p)].color, sel === p.id, !!p.auto, `Poste ${i + 1} — ${p.name} (km ${p.km})${p.offTrackM ? `, à ${p.offTrackM} m du tracé` : ""} : ${vols.length ? vols.map((v) => v.name).join(", ") : "aucun bénévole"}${p.auto ? " — proposé, à vérifier" : ""}${postRaceIds(ev.posts.find((x) => x.id === p.id) ?? p).length > 1 ? " — commun à plusieurs parcours" : ""}. Glisser pour déplacer.`);
      if (postRaceIds(ev.posts.find((x) => x.id === p.id) ?? p).length > 1) { const ring = document.createElement("span"); ring.className = "absolute -bottom-1.5 -right-2 rounded-full border border-white bg-glacier-600 px-1 text-[9px] font-bold leading-[0.95rem] text-white shadow"; ring.textContent = `×${postRaceIds(ev.posts.find((x) => x.id === p.id) ?? p).length}`; ring.title = "Commun à plusieurs parcours"; b.append(ring); }
      // grand écran : la fiche du poste (à côté de la carte) est amenée en vue ; petit écran : la carte reste en place (la fiche est dessous)
      b.addEventListener("click", (e) => { e.stopPropagation(); setSel(p.id); if (window.matchMedia("(min-width: 1024px)").matches) setTimeout(() => document.getElementById(`post-${p.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50); });
      // orientation : le marqueur pivote autour de sa pointe (le point exact du poste), indépendamment de l'orientation de la carte
      b.style.transformOrigin = "50% 100%";
      const mk = new lib.Marker({ element: b, anchor: "bottom", draggable: true, rotation: p.rotation ?? 0, rotationAlignment: "viewport" }).setLngLat([p.lng, p.lat]).addTo(m);
      mk.on("dragend", () => { const ll = mk.getLngLat(); moveRef.current(p, ll.lng, ll.lat); });
      marks.current.push(mk); markOf.current.set(p.id, mk);
    });
  }, [posts, ev.volunteers, sel, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps
  // Poignée de rotation du poste sélectionné : la faire glisser autour de l'épingle pour l'orienter (pas de 5°)
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    const p = posts.find((x) => x.id === sel), mk = sel ? markOf.current.get(sel) : undefined;
    if (!p || !mk || p.lng == null || p.lat == null) return;
    const R = 54, place = (deg: number) => { const a = ((deg + 62) * Math.PI) / 180; return [R * Math.sin(a), -R * Math.cos(a)] as [number, number]; };
    const el = document.createElement("button"); el.type = "button"; el.dataset.rotate = "1"; el.title = "Faire pivoter le marqueur (glisser) — double-clic pour le redresser"; el.setAttribute("aria-label", `Faire pivoter le marqueur de ${p.name}`);
    el.className = "grid size-8 cursor-grab place-items-center rounded-full border-2 border-white bg-ink-950 text-white shadow-lift active:cursor-grabbing";
    el.style.touchAction = "none"; // au doigt : le geste fait tourner la poignée au lieu de faire défiler la page
    el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
    let deg = p.rotation ?? 0;
    const hm = new lib.Marker({ element: el, anchor: "center", offset: place(deg) }).setLngLat([p.lng, p.lat]).addTo(m);
    const stop = (e: Event) => { e.stopPropagation(); };
    const move = (e: PointerEvent) => {
      const r = m.getCanvas().getBoundingClientRect(), q = m.project(mk.getLngLat()), dx = e.clientX - r.left - q.x, dy = e.clientY - r.top - q.y;
      deg = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI - 62) / 5) * 5; deg = ((deg + 540) % 360) - 180;
      mk.setRotation(deg); hm.setOffset(place(deg));
    };
    // la bulle du poste est seulement masquée pendant la rotation (la fermer désélectionnerait le poste)
    const bubble = (show: boolean) => { const e = popup.current?.getElement(); if (e) e.style.visibility = show ? "" : "hidden"; };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); m.dragPan.enable(); bubble(true); if (deg !== (p.rotation ?? 0)) upd(p.id, { rotation: deg || undefined }); };
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); m.dragPan.disable(); bubble(false); window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up, { once: true }); });
    for (const t of ["mousedown", "touchstart", "click"]) el.addEventListener(t, stop);
    el.addEventListener("dblclick", (e) => { e.stopPropagation(); mk.setRotation(0); hm.setOffset(place(0)); deg = 0; upd(p.id, { rotation: undefined }); });
    return () => { hm.remove(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); m.dragPan.enable(); };
  }, [sel, posts, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const autoN = posts.filter((p) => p.auto).length;
  const propose = () => {
    const rt = routeNow(); if (!race || !rt) return;
    const { pois, posts: add } = proposeShared(eventsRepo.get(ev.id) ?? ev, race, rt, uid);
    if (!add.length) { setMsg("Rien à ajouter : tous les postes proposés existent déjà."); return; }
    save((e) => ({ ...e, posts: [...e.posts.filter((p) => !add.some((a) => a.id === p.id)), ...add] })); // postes d'abord (données d'organisation), puis POI du parcours
    writePois((ps) => [...ps, ...pois.filter((q) => !ps.some((x) => x.id === q.id))]);
    setMsg(`${add.length} poste(s) proposé(s), ajoutés aussi aux points d'intérêt du parcours : vérifiez chacun, glissez-le si besoin, puis confirmez.${ev.prep?.roads?.[race.id] ? "" : " Les signaleurs aux traversées de routes seront proposés après l'analyse des parcours."}`);
  };
  const geo = () => routesRepo.getAll().map((r) => ({ id: r.id, name: r.name, coords: r.coords }));
  /** Cartes PDF cadrées sur chaque parcours et tous ses postes, même fond que la carte affichée. */
  const exportMaps = async (all: boolean) => {
    if (!race || busy) return; setBusy("Préparation de la carte…");
    try { download(`${safeName(ev.name)}-${all ? "cartes-logistique" : `${safeName(race.label)}-carte`}.pdf`, await logisticsMapsPdf(eventsRepo.get(ev.id) ?? ev, all ? ev.races.filter((r) => r.routeId) : [race], geo(), { style: map.current?.getStyle(), progress: setBusy }), "application/pdf"); setMsg("Carte PDF téléchargée."); }
    catch { setMsg("Export de la carte impossible : le fond de carte n'a pas pu être chargé. Réessayez dans un instant."); } finally { setBusy(null); }
  };
  const exportVolunteers = async () => {
    if (busy) return; const cur = eventsRepo.get(ev.id) ?? ev; setBusy("Préparation des fiches…");
    try { download(`${safeName(ev.name)}-benevoles.pdf`, await volunteersPdf(cur, cur.volunteers, geo(), { style: map.current?.getStyle(), progress: setBusy }), "application/pdf"); setMsg("Tableau d'affectation et fiches bénévoles téléchargés."); }
    catch { setMsg("Export des fiches impossible."); } finally { setBusy(null); }
  };

  // postes au même endroit sur plusieurs courses : proposés à la mutualisation (une seule équipe)
  const candidates = commonCandidates(ev);
  const onTrack = useMemo(() => trackCandidates(ev, routes), [ev, routes]);
  /** Rend un poste commun aux courses dont il est sur le tracé (même POI, même équipe). */
  const shareOnTracks = (c: { post: Post; raceIds: string[]; routeIds: string[] }) => {
    const p = c.post, labels = c.raceIds.map((id) => ev.races.find((r) => r.id === id)?.label).join(", ");
    for (const rid of c.routeIds) setOnRoute(p, rid, true);
    setMsg(`« ${p.name} » est maintenant commun à ${labels} : visible sur chaque parcours, une seule équipe.`);
  };
  const mutualise = (g: Post[]) => {
    const vols = groupVolunteers(ev, g), labels = [...new Set(g.flatMap(postRaceIds).map((id) => ev.races.find((r) => r.id === id)?.label))].join(", ");
    if (!window.confirm(`Mutualiser « ${g[0].name} » pour ${labels} ?\n\nUn seul poste, une seule équipe : effectif retenu ${Math.max(...g.map((p) => p.staffNeeded))} bénévole(s) au lieu de ${g.reduce((s2, p) => s2 + p.staffNeeded, 0)}.${vols.length ? `\nLes ${vols.length} bénévole(s) déjà affecté(s) rejoignent le poste commun.` : ""}\nUne course peut être séparée ensuite.`)) return;
    if (isEndpoint(g[0].kind)) { save((e) => mergeEndpoints(e, g.map((p) => p.id))); setTimeout(() => syncEventsWithRoutes(), 0); }
    else { const plan = mergePoiPlan(eventsRepo.get(ev.id) ?? ev, routesRepo.getAll(), g.map((p) => p.id)); if (!plan) return; save(() => plan.ev); for (const [rid, pois] of plan.writes) writeRoute(rid, () => pois); }
    setMsg(`« ${g[0].name} » est maintenant un poste commun à ${labels} : une seule équipe, comptée une fois.`);
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
      <Button size="sm" variant="secondary" onClick={() => exportMaps(false)} disabled={!posts.length || !!busy} data-action="pdf-carte"><FileDown className="size-4" />Carte PDF</Button>
      {ev.races.filter((r) => r.routeId).length > 1 && <Button size="sm" variant="secondary" onClick={() => exportMaps(true)} disabled={!!busy} data-action="pdf-cartes"><FileDown className="size-4" />Cartes de toutes les courses</Button>}
      <Button size="sm" variant="secondary" onClick={exportVolunteers} disabled={!ev.volunteers.length || !!busy} data-action="pdf-benevoles"><FileDown className="size-4" />Fiches bénévoles PDF</Button>
      <Button size="sm" variant="secondary" onClick={() => download(`${safeName(ev.name)}-benevoles.csv`, volunteersCsv(eventsRepo.get(ev.id) ?? ev), "text/csv;charset=utf-8")} disabled={!ev.volunteers.length} data-action="csv-benevoles"><Sheet className="size-4" />Bénévoles CSV</Button>
      <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="size-4" />Imprimer</Button>
    </div>
  );
  const st = staffing(ev, race?.id), stAll = staffing(ev);
  const shown = posts.filter((p) => filter === "tous" || postStatus(ev, p) === filter);
  const nums = postNumbers(ev);
  const badge = (s: PostStatus, n: number, need: number) => <span className={clsx("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", s === "complet" ? "bg-pine-600 text-white" : s === "partiel" ? "bg-warn/15 text-[#8a5a00] ring-1 ring-warn/50" : s === "vide" ? "bg-danger text-white" : "bg-ink-100 text-ink-500")} data-status={s}>{s === "complet" ? <Check className="size-3" /> : s === "vide" ? <CircleAlert className="size-3" /> : s === "partiel" ? <CircleDashed className="size-3" /> : null}{POST_STATUS[s].label}{need > 0 ? ` ${n}/${need}` : ""}</span>;
  const seg = (by: Record<PostStatus, number>) => { const tot = by.complet + by.partiel + by.vide || 1; return <div className="flex h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden="true"><span className="bg-pine-600" style={{ width: `${(100 * by.complet) / tot}%` }} /><span className="bg-warn" style={{ width: `${(100 * by.partiel) / tot}%` }} /><span className="bg-danger" style={{ width: `${(100 * by.vide) / tot}%` }} /></div>; };
  const panel = (
    <div className="grid min-w-0 content-start gap-2.5">
      <section aria-label="État de la logistique" className="rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-100" data-staffing>
        <div className="flex items-end justify-between gap-2"><div><p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{race?.label ?? "Course"}</p><p className="font-display text-2xl font-bold leading-none">{st.covered}<span className="text-base text-ink-400">/{st.need}</span> <span className="text-sm font-semibold text-ink-600">bénévoles</span></p></div>
          <p className="text-right text-xs text-ink-500">{st.posts} postes<br />{st.missing ? <b className="text-danger">{st.missing} place(s) à pourvoir</b> : <b className="text-pine-700">Effectif complet</b>}</p></div>
        <div className="mt-2">{seg(st.by)}</div>
        <div role="group" aria-label="Filtrer les postes" className="mt-2 flex flex-wrap gap-1">{(["tous", "vide", "partiel", "complet"] as const).map((f) => { const n = f === "tous" ? posts.length : st.by[f]; return <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition", filter === f ? "bg-ink-950 text-white ring-ink-950" : "bg-white text-ink-700 ring-ink-200 hover:ring-ink-400")}>{f === "tous" ? "Tous" : POST_STATUS[f].label} · {n}</button>; })}</div>
        {ev.races.length > 1 && <p className="mt-2 border-t border-ink-100 pt-2 text-[11px] text-ink-600" data-staffing-all>Événement : <b>{stAll.covered}/{stAll.need}</b> bénévoles · {stAll.posts} postes{stAll.common ? <> · <b className="text-glacier-600">{stAll.common} commun(s)</b>, {stAll.mutualised} bénévole(s) mutualisé(s)</> : ""}{stAll.unassigned ? ` · ${stAll.unassigned} non affecté(s)` : ""}. Chaque bénévole compté une fois.</p>}
      </section>
      <ul className="flex max-h-[44rem] flex-col gap-2.5 overflow-y-auto p-0.5" aria-label="Postes de la course">
      {shown.map((p) => { const i = posts.indexOf(p), linked = !!p.poiId && hasRoute, endpoint = isEndpoint(p.kind) && hasRoute, vols = volunteersAt(ev, p.id), s = postStatus(ev, p), full = ev.posts.find((x) => x.id === p.id) ?? p, on = postRaceIds(full); return (
        <li key={p.id} id={`post-${p.id}`} aria-label={`Poste ${i + 1} — ${p.name}`} data-post-status={s} className={clsx("shrink-0 overflow-hidden rounded-2xl border-l-[5px] bg-white p-3 shadow-card ring-1", sel === p.id ? "ring-2 ring-pine-600" : "ring-ink-100", s === "complet" ? "border-l-pine-600" : s === "partiel" ? "border-l-warn" : s === "vide" ? "border-l-danger" : "border-l-ink-200")}>
          <div className="flex items-center gap-2"><button type="button" onClick={() => focus(p)} title="Voir sur la carte" aria-label={`Voir le poste ${i + 1} sur la carte`} className="relative shrink-0"><PostIcon kind={p.kind} size={30} /><span className="absolute -left-1.5 -top-1.5 grid min-w-[1.1rem] place-items-center rounded-full border border-white bg-ink-950 px-1 text-[10px] font-bold leading-4 text-white">{i + 1}</span></button>
            <input aria-label="Nom du poste" className="min-w-0 flex-1 rounded border border-transparent px-1 text-sm font-semibold hover:border-ink-200" value={draft[p.id] ?? p.name} onFocus={() => setSel(p.id)} onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))} onBlur={() => rename(p)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            {badge(s, vols.length, p.staffNeeded)}
            {endpoint ? (p.pinned ? <button type="button" className="shrink-0 rounded-lg px-1.5 py-1 text-xs font-semibold text-pine-700 underline" onClick={() => { upd(p.id, { pinned: undefined }); syncEventsWithRoutes(race?.routeId); setMsg(`${POST_KINDS[p.kind].label} recalé sur l'extrémité du parcours.`); }}>Recaler</button> : null)
              : <button aria-label="Supprimer le poste" className="grid size-7 shrink-0 place-items-center rounded hover:bg-ink-100" onClick={() => remove(p)}><Trash2 className="size-4" /></button>}</div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-10 text-xs text-ink-500">{POST_KINDS[p.kind].label} · km {p.km.toFixed(1).replace(".", ",")}
            {p.offTrackM ? <span className="rounded-full bg-glacier-100 px-2 py-0.5 font-semibold text-glacier-600">Hors tracé · {p.offTrackM} m</span> : null}
            {linked && <span className="rounded-full bg-pine-50 px-2 py-0.5 font-semibold text-pine-700" title="Nom, type et position partagés avec les points d'intérêt du parcours : une seule saisie">Partagé avec le parcours</span>}
            {endpoint && <span className="rounded-full bg-ink-50 px-2 py-0.5 font-semibold text-ink-600">{p.pinned ? "Déplacé à la main" : "Extrémité du parcours"}</span>}
            {p.auto && <><span className="rounded-full bg-brass-100 px-2 py-0.5 font-semibold text-brass-600">Proposé — à vérifier</span><button type="button" className="font-semibold text-pine-700 underline" onClick={() => upd(p.id, { auto: undefined })}>Confirmer</button></>}</p>
          {on.length > 1 && <div className="mt-1.5 ml-10 rounded-lg bg-glacier-100/60 px-2 py-1.5 text-xs text-glacier-600" data-common-races><b>Poste commun</b> — une seule équipe pour : {on.map((rid, k) => { const r = ev.races.find((x) => x.id === rid), km = rid === full.raceId ? full.km : full.shared?.find((x) => x.raceId === rid)?.km; return <span key={rid}>{k ? " · " : ""}<span className="whitespace-nowrap">{r?.label ?? "?"} (km {km != null ? km.toFixed(1).replace(".", ",") : "?"}){isEndpoint(full.kind) && rid !== full.raceId ? <button type="button" className="ml-1 font-semibold underline" onClick={() => { save((e) => splitEndpoint(e, full.id, rid)); setTimeout(() => syncEventsWithRoutes(), 0); setMsg(`${r?.label} a de nouveau son propre ${POST_KINDS[full.kind].label.toLowerCase()} ; l'équipe reste sur le poste commun.`); }} aria-label={`Séparer ${r?.label} de ce poste commun`}>séparer</button> : null}</span></span>; })}</div>}
          {linked && eventRoutes.length > 1 && (() => { const holders = routesWithPoi(routes, p.poiId!), isCommon = holders.length > 1 || !!holders[0]?.pois.find((q) => q.id === p.poiId)?.common; return (
            <div className="mt-2 rounded-xl bg-ink-50 p-2 text-xs">
              <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="size-4 accent-[var(--color-pine-600)]" checked={isCommon} onChange={(e) => setCommon(p, e.target.checked)} data-action="commun" />Commun à plusieurs parcours</label>
              {isCommon && <div className="mt-1.5 grid gap-1 pl-6" role="group" aria-label={`Parcours où figure « ${p.name} »`}>{eventRoutes.map((er) => { const has = holders.some((h) => h.id === er.routeId), only = has && holders.length === 1; return (
                <label key={er.routeId} className={clsx("flex items-center gap-2", only && "text-ink-500")} title={only ? "Dernier parcours de ce point : supprimez le poste pour le retirer" : undefined}><input type="checkbox" className="size-4 accent-[var(--color-pine-600)]" checked={has} disabled={only} onChange={(e) => setOnRoute(p, er.routeId, e.target.checked)} data-route={er.routeId} />{er.races.join(", ")} <span className="text-ink-500">· {er.name}</span></label>); })}</div>}
            </div>); })()}
          {/* équipe : qui est affecté, coordonnées, horaires, consignes ; places libres visibles */}
          <div className="mt-2 border-t border-ink-100 pt-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">Équipe {p.staffNeeded > 0 ? `· ${vols.length}/${p.staffNeeded}` : ""}</p>
            {vols.length > 0 && <ul className="mt-1 grid gap-1.5">{vols.map((v) => <li key={v.id} className="rounded-xl bg-pine-50/70 p-2 text-xs ring-1 ring-pine-100" data-volunteer={v.name}>
              <div className="flex items-start gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-pine-600 text-[11px] font-bold text-white" aria-hidden="true">{v.name.trim().slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1"><p className="font-semibold text-ink-900">{v.name}</p><p className="text-ink-600">{v.phone ? <a className="underline" href={`tel:${v.phone.replace(/\s/g, "")}`}>{v.phone}</a> : "pas de téléphone"}{v.from || v.to ? ` · ${v.from || "?"}–${v.to || "?"}` : ""}</p>
                  <p className="mt-0.5 text-ink-500">{POST_KINDS[p.kind].label} · {on.map((rid) => ev.races.find((x) => x.id === rid)?.label).join(" + ")}</p></div>
                <button type="button" aria-label={`Retirer ${v.name} de ce poste`} title="Retirer de ce poste (la fiche est conservée)" className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-pine-100" onClick={() => save((e) => assignVolunteer(e, v.id, ""))}><X className="size-3.5" /></button></div>
              {editIns === v.id ? <textarea autoFocus aria-label={`Consignes de ${v.name}`} rows={2} defaultValue={v.instructions} className="mt-1.5 w-full rounded-lg border border-ink-200 bg-white p-1.5 text-xs" onBlur={(e) => { const t = e.target.value; save((x) => ({ ...x, volunteers: x.volunteers.map((y) => (y.id === v.id ? { ...y, instructions: t } : y)) })); setEditIns(null); }} />
                : <button type="button" onClick={() => setEditIns(v.id)} className={clsx("mt-1.5 block w-full rounded-lg px-2 py-1 text-left", v.instructions ? "bg-white text-ink-700 ring-1 ring-ink-100" : "border border-dashed border-ink-200 text-ink-400")} aria-label={`Modifier les consignes de ${v.name}`}>{v.instructions ? <><b className="text-ink-500">Consignes : </b>{v.instructions}</> : "+ Ajouter des consignes"}</button>}
            </li>)}</ul>}
            {p.staffNeeded > vols.length && <div className="mt-1.5 flex flex-wrap gap-1" aria-label={`${p.staffNeeded - vols.length} place(s) libre(s)`}>{Array.from({ length: Math.min(8, p.staffNeeded - vols.length) }, (_, k) => <span key={k} className={clsx("rounded-lg border border-dashed px-2 py-0.5 text-[11px] font-semibold", s === "vide" ? "border-danger/50 text-danger" : "border-warn/60 text-[#8a5a00]")}>Place libre</span>)}{p.staffNeeded - vols.length > 8 ? <span className="text-[11px] text-ink-500">+{p.staffNeeded - vols.length - 8}</span> : null}</div>}
            {(() => { const others = ev.volunteers.filter((v) => v.postId !== p.id); return (
              <div className="mt-1.5 grid gap-1.5">
                {others.length > 0 && <select aria-label={`Affecter un bénévole existant au poste ${i + 1}`} className="h-8 w-full rounded border border-ink-200 bg-white px-1 text-xs" value="" onChange={(e) => { if (e.target.value) save((x) => assignVolunteer(x, e.target.value, p.id)); }}><option value="">Affecter un bénévole existant…</option>{others.map((v) => { const cur = v.postId ? nums.get(v.postId) : null; return <option key={v.id} value={v.id}>{v.name}{cur ? ` (actuellement poste ${cur.n}${ev.races.length > 1 && cur.race ? `, ${cur.race.label}` : ""})` : " (non affecté)"}</option>; })}</select>}
                <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const n = (newName[p.id] ?? "").trim(); if (!n) return; save((x) => addVolunteerAt(x, n, p.id, uid())); setNewName((q) => ({ ...q, [p.id]: "" })); }}>
                  <input aria-label={`Nom d'un nouveau bénévole pour le poste ${i + 1}`} placeholder="Nouveau bénévole (nom)" className="h-8 min-w-0 flex-1 rounded border border-ink-200 px-2 text-xs" value={newName[p.id] ?? ""} onChange={(e) => setNewName((q) => ({ ...q, [p.id]: e.target.value }))} />
                  <button type="submit" aria-label={`Ajouter ce bénévole au poste ${i + 1}`} className="grid size-8 shrink-0 place-items-center rounded border border-ink-200 hover:bg-ink-50 disabled:opacity-40" disabled={!(newName[p.id] ?? "").trim()}><UserPlus className="size-4" /></button></form>
              </div>); })()}
          </div>
          <details className="group mt-2 rounded-xl bg-ink-50/70 px-2 py-1.5 text-xs" open={sel === p.id}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-ink-600"><ChevronDown className="size-3.5 transition group-open:rotate-180" />Réglages du poste<span className="truncate font-normal text-ink-500">{[p.cutoffH != null ? `barrière ${p.cutoffH} h` : "", p.note ? `consignes : ${p.note}` : ""].filter(Boolean).join(" · ")}</span></summary>
            <div className="mt-2 grid grid-cols-3 gap-2">{hasRoute ? <span className="grid content-start gap-0.5"><span>Km</span><span className="flex h-8 items-center rounded bg-white px-1.5 font-semibold" title="Calculé sur le parcours">{p.km.toFixed(2).replace(".", ",")}</span></span> : <label>Km<input type="number" step="0.1" className="h-8 w-full rounded border border-ink-200 px-1" value={p.km} onChange={(e) => upd(p.id, { km: +e.target.value || 0 })} /></label>}
              <label>Barrière (h)<input type="number" step="0.25" min={0} className="h-8 w-full rounded border border-ink-200 px-1" value={p.cutoffH ?? ""} onChange={(e) => upd(p.id, { cutoffH: e.target.value === "" ? undefined : +e.target.value })} /></label>
              <label>Bénévoles requis<input type="number" min={0} className="h-8 w-full rounded border border-ink-200 px-1" value={p.staffNeeded} onChange={(e) => upd(p.id, { staffNeeded: +e.target.value || 0 })} /></label></div>
            <div className="mt-2 flex flex-wrap items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2">Orientation sur la carte<input type="range" min={-180} max={180} step={5} aria-label={`Orientation du marqueur de ${p.name}`} className="min-w-0 flex-1 accent-[var(--color-pine-600)]" value={p.rotation ?? 0} onChange={(e) => upd(p.id, { rotation: +e.target.value || undefined })} /><span className="w-10 text-right font-semibold tabular-nums">{p.rotation ?? 0}°</span></label>
              {p.rotation ? <button type="button" className="rounded-lg px-2 py-1 font-semibold text-pine-700 underline" onClick={() => upd(p.id, { rotation: undefined })}>Redresser</button> : null}</div>
            <input aria-label="Consignes du poste" placeholder="Consignes du poste, matériel…" className="mt-2 h-8 w-full rounded border border-ink-200 px-2 text-xs" value={p.note} onChange={(e) => upd(p.id, { note: e.target.value })} />
          </details>
        </li>); })}
      {!posts.length && <li className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">Aucun poste pour cette course.</li>}
      {posts.length > 0 && !shown.length && <li className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">Aucun poste « {filter !== "tous" ? POST_STATUS[filter].label : ""} » sur cette course.</li>}
      </ul>
    </div>
  );
  const hint = msg ?? (hasRoute ? `Choisissez un type puis cliquez sur la carte : près du tracé, le poste s'aimante sur la trace ; plus loin (parking, secours sur accès véhicule…), il reste où vous cliquez. Glissez un marqueur pour l'ajuster. Chaque poste est aussi un point d'intérêt du parcours « ${route!.name} » : une seule saisie, visible des deux côtés.` : "Liez un parcours à cette course pour placer les postes sur le tracé et les partager avec lui.");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {tools}
      {counts.length > 0 && <ul aria-label="Équipements et postes sur la carte" className="flex flex-wrap gap-1.5 text-xs">{counts.map(([k, n]) => <li key={k} className="inline-flex items-center gap-1 rounded-full bg-white py-0.5 pl-0.5 pr-2.5 font-semibold text-ink-700 ring-1 ring-ink-100"><PostIcon kind={k} size={18} />{POST_KINDS[k].label} · {n}</li>)}</ul>}
      {(candidates.length > 0 || onTrack.length > 0) && <section aria-label="Postes communs détectés" className="rounded-2xl border border-glacier-500/40 bg-glacier-100/60 p-3" data-candidates>
        <p className="flex items-center gap-2 text-sm font-bold text-ink-900"><Users className="size-4 text-glacier-600" />{candidates.length + onTrack.length} poste(s) commun(s) possible(s) entre vos courses</p>
        <p className="text-xs text-ink-600">Mutualisez-les : une seule équipe de bénévoles, comptée une fois dans les effectifs, visible sur chaque parcours.</p>
        <ul className="mt-2 grid gap-1.5">{candidates.map((g) => <li key={g.map((p) => p.id).join()} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 text-xs ring-1 ring-ink-100"><PostIcon kind={g[0].kind} size={22} /><span className="min-w-0 flex-1"><b>{g[0].name}</b> — {g.map((p) => `${ev.races.find((r) => r.id === p.raceId)?.label} (${p.staffNeeded})`).join(" · ")} <span className="text-ink-500">= {g.reduce((s2, p) => s2 + p.staffNeeded, 0)} bénévoles comptés</span></span><Button size="sm" onClick={() => mutualise(g)} data-action="mutualiser">Mutualiser · {Math.max(...g.map((p) => p.staffNeeded))} bénévoles</Button></li>)}
          {onTrack.map((c) => <li key={c.post.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 text-xs ring-1 ring-ink-100"><PostIcon kind={c.post.kind} size={22} /><span className="min-w-0 flex-1"><b>{c.post.name}</b> ({postRaceIds(c.post).map((id) => ev.races.find((r) => r.id === id)?.label).join(", ")}) est aussi sur le tracé de <b>{c.raceIds.map((id) => ev.races.find((r) => r.id === id)?.label).join(", ")}</b></span><Button size="sm" variant="secondary" onClick={() => shareOnTracks(c)} data-action="rendre-commun">Rendre commun</Button></li>)}</ul>
      </section>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          {/* carte de travail : la molette zoome directement (sans clic) ; sur écran tactile, deux doigts pour la déplacer, la page reste défilable */}
          <div data-workspace="touch" className="relative h-[min(72vh,44rem)] min-h-[22rem] overflow-hidden rounded-2xl shadow-card ring-1 ring-ink-100"><div className="absolute inset-0"><div ref={el} className="size-full" role="application" aria-label="Carte logistique : molette pour zoomer, cliquez pour placer un poste, glissez un poste pour le déplacer" /></div><LayerControl map={map} ready={ready} /></div>
          <p className="mt-1.5 text-[11px] text-ink-500"><span className="hidden [@media(pointer:fine)]:inline">Molette : zoomer · glisser : déplacer · clic droit + glisser : tourner et incliner · boussole : revenir au nord · poste sélectionné : poignée ⟳ pour orienter son marqueur.</span><span className="[@media(pointer:fine)]:hidden">Deux doigts : déplacer et zoomer · pincer-tourner : orienter · boussole : revenir au nord · touchez un poste puis faites glisser sa poignée ⟳ pour l'orienter.</span></p>
          <p className="mt-1 text-xs text-ink-500" aria-live="polite">{busy ? <span className="inline-flex items-center gap-1.5 font-semibold text-pine-700"><Loader2 className="size-3.5 animate-spin" />{busy}</span> : hint}</p>
          <div className="mt-2">{actions}</div>
        </div>
        {panel}
      </div>
    </div>
  );
}

export function Volunteers({ ev, save }: P) {
  const empty = { name: "", phone: "", email: "", postId: "", from: "", to: "", instructions: "" };
  const [f, setF] = useState(empty);
  const [nameErr, setNameErr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editIns, setEditIns] = useState<string | null>(null);
  const add = (e: React.FormEvent) => { e.preventDefault(); if (!filled(f.name)) { setNameErr(true); return; } setNameErr(false); save((x) => ({ ...x, volunteers: [...x.volunteers, { id: uid(), ...f, name: f.name.trim(), email: f.email.trim() || undefined }] })); setF(empty); };
  const geo = () => routesRepo.getAll().map((r) => ({ id: r.id, name: r.name, coords: r.coords }));
  const pdf = async (vols: Volunteer[], name: string) => { if (busy) return; setBusy("Préparation…"); try { download(`${safeName(ev.name)}-${name}.pdf`, await volunteersPdf(eventsRepo.get(ev.id) ?? ev, vols, geo(), { progress: setBusy }), "application/pdf"); } finally { setBusy(null); } };
  const nums = postNumbers(ev), sorted = [...ev.posts].sort((a, b) => (ev.races.findIndex((r) => r.id === a.raceId) - ev.races.findIndex((r) => r.id === b.raceId)) || ((nums.get(a.id)?.n ?? 0) - (nums.get(b.id)?.n ?? 0)));
  const st = staffing(ev), raceNames = (p: Post) => postRaceIds(p).map((id) => ev.races.find((r) => r.id === id)?.label).filter(Boolean).join(" + ");
  const list = ev.volunteers.filter((v) => !q.trim() || `${v.name} ${v.phone} ${v.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={add} noValidate className="grid content-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100"><h2 className="font-bold">Nouvelle fiche bénévole</h2><RequiredLegend />
        <Field l="Nom" required error={nameErr && !filled(f.name) ? "Le nom du bénévole est obligatoire." : null}><input required aria-invalid={nameErr && !filled(f.name)} className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field l="Téléphone"><input type="tel" className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field l="E-mail"><input type="email" className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
        <Field l="Poste"><select className={inp} value={f.postId} onChange={(e) => setF({ ...f, postId: e.target.value })}><option value="">Non affecté</option>{sorted.map((p) => <option key={p.id} value={p.id}>{postLabel(ev, p)}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2"><Field l="De"><input type="time" className={inp} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field><Field l="À"><input type="time" className={inp} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field></div>
        <Field l="Consignes"><textarea rows={3} className="rounded-lg border border-ink-200 p-2 text-sm" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
        <Button type="submit" variant="brand"><Plus className="size-4" />Ajouter</Button></form>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold"><Users className="size-5" />{ev.volunteers.length} bénévole(s)</h2>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={!ev.volunteers.length || !!busy} onClick={() => pdf(ev.volunteers, "benevoles")} data-action="pdf-benevoles">{busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}{busy ?? "Affectations et fiches (PDF)"}</Button>
            <Button size="sm" variant="secondary" disabled={!ev.volunteers.length} onClick={() => download(`${safeName(ev.name)}-benevoles.csv`, volunteersCsv(eventsRepo.get(ev.id) ?? ev), "text/csv;charset=utf-8")} data-action="csv-benevoles"><Sheet className="size-4" />Exporter (CSV)</Button></div></div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Effectifs de l'événement" data-staffing-all>{([[`${st.covered}/${st.need}`, "places pourvues", st.missing ? "text-danger" : "text-pine-700"], [String(st.missing), "à trouver", st.missing ? "text-danger" : "text-pine-700"], [String(st.unassigned), "non affecté(s)", st.unassigned ? "text-[#8a5a00]" : "text-ink-500"], [String(st.mutualised), "mutualisé(s) (postes communs)", "text-glacier-600"]] as const).map(([n, l, c]) => <div key={l} className="rounded-xl bg-white p-2.5 ring-1 ring-ink-100"><p className={clsx("font-display text-xl font-bold", c)}>{n}</p><p className="text-[11px] text-ink-500">{l}</p></div>)}</div>
        {ev.volunteers.length > 4 && <input type="search" aria-label="Rechercher un bénévole" placeholder="Rechercher (nom, téléphone, e-mail)…" className={clsx(inp, "mb-3")} value={q} onChange={(e) => setQ(e.target.value)} />}
        <ul className="grid gap-2">{list.map((v) => { const p = ev.posts.find((x) => x.id === v.postId), s = p ? postStatus(ev, p) : null; return (
          <li key={v.id} data-volunteer-card={v.name} className={clsx("rounded-xl border-l-[5px] bg-white p-3 ring-1 ring-ink-100", !p ? "border-l-warn" : s === "complet" ? "border-l-pine-600" : s === "partiel" ? "border-l-warn" : "border-l-danger")}>
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-pine-600 text-sm font-bold text-white" aria-hidden="true">{v.name.trim().slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="font-semibold">{v.name}</p><p className="text-xs text-ink-500">{v.phone ? <a className="underline" href={`tel:${v.phone.replace(/\s/g, "")}`}>{v.phone}</a> : "pas de téléphone"}{v.email ? <> · <a className="underline" href={`mailto:${v.email}`}>{v.email}</a></> : ""} · {v.from || "?"}–{v.to || "?"}</p>
                {p ? <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm"><PostIcon kind={p.kind} size={20} /><b>Poste {nums.get(p.id)?.n} — {p.name}</b><span className="text-xs text-ink-500">{POST_KINDS[p.kind].label} · {raceNames(p)}</span>{s && <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", s === "complet" ? "bg-pine-50 text-pine-700" : s === "partiel" ? "bg-warn/15 text-[#8a5a00]" : "bg-danger/10 text-danger")}>{POST_STATUS[s].label} {volunteersAt(ev, p.id).length}/{p.staffNeeded}</span>}</p>
                  : <p className="mt-1 text-sm font-semibold text-[#8a5a00]">Non affecté</p>}</div>
              <div className="flex flex-wrap items-center gap-1">
                <label className="flex items-center gap-1.5 text-xs font-medium"><span className="sr-only">Poste</span><select aria-label={`Poste de ${v.name}`} className={clsx("h-9 max-w-[15rem] rounded-lg border bg-white px-2 text-sm", p ? "border-ink-200" : "border-warn/60")} value={p ? v.postId : ""} onChange={(e) => save((x) => assignVolunteer(x, v.id, e.target.value))}><option value="">Non affecté</option>{sorted.map((qq) => <option key={qq.id} value={qq.id}>{postLabel(ev, qq)}</option>)}</select></label>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => pdf([v], safeName(v.name))}><FileDown className="size-4" />Fiche</Button><Button size="sm" variant="ghost" aria-label={`Supprimer la fiche de ${v.name}`} onClick={() => confirm(`Supprimer la fiche de ${v.name} ?`) && save((x) => ({ ...x, volunteers: x.volunteers.filter((y) => y.id !== v.id) }))}><Trash2 className="size-4" /></Button></div>
            </div>
            {editIns === v.id ? <textarea autoFocus aria-label={`Consignes de ${v.name}`} rows={2} defaultValue={v.instructions} className="mt-2 w-full rounded-lg border border-ink-200 p-2 text-sm" onBlur={(e) => { const t = e.target.value; save((x) => ({ ...x, volunteers: x.volunteers.map((y) => (y.id === v.id ? { ...y, instructions: t } : y)) })); setEditIns(null); }} />
              : <button type="button" onClick={() => setEditIns(v.id)} aria-label={`Modifier les consignes de ${v.name}`} className={clsx("mt-2 block w-full rounded-lg px-3 py-1.5 text-left text-sm", v.instructions || p?.note ? "bg-brass-100/50 text-ink-800" : "border border-dashed border-ink-200 text-ink-400")}>{v.instructions ? <><b className="text-ink-600">Consignes : </b>{v.instructions}</> : "+ Ajouter des consignes"}{p?.note ? <span className="mt-0.5 block text-xs text-ink-600"><b>Poste : </b>{p.note}</span> : null}</button>}
          </li>); })}</ul>
        {ev.posts.length > 0 && <div className="mt-5 rounded-xl bg-ink-50 p-3"><p className="mb-2 text-sm font-semibold">Couverture des postes <span className="font-normal text-ink-500">(postes communs comptés une fois)</span></p><ul className="grid gap-1 text-sm">{sorted.map((p) => { const s = postStatus(ev, p), n = volunteersAt(ev, p.id).length; return <li key={p.id} className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: POST_STATUS[s].color }} aria-hidden="true" /><span className="truncate">{postLabel(ev, p)}</span></span><span className={clsx("shrink-0 font-semibold", s === "complet" ? "text-pine-700" : s === "partiel" ? "text-[#8a5a00]" : s === "vide" ? "text-danger" : "text-ink-400")}>{n} / {p.staffNeeded}</span></li>; })}</ul></div>}
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
        <p className="mt-1 max-w-xl text-sm text-white/70">Grande carte (molette pour zoomer), placement au clic, déplacement par glisser-déposer, bénévoles et temps de passage. Les points d&apos;intérêt des parcours y apparaissent d&apos;eux-mêmes ; ce que vous y ajoutez est repris dans les parcours.</p></div>
        <ButtonLink href={logisticsHref(ev.id)} size="lg" data-action="ouvrir-logistique"><MapPinned className="size-5" />Ouvrir la logistique<ArrowRight className="size-4" /></ButtonLink></div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">{ev.races.map((r) => { const ps = postsOfRace(ev.posts, r.id), rt = routes.find((x) => x.id === r.routeId), need = ps.reduce((s, p) => s + p.staffNeeded, 0), got = ps.reduce((s, p) => s + Math.min(p.staffNeeded, volunteersAt(ev, p.id).length), 0), auto = ps.filter((p) => p.auto).length; return (
        <li key={r.id} className="rounded-xl bg-white/10 p-3 text-sm"><p className="font-semibold">{r.label}{rt ? <span className="font-normal text-white/60"> · {rt.name}</span> : <span className="text-warn"> · sans parcours</span>}</p>
          <p className="mt-1 flex flex-wrap gap-1.5">{(Object.keys(POST_KINDS) as PostKind[]).map((k) => [k, ps.filter((p) => p.kind === k).length] as const).filter(([, n]) => n).map(([k, n]) => <span key={k} className="inline-flex items-center gap-1 rounded-full bg-white/90 py-0.5 pl-0.5 pr-2 text-xs font-semibold text-ink-800"><PostIcon kind={k} size={16} />{n}</span>)}</p>
          <p className="mt-1 text-xs text-white/70">{ps.length} poste(s) · bénévoles {got}/{need}{auto ? ` · ${auto} proposé(s) à vérifier` : ""}</p></li>); })}</ul>
      {(() => { const st = staffing(ev); return <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm" data-staffing-all>Total de l&apos;événement : <b>{st.covered}/{st.need}</b> bénévoles · {st.posts} postes{st.common ? <> · <b className="text-brass-400">{st.common} poste(s) commun(s)</b> ({st.mutualised} bénévole(s) mutualisé(s))</> : ""}{st.unassigned ? ` · ${st.unassigned} non affecté(s)` : ""}. Les postes communs à plusieurs courses et chaque bénévole sont comptés une seule fois.</p>; })()}
    </div>
  );
}

/** Page dédiée à la préparation logistique d'un événement. */
export function LogisticsPage({ id }: { id: string }) {
  const ev = eventsRepo.useAll().find((e) => e.id === id);
  const [sub, setSub] = useState<"postes" | "benevoles" | "passages">("postes");
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
        {sub === "postes" && <Logistics ev={ev} save={save} />}
        {sub === "benevoles" && <Volunteers ev={ev} save={save} />}
        {sub === "passages" && <Passages ev={ev} />}
      </div>
    </div>
  );
}
