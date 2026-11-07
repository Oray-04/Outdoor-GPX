"use client";
import { Field, RequiredLegend, filled } from "@/components/ui/field";
import { LocationFields } from "@/components/ui/location-fields";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import { ArrowLeft, Plus, Trash2, FileDown, Printer, Users, Eye } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { AnalysisTab } from "./analysis-tab";
import { Button } from "@/components/ui/button";
import { collectionsRepo, eventsRepo, routesRepo } from "@/lib/repo";
import { cloudEnabled } from "@/lib/cloud";
import { collectionHref } from "@/lib/url";
import { POST_KINDS, ROLES, passageTable, positionOnTrack, type EventModel, type Member, type Post, type PostKind, type Race, type Role, type Volunteer } from "@/lib/events";
import { SPORTS, estimateMinutes, type Sport } from "@/lib/sports";
import { trackStats, bboxOf } from "@/lib/geo";
import { download, safeName } from "@/lib/formats";
import { passagePdf, volunteersPdf, mapPdf } from "@/lib/pdf";
import { uid } from "@/lib/types";
import { eventHref } from "@/lib/url";

type Tab = "infos" | "courses" | "logistique" | "benevoles" | "passages" | "analyse" | "equipe";
const TABS: [Tab, string][] = [["infos", "Infos"], ["courses", "Courses"], ["logistique", "Logistique"], ["benevoles", "Bénévoles"], ["passages", "Temps de passage"], ["analyse", "Analyse cadastrale"], ["equipe", "Équipe"]];
const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";

export function OrganizerEvent({ id }: { id: string }) {
  const ev = eventsRepo.useAll().find((e) => e.id === id);
  const [tab, setTab] = useState<Tab>("infos");
  if (!ev) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-3xl font-bold">Événement introuvable</h1><p className="mt-2 text-ink-600">Les événements sont enregistrés sur cet appareil.</p><Link href="/organisateurs" className="mt-6 inline-block font-semibold text-pine-700 underline">Retour</Link></div>;
  const save = (fn: (e: EventModel) => EventModel) => eventsRepo.upsert(fn(ev));
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/organisateurs" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Espace organisateurs</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold sm:text-3xl">{ev.name}</h1><Link href={eventHref(ev.id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold hover:bg-ink-50"><Eye className="size-4" />Voir la page publique</Link></div>
      <div className="mt-4 flex overflow-x-auto border-b border-ink-100" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("shrink-0 px-4 py-2.5 text-sm font-semibold", tab === k ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}>{l}</button>)}</div>
      <div className="mt-6">
        {tab === "infos" && <Infos ev={ev} save={save} />}
        {tab === "courses" && <Races ev={ev} save={save} />}
        {tab === "logistique" && <Logistics ev={ev} save={save} />}
        {tab === "benevoles" && <Volunteers ev={ev} save={save} />}
        {tab === "passages" && <Passages ev={ev} />}
        {tab === "analyse" && <AnalysisTab ev={ev} />}
        {tab === "equipe" && <Team ev={ev} save={save} />}
      </div>
    </div>
  );
}
type P = { ev: EventModel; save: (fn: (e: EventModel) => EventModel) => void };

function Infos({ ev, save }: P) {
  const set = (k: keyof EventModel, v: string) => save((e) => ({ ...e, [k]: v }));
  // Nom, organisateur, date et lieu sont obligatoires : on les garde en brouillon et on n'enregistre que des valeurs renseignées (la dernière valeur valide reste en base)
  const [d, setD] = useState({ name: ev.name, organizer: ev.organizer, date: ev.date, place: ev.place });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const edit = (k: "name" | "organizer" | "date" | "place", v: string) => { setD((x) => ({ ...x, [k]: v })); setTouched((t) => ({ ...t, [k]: true })); if (filled(v)) set(k, v); };
  const err = (k: "name" | "organizer" | "date" | "place", label: string) => (touched[k] && !filled(d[k]) ? `${label} est obligatoire : la dernière valeur enregistrée est conservée.` : null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RequiredLegend className="md:col-span-2" />
      <Field l="Nom" required error={err("name", "Le nom")}><input required aria-invalid={!!err("name", "")} className={inp} value={d.name} onChange={(e) => edit("name", e.target.value)} /></Field>
      <Field l="Organisateur" required error={err("organizer", "L'organisateur")}><input required aria-invalid={!!err("organizer", "")} className={inp} value={d.organizer} onChange={(e) => edit("organizer", e.target.value)} /></Field>
      <Field l="Date" required error={err("date", "La date")}><input required aria-invalid={!!err("date", "")} type="date" className={inp} value={d.date} onChange={(e) => edit("date", e.target.value)} /></Field>
      <LocationFields place={d.place} region={ev.region} onChange={(v) => { if (v.region !== ev.region) set("region", v.region); edit("place", v.place); }} placeRequired placeError={err("place", "Le lieu")} />
      <Field l="Lien d'inscription (https://…)"><input className={inp} value={ev.registrationUrl} onChange={(e) => set("registrationUrl", e.target.value)} placeholder="https://" /></Field>
      <div className="md:col-span-2"><Field l="Description"><textarea rows={4} className="rounded-lg border border-ink-200 p-3 text-sm" value={ev.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
      <Field l="Informations pratiques"><textarea rows={5} className="rounded-lg border border-ink-200 p-3 text-sm" value={ev.practical} onChange={(e) => set("practical", e.target.value)} placeholder="Retrait des dossards, parkings, douches…" /></Field>
      <Field l="Règlement"><textarea rows={5} className="rounded-lg border border-ink-200 p-3 text-sm" value={ev.rules} onChange={(e) => set("rules", e.target.value)} /></Field>
      <Publication ev={ev} save={save} />
      <p className="text-xs text-ink-500 md:col-span-2">Enregistrement automatique sur cet appareil.</p>
    </div>
  );
}

function Publication({ ev, save }: P) {
  const routes = routesRepo.useAll();
  const cols = collectionsRepo.useAll();
  const linked = [...new Set(ev.races.map((r) => r.routeId).filter((x): x is string => !!x))];
  const priv = linked.map((id) => routes.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r && r.visibility !== "public");
  const col = cols.find((c) => c.id === ev.collectionId);
  const makePublic = () => priv.forEach((r) => routesRepo.upsert({ ...r, visibility: "public", updatedAt: Date.now() }));
  const createCollection = () => {
    const id = uid();
    collectionsRepo.upsert({ id, name: `Parcours — ${ev.name}`, description: `Tous les parcours de ${ev.name}.`, routeIds: linked, visibility: ev.visibility === "public" ? "public" : "prive", eventId: ev.id });
    save((e) => ({ ...e, collectionId: id }));
  };
  const field = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
  return (
    <section className="grid gap-3 rounded-xl border border-ink-100 p-4 md:col-span-2" aria-label="Publication">
      <h3 className="font-bold">Publication</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field l="Visibilité de l'événement"><select className={field} value={ev.visibility ?? "prive"} onChange={(e) => save((x) => ({ ...x, visibility: e.target.value as "prive" | "public" }))}><option value="prive">Privé (visible seulement ici)</option><option value="public">Public (calendrier et page de l'événement)</option></select></Field>
        <div className="grid gap-1 text-sm font-medium"><span>Collection de parcours</span>
          {col ? <div className="flex items-center gap-2"><span className="flex-1 truncate rounded-lg bg-ink-50 px-3 py-2 text-sm">{col.name} · {col.visibility === "public" ? "publique" : "privée"}</span><Link className="text-sm font-semibold text-pine-700 underline" href={collectionHref(col.id)}>Voir</Link></div>
            : <Button type="button" variant="secondary" disabled={!linked.length} onClick={createCollection}>Créer la collection de l'événement</Button>}
        </div>
      </div>
      {ev.visibility === "public" && priv.length > 0 && (
        <div role="alert" className="rounded-lg bg-warn/10 p-3 text-sm">
          <p className="font-semibold">Ces parcours liés sont encore privés : les visiteurs ne verront pas leur tracé.</p>
          <ul className="mt-1 list-disc pl-5">{priv.map((r) => <li key={r.id}>{r.name}</li>)}</ul>
          <Button size="sm" variant="brand" className="mt-2" onClick={makePublic}>Rendre ces parcours publics</Button>
        </div>
      )}
      <p className="text-xs text-ink-500">{cloudEnabled ? "Les contenus publics sont publiés à la prochaine synchronisation (quelques secondes). Seules les informations de la page publique sont partagées : jamais les bénévoles, l'équipe ni la logistique." : "Le mode public prendra effet quand les comptes seront activés (guide dans docs/supabase.md). Pour l'instant, seul cet appareil voit l'événement."}</p>
    </section>
  );
}

function Races({ ev, save }: P) {
  const routes = routesRepo.useAll();
  const upd = (id: string, patch: Partial<Race>) => save((e) => ({ ...e, races: e.races.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const add = () => save((e) => ({ ...e, races: [...e.races, { id: uid(), label: `Course ${e.races.length + 1}`, sport: "trail", distanceKm: 10, gainM: 300, startTime: "08:00", maxHours: 4 }] }));
  const link = (raceId: string, routeId: string) => {
    if (!routeId) { upd(raceId, { routeId: undefined }); return; }
    const r = routes.find((x) => x.id === routeId); if (!r) return;
    const s = trackStats(r.coords, 3);
    upd(raceId, { routeId, distanceKm: +(s.distanceM / 1000).toFixed(1), gainM: Math.round(s.gainM), sport: r.sport });
  };
  return (
    <div className="grid gap-4">
      {ev.races.map((r) => (
        <article key={r.id} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:grid-cols-6">
          <div className="sm:col-span-2"><Field l="Nom du format"><input className={inp} value={r.label} onChange={(e) => upd(r.id, { label: e.target.value })} /></Field></div>
          <Field l="Discipline"><select className={inp} value={r.sport} onChange={(e) => upd(r.id, { sport: e.target.value as Sport })}>{Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
          <Field l="Distance (km)"><input type="number" min={0} step="0.1" className={inp} value={r.distanceKm} onChange={(e) => upd(r.id, { distanceKm: +e.target.value || 0 })} /></Field>
          <Field l="D+ (m)"><input type="number" min={0} className={inp} value={r.gainM} onChange={(e) => upd(r.id, { gainM: +e.target.value || 0 })} /></Field>
          <Field l="Départ"><input type="time" className={inp} value={r.startTime} onChange={(e) => upd(r.id, { startTime: e.target.value })} /></Field>
          <Field l="Temps limite (h)"><input type="number" min={0} step="0.5" className={inp} value={r.maxHours} onChange={(e) => upd(r.id, { maxHours: +e.target.value || 0 })} /></Field>
          <div className="sm:col-span-3"><Field l="Parcours lié (vos parcours enregistrés)"><select className={inp} value={r.routeId ?? ""} onChange={(e) => link(r.id, e.target.value)}><option value="">Aucun</option>{routes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
          <div className="sm:col-span-2"><Field l="Tarif / note"><input className={inp} value={r.fee ?? ""} onChange={(e) => upd(r.id, { fee: e.target.value })} /></Field></div>
          <div className="flex items-end justify-end"><Button variant="ghost" size="sm" aria-label="Supprimer la course" onClick={() => confirm("Supprimer cette course et ses postes ?") && save((e) => ({ ...e, races: e.races.filter((x) => x.id !== r.id), posts: e.posts.filter((p) => p.raceId !== r.id) }))}><Trash2 className="size-4" /></Button></div>
        </article>))}
      <div><Button variant="brand" onClick={add}><Plus className="size-4" />Ajouter une course / variante</Button>{!routes.length && <p className="mt-2 text-xs text-ink-500">Astuce : créez ou importez d'abord un parcours pour le lier à une course (distance et D+ sont alors repris automatiquement).</p>}</div>
    </div>
  );
}

function Logistics({ ev, save }: P) {
  const routes = routesRepo.useAll();
  const [raceId, setRaceId] = useState(ev.races[0]?.id ?? "");
  const [kind, setKind] = useState<PostKind>("ravito");
  const [msg, setMsg] = useState<string | null>(null);
  const race = ev.races.find((r) => r.id === raceId) ?? ev.races[0];
  const route = race?.routeId ? routes.find((r) => r.id === race.routeId) : undefined;
  const posts = useMemo(() => ev.posts.filter((p) => p.raceId === race?.id).sort((a, b) => a.km - b.km), [ev.posts, race]);
  const { el, map, ml, ready } = useMap({ preserveBuffer: true });
  const marks = useRef<Marker[]>([]);
  const clickRef = useRef<(lng: number, lat: number) => void>(() => {});

  clickRef.current = (lng, lat) => {
    if (!race) return;
    let km = 0, plng = lng, plat = lat;
    if (route) {
      const pos = positionOnTrack(route.coords, lng, lat);
      if (pos.offTrackM > 250) { setMsg("Cliquez plus près du tracé pour que le kilomètre soit calculé."); return; }
      km = +pos.km.toFixed(2); plng = route.coords[pos.index][0]; plat = route.coords[pos.index][1];
    } else setMsg("Course sans parcours lié : kilomètre à saisir à la main.");
    const n = posts.filter((p) => p.kind === kind).length + 1;
    const post: Post = { id: uid(), raceId: race.id, kind, name: `${POST_KINDS[kind].label} ${n}`, km, lng: plng, lat: plat, staffNeeded: kind === "ravito" ? 4 : 2, note: "" };
    save((e) => ({ ...e, posts: [...e.posts, post] }));
  };

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    const h = (e: { lngLat: { lng: number; lat: number } }) => clickRef.current(e.lngLat.lng, e.lngLat.lat);
    m.on("click", h); return () => { m.off("click", h); };
  }, [ready, map]);

  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    if (!m.getSource("rt")) {
      m.addSource("rt", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "rt-c", type: "line", source: "rt", paint: { "line-color": "#fff", "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });
      m.addLayer({ id: "rt-l", type: "line", source: "rt", paint: { "line-color": "#f0612b", "line-width": 4 }, layout: { "line-cap": "round", "line-join": "round" } });
    }
    (m.getSource("rt") as GeoJSONSource).setData({ type: "FeatureCollection", features: route ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coords.map((c) => [c[0], c[1]]) } }] : [] });
    if (route) { const b = bboxOf(route.coords); m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, duration: 0, maxZoom: 15 }); }
  }, [route, ready, map, ml]);

  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    marks.current.forEach((x) => x.remove()); marks.current = [];
    posts.forEach((p, i) => {
      if (p.lng == null || p.lat == null) return;
      const d = document.createElement("div"); d.className = "grid size-6 place-items-center rounded-full border-2 border-white text-[11px] font-bold text-white shadow"; d.style.background = POST_KINDS[p.kind].color; d.textContent = String(i + 1); d.title = `${p.name} — km ${p.km}`;
      marks.current.push(new lib.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(m));
    });
  }, [posts, ready, map, ml]);

  const upd = (id: string, patch: Partial<Post>) => save((e) => ({ ...e, posts: e.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const exportMap = async () => {
    const m = map.current; if (!m || !race) return;
    try {
      m.triggerRepaint(); await new Promise((r) => requestAnimationFrame(() => r(null)));
      const c = m.getCanvas(); const k = c.width / c.clientWidth;
      const pins = posts.flatMap((p, i) => (p.lng == null || p.lat == null ? [] : [{ n: i + 1, ...(() => { const q = m.project([p.lng!, p.lat!]); return { x: q.x * k, y: q.y * k }; })(), color: POST_KINDS[p.kind].color, label: `${p.name} (km ${p.km.toFixed(1)})` }]));
      download(`${safeName(ev.name)}-${safeName(race.label)}-carte.pdf`, await mapPdf(ev, race, c.toDataURL("image/png"), c.width, c.height, pins), "application/pdf");
    } catch { setMsg("Export de la carte impossible."); }
  };

  if (!ev.races.length) return <p className="rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Ajoutez d'abord une course dans l'onglet « Courses ».</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <select aria-label="Course" className="h-9 rounded-lg border border-ink-200 bg-white px-2 text-sm" value={race?.id} onChange={(e) => setRaceId(e.target.value)}>{ev.races.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          <div className="flex flex-wrap gap-1">{(Object.keys(POST_KINDS) as PostKind[]).map((k) => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={clsx("rounded-full border px-2.5 py-1 text-xs font-medium", kind === k ? "border-transparent text-white" : "border-ink-200")} style={kind === k ? { background: POST_KINDS[k].color } : undefined}>{POST_KINDS[k].label}</button>)}</div>
        </div>
        <div className="relative h-[28rem] overflow-hidden rounded-2xl ring-1 ring-ink-100"><div className="absolute inset-0"><div ref={el} className="size-full" role="application" aria-label="Carte logistique : cliquez pour placer un poste" /></div><LayerControl map={map} ready={ready} /></div>
        <p className="mt-2 text-xs text-ink-500" aria-live="polite">{msg ?? (route ? "Choisissez un type puis cliquez sur le tracé : le kilomètre est calculé automatiquement." : "Liez un parcours à cette course pour placer les postes sur le tracé.")}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={exportMap} disabled={!posts.length}><FileDown className="size-4" />Carte en PDF</Button><Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="size-4" />Imprimer la page</Button></div>
      </div>
      <ul className="grid max-h-[34rem] content-start gap-2 overflow-y-auto">
        {posts.map((p, i) => (
          <li key={p.id} className="rounded-xl bg-white p-3 ring-1 ring-ink-100">
            <div className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: POST_KINDS[p.kind].color }}>{i + 1}</span>
              <input aria-label="Nom du poste" className="min-w-0 flex-1 rounded border border-transparent px-1 text-sm font-semibold hover:border-ink-200" value={p.name} onChange={(e) => upd(p.id, { name: e.target.value })} />
              <button aria-label="Supprimer le poste" className="grid size-7 place-items-center rounded hover:bg-ink-100" onClick={() => save((e) => ({ ...e, posts: e.posts.filter((x) => x.id !== p.id), volunteers: e.volunteers.map((v) => (v.postId === p.id ? { ...v, postId: "" } : v)) }))}><Trash2 className="size-4" /></button></div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><label>Km<input type="number" step="0.1" className="h-8 w-full rounded border border-ink-200 px-1" value={p.km} onChange={(e) => upd(p.id, { km: +e.target.value || 0 })} /></label>
              <label>Barrière (h)<input type="number" step="0.25" min={0} className="h-8 w-full rounded border border-ink-200 px-1" value={p.cutoffH ?? ""} onChange={(e) => upd(p.id, { cutoffH: e.target.value === "" ? undefined : +e.target.value })} /></label>
              <label>Bénévoles<input type="number" min={0} className="h-8 w-full rounded border border-ink-200 px-1" value={p.staffNeeded} onChange={(e) => upd(p.id, { staffNeeded: +e.target.value || 0 })} /></label></div>
            <input aria-label="Note" placeholder="Matériel, consignes…" className="mt-2 h-8 w-full rounded border border-ink-200 px-2 text-xs" value={p.note} onChange={(e) => upd(p.id, { note: e.target.value })} />
          </li>))}
        {!posts.length && <li className="rounded-xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">Aucun poste pour cette course.</li>}
      </ul>
    </div>
  );
}

function Volunteers({ ev, save }: P) {
  const [f, setF] = useState({ name: "", phone: "", postId: "", from: "", to: "", instructions: "" });
  const [nameErr, setNameErr] = useState(false);
  const add = (e: React.FormEvent) => { e.preventDefault(); if (!filled(f.name)) { setNameErr(true); return; } setNameErr(false); save((x) => ({ ...x, volunteers: [...x.volunteers, { id: uid(), ...f, name: f.name.trim() }] })); setF({ name: "", phone: "", postId: "", from: "", to: "", instructions: "" }); };
  const pdf = async (vols: Volunteer[], name: string) => download(`${safeName(ev.name)}-${name}.pdf`, await volunteersPdf(ev, vols, ev.posts), "application/pdf");
  const count = (postId: string) => ev.volunteers.filter((v) => v.postId === postId).length;
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form onSubmit={add} noValidate className="grid content-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100"><h2 className="font-bold">Nouvelle fiche bénévole</h2><RequiredLegend />
        <Field l="Nom" required error={nameErr && !filled(f.name) ? "Le nom du bénévole est obligatoire." : null}><input required aria-invalid={nameErr && !filled(f.name)} className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field l="Téléphone"><input className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field l="Poste"><select className={inp} value={f.postId} onChange={(e) => setF({ ...f, postId: e.target.value })}><option value="">Non affecté</option>{ev.posts.map((p) => <option key={p.id} value={p.id}>{p.name} (km {p.km})</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-2"><Field l="De"><input type="time" className={inp} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field><Field l="À"><input type="time" className={inp} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field></div>
        <Field l="Consignes"><textarea rows={3} className="rounded-lg border border-ink-200 p-2 text-sm" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
        <Button type="submit" variant="brand"><Plus className="size-4" />Ajouter</Button></form>
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-bold"><Users className="size-5" />{ev.volunteers.length} bénévole(s)</h2><Button size="sm" variant="secondary" disabled={!ev.volunteers.length} onClick={() => pdf(ev.volunteers, "fiches-benevoles")}><FileDown className="size-4" />Toutes les fiches (PDF)</Button></div>
        <ul className="grid gap-2">{ev.volunteers.map((v) => { const p = ev.posts.find((x) => x.id === v.postId); return (
          <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-100"><div className="min-w-0 flex-1"><p className="font-semibold">{v.name}</p><p className="text-xs text-ink-500">{p ? `${p.name} · km ${p.km}` : "Non affecté"} · {v.from || "?"}–{v.to || "?"} · {v.phone || "pas de téléphone"}</p></div>
            <Button size="sm" variant="ghost" onClick={() => pdf([v], safeName(v.name))}><FileDown className="size-4" />Fiche</Button><Button size="sm" variant="ghost" aria-label="Supprimer" onClick={() => save((x) => ({ ...x, volunteers: x.volunteers.filter((y) => y.id !== v.id) }))}><Trash2 className="size-4" /></Button></li>); })}</ul>
        {ev.posts.length > 0 && <div className="mt-5 rounded-xl bg-ink-50 p-3"><p className="mb-2 text-sm font-semibold">Couverture des postes</p><ul className="grid gap-1 text-sm">{ev.posts.map((p) => <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className={count(p.id) < p.staffNeeded ? "font-semibold text-danger" : "text-pine-700"}>{count(p.id)} / {p.staffNeeded}</span></li>)}</ul></div>}
      </div>
    </div>
  );
}

function Passages({ ev }: { ev: EventModel }) {
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

function Team({ ev, save }: P) {
  const [f, setF] = useState<{ name: string; email: string; role: Role }>({ name: "", email: "", role: "lecture" });
  const [nameErr, setNameErr] = useState(false);
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (!filled(f.name)) { setNameErr(true); return; } setNameErr(false); save((x) => ({ ...x, team: [...x.team, { id: uid(), ...f, name: f.name.trim() } as Member] })); setF({ name: "", email: "", role: "lecture" }); }} className="grid content-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100"><h2 className="font-bold">Ajouter un collaborateur</h2><RequiredLegend />
        <Field l="Nom" required error={nameErr && !filled(f.name) ? "Le nom du collaborateur est obligatoire." : null}><input required aria-invalid={nameErr && !filled(f.name)} className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field l="E-mail"><input type="email" className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field l="Rôle"><select className={inp} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Button type="submit" variant="brand"><Plus className="size-4" />Ajouter</Button></form>
      <div><ul className="grid gap-2">{ev.team.map((m) => <li key={m.id} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-100"><div className="min-w-0 flex-1"><p className="font-semibold">{m.name}</p><p className="text-xs text-ink-500">{m.email || "pas d'e-mail"} · {ROLES[m.role].label}</p></div><Button size="sm" variant="ghost" aria-label="Retirer" onClick={() => save((x) => ({ ...x, team: x.team.filter((y) => y.id !== m.id) }))}><Trash2 className="size-4" /></Button></li>)}{!ev.team.length && <li className="text-sm text-ink-500">Aucun collaborateur.</li>}</ul>
        <p className="mt-3 rounded-lg bg-warn/10 p-3 text-xs text-ink-700">Ces rôles sont enregistrés mais pas encore appliqués : sans comptes utilisateurs (étape 2 reportée), l'accès ne peut pas être restreint. Ne confiez pas de données sensibles à cet outil en l'état.</p></div>
    </div>
  );
}
