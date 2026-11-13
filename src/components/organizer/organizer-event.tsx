"use client";
import { Field, RequiredLegend, filled } from "@/components/ui/field";
import { LocationFields } from "@/components/ui/location-fields";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GeoJSONSource, Marker, Popup } from "maplibre-gl";
import { ArrowLeft, Plus, Trash2, FileDown, Printer, Users, Eye, X, UserPlus, ChevronDown, Sparkles, Check, Flag, FlagTriangleRight } from "lucide-react";
import clsx from "clsx";
import { useMap } from "@/components/map/use-map";
import { LayerControl } from "@/components/map/layer-control";
import { AnalysisTab } from "./analysis-tab";
import { PrepTab } from "./prep-tab";
import { Stepper, StepFrame, StepParcours, AnalyseRunner, DocumentsRunner, FinalCheck, LockedPanel, useFlow } from "./flow";
import type { StepId } from "@/lib/trail-flow";
import { PoiIcon } from "@/components/ui/poi-icon";
import { poiPinSvg } from "@/lib/poi-icons";
import { routeMarkerSvg } from "@/lib/route-markers";
import { Button } from "@/components/ui/button";
import { collectionsRepo, eventsRepo, routesRepo } from "@/lib/repo";
import { cloudEnabled } from "@/lib/cloud";
import { collectionHref, editorHref } from "@/lib/url";
import { POST_KINDS, ROLES, passageTable, positionOnTrack, raceFactsFromRoute, raceOutOfSync, proposePosts, POST_ICON, POST_COLOR, postNumbers, postLabel, volunteersAt, assignVolunteer, addVolunteerAt, cleanAssignments, type EventModel, type Member, type Post, type PostKind, type Race, type Role, type Volunteer } from "@/lib/events";
import { SPORTS, estimateMinutes, type Sport } from "@/lib/sports";
import { bboxOf, fmtDuration } from "@/lib/geo";
import { download, safeName } from "@/lib/formats";
import { passagePdf, volunteersPdf, mapPdf } from "@/lib/pdf";
import { uid } from "@/lib/types";
import { eventHref } from "@/lib/url";

const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
const panel = "rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100";

/** Sous-onglets d'une étape : mêmes pastilles partout. */
function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string][]; label: string }) {
  return <div role="tablist" aria-label={label} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-ink-100 p-1">{items.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={value === k} onClick={() => onChange(k)} className={clsx("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition", value === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900")}>{l}</button>)}</div>;
}
function Fold({ title, hint, children, open }: { title: string; hint?: string; children: React.ReactNode; open?: boolean }) {
  return <details className={clsx(panel, "group")} open={open}><summary className="flex cursor-pointer list-none items-center gap-3"><span className="min-w-0 flex-1"><span className="block text-base font-bold">{title}</span>{hint && <span className="block text-sm text-ink-500">{hint}</span>}</span><ChevronDown className="size-5 shrink-0 text-ink-400 transition group-open:rotate-180" /></summary><div className="mt-4">{children}</div></details>;
}

export function OrganizerEvent({ id }: { id: string }) {
  const ev = eventsRepo.useAll().find((e) => e.id === id);
  if (!ev) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-3xl font-bold">Événement introuvable</h1><p className="mt-2 text-ink-600">Les événements sont enregistrés sur cet appareil.</p><Link href="/organisateurs" className="mt-6 inline-block font-semibold text-pine-700 underline">Retour</Link></div>;
  return <Workspace ev={ev} />;
}

function Workspace({ ev }: { ev: EventModel }) {
  const save = (fn: (e: EventModel) => EventModel) => { eventsRepo.upsert(fn(eventsRepo.get(ev.id) ?? ev)); };
  const flow = useFlow(ev);
  const [picked, setPicked] = useState<StepId | null>(null);
  const [sub, setSub] = useState<"postes" | "benevoles" | "passages">("postes");
  const active = picked ?? flow.current, step = flow.steps.find((s) => s.id === active)!;
  const pick = (s: StepId) => { setPicked(s); requestAnimationFrame(() => document.getElementById("etapes")?.scrollIntoView({ behavior: "smooth", block: "start" })); };
  const frame = (auto: string | undefined, children: React.ReactNode) => <StepFrame step={step} flow={flow} ev={ev} save={save} onPick={pick} auto={auto}>{children}</StepFrame>;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/organisateurs" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Organisation Trail</Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0"><h1 className="text-3xl sm:text-4xl">{ev.name}</h1><p className="mt-1 text-sm text-ink-600">{/^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? new Date(`${ev.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "Date à préciser"} · {ev.place || "Lieu à préciser"} · {ev.races.length} course(s)</p></div>
        <div className="flex items-center gap-4"><div className="w-44" role="img" aria-label={`Préparation : ${flow.percent} %`}><p className="flex items-baseline justify-between text-xs font-semibold text-ink-600"><span>Préparation</span><span className="font-display text-lg text-ink-900">{flow.percent} %</span></p><div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-gradient-to-r from-pine-600 to-pine-400 transition-all" style={{ width: `${flow.percent}%` }} /></div></div>
          <Link href={eventHref(ev.id)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-sm font-semibold hover:bg-ink-50"><Eye className="size-4" />Page publique</Link></div>
      </header>
      <Consistency ev={ev} save={save} />
      <div id="etapes" className="mt-5 scroll-mt-20"><Stepper flow={flow} active={active} onPick={pick} /></div>
      {step.status === "locked" ? <LockedPanel step={step} flow={flow} onPick={pick} /> : (<>
        {active === "parcours" && frame(undefined, <StepParcours ev={ev} />)}
        {active === "trail" && frame("la distance, le dénivelé, les altitudes et la discipline de chaque course sont repris du parcours choisi.", <>
          <div className={panel}><h3 className="mb-3 text-base font-bold">L&apos;événement</h3><Infos ev={ev} save={save} /></div>
          <div><h3 className="mb-3 text-base font-bold">Les courses</h3><Races ev={ev} save={save} /></div>
          <PrepTab ev={ev} save={save} part="params" />
          <Fold title="Équipe et rôles" hint="Facultatif : les personnes qui préparent l'événement avec vous."><Team ev={ev} save={save} /></Fold>
        </>)}
        {active === "analyse" && frame("nature de chaque épreuve, part de goudron, traversées de routes, départements, catégories d'âge admises, matériel à exiger et dispositif médical recommandé.", <>
          <AnalyseRunner ev={ev} save={save} />
          <PrepTab ev={ev} save={save} part="analyse" />
          <Fold title="Analyse cadastrale et réglementaire" hint="Parcelles traversées, statut des chemins, forêts publiques et zones protégées : pour préparer les demandes d'accord."><AnalysisTab ev={ev} /></Fold>
        </>)}
        {active === "documents" && frame("le règlement, le dossier administratif, l'échéancier daté et le dossier de préparation sont rédigés à partir de l'analyse ; les postes sont proposés sur la carte.", <>
          <DocumentsRunner ev={ev} save={save} />
          <PrepTab ev={ev} save={save} part="documents" />
        </>)}
        {active === "logistique" && frame("les postes sont proposés depuis le parcours (points d'intérêt, distance, routes traversées) ; les kilomètres et les temps de passage sont calculés.", <>
          <Tabs label="Logistique" value={sub} onChange={setSub} items={[["postes", `Postes (${ev.posts.length})`], ["benevoles", `Bénévoles (${ev.volunteers.length})`], ["passages", "Temps de passage"]]} />
          {sub === "postes" && <Logistics ev={ev} save={save} />}
          {sub === "benevoles" && <Volunteers ev={ev} save={save} />}
          {sub === "passages" && <Passages ev={ev} />}
        </>)}
        {active === "verification" && frame(undefined, <FinalCheck flow={flow} ev={ev} save={save} onPick={pick} />)}
      </>)}
    </div>
  );
}
type P = { ev: EventModel; save: (fn: (e: EventModel) => EventModel) => void };

/** Cohérence des données, quel que soit l'onglet ouvert : courses réalignées sur leur parcours s'il a changé, fiches bénévoles dont le poste a disparu remises à « non affecté ». */
function Consistency({ ev, save }: P) {
  const routes = routesRepo.useAll();
  useEffect(() => {
    const stale = ev.races.filter((r) => { const rt = r.routeId ? routes.find((x) => x.id === r.routeId) : null; return rt && raceOutOfSync(r, rt.coords); });
    const orphan = cleanAssignments(ev) !== ev;
    if (stale.length || orphan) save((e) => cleanAssignments({ ...e, races: e.races.map((r) => { const rt = stale.some((x) => x.id === r.id) ? routes.find((x) => x.id === r.routeId) : null; return rt ? { ...r, ...raceFactsFromRoute(rt.coords) } : r; }) }));
  }, [ev, routes]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

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
  const [routeId, setRouteId] = useState(""); const [label, setLabel] = useState(""); const [tried, setTried] = useState(false);
  const upd = (id: string, patch: Partial<Race>) => save((e) => ({ ...e, races: e.races.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const chosen = routes.find((x) => x.id === routeId);
  const preview = useMemo(() => (chosen ? raceFactsFromRoute(chosen.coords) : null), [chosen?.id, chosen?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Création : le parcours est obligatoire ; distance, dénivelés, altitudes et discipline en sont repris. */
  const add = () => {
    setTried(true); if (!chosen || !preview) return;
    const est = estimateMinutes(chosen.sport, preview.distanceKm * 1000, preview.gainM) / 60;
    save((e) => ({ ...e, races: [...e.races, { id: uid(), label: label.trim() || chosen.name, sport: chosen.sport, ...preview, startTime: "08:00", maxHours: Math.max(1, Math.ceil(est * 1.6 * 2) / 2), routeId: chosen.id }] }));
    setRouteId(""); setLabel(""); setTried(false);
  };
  const link = (raceId: string, id: string) => { const r = routes.find((x) => x.id === id); if (r) upd(raceId, { routeId: id, sport: r.sport, ...raceFactsFromRoute(r.coords) }); };
  const stat = (l: string, v: string) => <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{l}</dt><dd className="font-display text-base font-bold">{v}</dd></div>;
  const facts = (f: Pick<Race, "distanceKm" | "gainM" | "lossM" | "minEle" | "maxEle">, sport: Sport) => <dl className="flex flex-wrap gap-x-6 gap-y-2">{stat("Distance", `${String(f.distanceKm).replace(".", ",")} km`)}{stat("D+", `${f.gainM} m`)}{f.lossM != null && stat("D−", `${f.lossM} m`)}{f.minEle != null && stat("Alt. min", `${f.minEle} m`)}{f.maxEle != null && stat("Alt. max", `${f.maxEle} m`)}{stat("Durée médiane estimée", fmtDuration(estimateMinutes(sport, f.distanceKm * 1000, f.gainM)))}</dl>;
  return (
    <div className="grid gap-4">
      {ev.races.map((r) => {
        const rt = r.routeId ? routes.find((x) => x.id === r.routeId) : undefined, legacy = !r.routeId, missing = !!r.routeId && !rt;
        return (
        <article key={r.id} aria-label={`Course ${r.label}`} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:grid-cols-6">
          <div className="sm:col-span-3"><Field l="Nom du format"><input className={inp} value={r.label} onChange={(e) => upd(r.id, { label: e.target.value })} /></Field></div>
          <div className="sm:col-span-3"><Field l="Parcours" required><select className={inp} aria-invalid={legacy || missing} value={rt ? r.routeId : ""} onChange={(e) => link(r.id, e.target.value)}>{!rt && <option value="">{missing ? "Parcours introuvable — choisissez-en un" : "Choisissez un parcours"}</option>}{routes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
          {legacy || missing ? (<>
            <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-ink-700 sm:col-span-6">{missing ? "Le parcours lié à cette course n'existe plus sur cet appareil." : "Cette course a été créée sans parcours."} Choisissez un parcours ci-dessus : distance et dénivelés seront repris du tracé. En attendant, les valeurs ci-dessous restent celles saisies à la main.</p>
            <Field l="Distance (km)"><input type="number" min={0} step="0.1" className={inp} value={r.distanceKm} onChange={(e) => upd(r.id, { distanceKm: +e.target.value || 0 })} /></Field>
            <Field l="D+ (m)"><input type="number" min={0} className={inp} value={r.gainM} onChange={(e) => upd(r.id, { gainM: +e.target.value || 0 })} /></Field>
          </>) : <div className="rounded-xl bg-ink-50 p-3 sm:col-span-6">{facts(r, r.sport)}<p className="mt-2 text-xs text-ink-500">Valeurs calculées sur le parcours « {rt!.name} » et mises à jour automatiquement s&apos;il est modifié. <Link className="font-semibold text-pine-700 underline" href={editorHref(rt!.id)}>Modifier le parcours</Link></p></div>}
          <div className="sm:col-span-2"><Field l="Discipline"><select className={inp} value={r.sport} onChange={(e) => upd(r.id, { sport: e.target.value as Sport })}>{Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field></div>
          <Field l="Départ"><input type="time" className={inp} value={r.startTime} onChange={(e) => upd(r.id, { startTime: e.target.value })} /></Field>
          <Field l="Temps limite (h)"><input type="number" min={0} step="0.5" className={inp} value={r.maxHours} onChange={(e) => upd(r.id, { maxHours: +e.target.value || 0 })} /></Field>
          <div className="sm:col-span-2"><Field l="Tarif / note"><input className={inp} value={r.fee ?? ""} onChange={(e) => upd(r.id, { fee: e.target.value })} /></Field></div>
          <div className="flex justify-end sm:col-span-6"><Button variant="ghost" size="sm" onClick={() => confirm(`Supprimer la course « ${r.label} » et ses postes ?`) && save((e) => ({ ...e, races: e.races.filter((x) => x.id !== r.id), posts: e.posts.filter((p) => p.raceId !== r.id), volunteers: e.volunteers.map((v) => (e.posts.some((p) => p.id === v.postId && p.raceId === r.id) ? { ...v, postId: "" } : v)) }))}><Trash2 className="size-4" />Supprimer la course</Button></div>
        </article>); })}
      <section aria-labelledby="new-race" className="rounded-2xl border border-dashed border-ink-300 bg-white/60 p-4">
        <h2 id="new-race" className="text-lg font-bold">Ajouter une course</h2>
        {!routes.length ? <p className="mt-1 text-sm text-ink-600">Une course s&apos;appuie toujours sur un parcours. <Link className="font-semibold text-pine-700 underline" href="/creer">Créez un parcours</Link>, <Link className="font-semibold text-pine-700 underline" href="/fichiers">importez un GPX</Link> ou partez d&apos;un <Link className="font-semibold text-pine-700 underline" href="/itineraires">itinéraire de référence</Link>, puis revenez ici.</p> : (<>
          <p className="mt-1 text-sm text-ink-500">Choisissez d&apos;abord le parcours : distance, dénivelés, altitudes et discipline sont repris du tracé, sans saisie.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field l="Parcours" required error={tried && !chosen ? "Choisissez un parcours pour créer la course." : null}><select className={inp} required aria-invalid={tried && !chosen} value={routeId} onChange={(e) => setRouteId(e.target.value)}><option value="">Choisissez un parcours…</option>{routes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field l="Nom du format (facultatif)"><input className={inp} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={chosen?.name ?? "ex. Le 25 km"} disabled={!chosen} /></Field>
          </div>
          {chosen && preview && <div className="mt-3 rounded-xl bg-ink-50 p-3" aria-live="polite"><p className="mb-2 text-xs font-semibold text-ink-500">Repris du parcours · {SPORTS[chosen.sport]?.label ?? chosen.sport}</p>{facts(preview, chosen.sport)}{preview.gainM === 0 && preview.minEle == null && <p className="mt-2 text-xs text-warn">Ce parcours n&apos;a pas d&apos;altitudes : le dénivelé vaut 0. Ouvrez-le dans l&apos;éditeur pour les calculer.</p>}</div>}
          <div className="mt-3"><Button variant="brand" disabled={!chosen} onClick={add}><Plus className="size-4" />Créer la course</Button>{!chosen && <span className="ml-3 text-xs text-ink-500">Sélectionnez un parcours pour activer la création.</span>}</div>
        </>)}
      </section>
    </div>
  );
}

/** Pictogramme d'un type de poste : celui des points d'intérêt du site ; drapeaux pour le départ et l'arrivée. */
function PostIcon({ kind, size = 28 }: { kind: PostKind; size?: number }) {
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

function Logistics({ ev, save }: P) {
  const routes = routesRepo.useAll();
  const [raceId, setRaceId] = useState(ev.races[0]?.id ?? "");
  const [kind, setKind] = useState<PostKind>("ravito");
  const [msg, setMsg] = useState<string | null>(null);
  const race = ev.races.find((r) => r.id === raceId) ?? ev.races[0];
  const route = race?.routeId ? routes.find((r) => r.id === race.routeId) : undefined;
  const posts = useMemo(() => ev.posts.filter((p) => p.raceId === race?.id).sort((a, b) => a.km - b.km), [ev.posts, race]);
  const { el, map, ml, ready } = useMap({ preserveBuffer: true });
  const marks = useRef<Marker[]>([]); const popup = useRef<Popup | null>(null);
  const [sel, setSel] = useState<string | null>(null); const [newName, setNewName] = useState<Record<string, string>>({});
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
      const vols = volunteersAt(ev, p.id), need = Math.max(0, p.staffNeeded), short = vols.length < need;
      const b = postMarkerEl(p.kind, i + 1, `${vols.length}/${need}`, short, sel === p.id, !!p.auto, `Poste ${i + 1} — ${p.name} (km ${p.km}) : ${vols.length ? vols.map((v) => v.name).join(", ") : "aucun bénévole"}${p.auto ? " — proposé, à vérifier" : ""}`);
      b.addEventListener("click", (e) => { e.stopPropagation(); setSel(p.id); setTimeout(() => document.getElementById(`post-${p.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50); });
      marks.current.push(new lib.Marker({ element: b, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(m));
    });
  }, [posts, ev.volunteers, sel, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps
  // fenêtre du poste choisi : ses bénévoles, tels qu'ils figurent sur leurs fiches
  useEffect(() => {
    const m = map.current, lib = ml.current; if (!m || !lib || !ready) return;
    popup.current?.remove(); popup.current = null;
    const idx = posts.findIndex((x) => x.id === sel), p = posts[idx]; if (!p || p.lng == null || p.lat == null) return;
    const vols = volunteersAt(ev, p.id), box = document.createElement("div"); box.className = "text-sm";
    const h = document.createElement("div"); h.className = "font-semibold"; h.textContent = `Poste ${idx + 1} — ${p.name}`;
    const k = document.createElement("div"); k.className = "text-xs text-gray-600"; k.textContent = `${POST_KINDS[p.kind].label} · km ${p.km} · ${vols.length}/${p.staffNeeded} bénévole(s)`;
    const l = document.createElement("div"); l.className = "mt-1 text-xs"; l.textContent = vols.length ? vols.map((v) => v.name).join(", ") : "Aucun bénévole affecté";
    box.append(h, k, l);
    popup.current = new lib.Popup({ closeButton: true, closeOnClick: false, offset: 40 }).setLngLat([p.lng, p.lat]).setDOMContent(box).addTo(m);
    popup.current.on("close", () => setSel((x) => (x === p.id ? null : x)));
  }, [sel, posts, ev.volunteers, ready, map, ml]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (id: string, patch: Partial<Post>) => save((e) => ({ ...e, posts: e.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const autoN = posts.filter((p) => p.auto).length;
  /** Proposition automatique : ajoute seulement les postes qui n'existent pas déjà (même type à moins de 300 m). */
  const propose = () => { if (!race || !route) return; const add = proposePosts({ race, coords: route.coords, pois: route.pois, roads: ev.prep?.roads?.[race.id] ?? [], newId: uid }).filter((n) => !posts.some((p) => p.kind === n.kind && Math.abs(p.km - n.km) < 0.3)); save((e) => ({ ...e, posts: [...e.posts, ...add] })); setMsg(add.length ? `${add.length} poste(s) proposé(s) : vérifiez chacun, déplacez-le si besoin (kilomètre), puis confirmez.${ev.prep?.roads?.[race.id] ? "" : " Les signaleurs ne sont proposés qu'après l'analyse des parcours (étape 3)."}` : "Rien à ajouter : tous les postes proposés existent déjà."); };
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
          <select aria-label="Course" className="h-10 rounded-full border border-ink-200 bg-white px-3 text-sm font-semibold" value={race?.id} onChange={(e) => setRaceId(e.target.value)}>{ev.races.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
          <div role="group" aria-label="Type de poste à placer" className="flex flex-wrap gap-1.5">{(Object.keys(POST_KINDS) as PostKind[]).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={clsx("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition", kind === k ? "border-ink-900 bg-ink-950 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400")}><PostIcon kind={k} size={22} />{POST_KINDS[k].label}</button>)}</div>
        </div>
        <div className="relative h-[30rem] overflow-hidden rounded-2xl shadow-card ring-1 ring-ink-100"><div className="absolute inset-0"><div ref={el} className="size-full" role="application" aria-label="Carte logistique : cliquez pour placer un poste" /></div><LayerControl map={map} ready={ready} /></div>
        <p className="mt-2 text-xs text-ink-500" aria-live="polite">{msg ?? (route ? "Choisissez un type puis cliquez sur le tracé : le kilomètre est calculé automatiquement. La pastille de chaque poste indique bénévoles affectés / nécessaires ; les affectations sont les mêmes que sur les fiches de l'onglet Bénévoles." : "Liez un parcours à cette course pour placer les postes sur le tracé.")}</p>
        <div className="mt-3 flex flex-wrap gap-2">{route && <Button size="sm" onClick={propose} data-action="proposer"><Sparkles className="size-4" />{posts.length ? "Compléter avec les postes proposés" : "Proposer les postes automatiquement"}</Button>}{autoN > 0 && <Button size="sm" variant="secondary" onClick={() => save((e) => ({ ...e, posts: e.posts.map((p) => (p.raceId === race?.id ? { ...p, auto: undefined } : p)) }))}><Check className="size-4" />Confirmer les {autoN} postes proposés</Button>}<Button size="sm" variant="secondary" onClick={exportMap} disabled={!posts.length}><FileDown className="size-4" />Carte en PDF</Button><Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="size-4" />Imprimer la page</Button></div>
      </div>
      <ul className="grid max-h-[40rem] content-start gap-2.5 overflow-y-auto p-0.5">
        {posts.map((p, i) => (
          <li key={p.id} id={`post-${p.id}`} aria-label={`Poste ${i + 1} — ${p.name}`} className={clsx("rounded-2xl bg-white p-3 shadow-card ring-1", sel === p.id ? "ring-2 ring-pine-600" : "ring-ink-100")}>
            <div className="flex items-center gap-2"><span className="relative shrink-0"><PostIcon kind={p.kind} size={30} /><span className="absolute -left-1.5 -top-1.5 grid min-w-[1.1rem] place-items-center rounded-full border border-white bg-ink-950 px-1 text-[10px] font-bold leading-4 text-white">{i + 1}</span></span>
              <input aria-label="Nom du poste" className="min-w-0 flex-1 rounded border border-transparent px-1 text-sm font-semibold hover:border-ink-200" value={p.name} onFocus={() => setSel(p.id)} onChange={(e) => upd(p.id, { name: e.target.value })} />
              <button aria-label="Supprimer le poste" className="grid size-7 place-items-center rounded hover:bg-ink-100" onClick={() => save((e) => ({ ...e, posts: e.posts.filter((x) => x.id !== p.id), volunteers: e.volunteers.map((v) => (v.postId === p.id ? { ...v, postId: "" } : v)) }))}><Trash2 className="size-4" /></button></div>
            <p className="mt-1 flex flex-wrap items-center gap-2 pl-10 text-xs text-ink-500">{POST_KINDS[p.kind].label}{p.auto && <><span className="rounded-full bg-brass-100 px-2 py-0.5 font-semibold text-brass-600">Proposé — à vérifier</span><button type="button" className="font-semibold text-pine-700 underline" onClick={() => upd(p.id, { auto: undefined })}>Confirmer</button></>}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><label>Km<input type="number" step="0.1" className="h-8 w-full rounded border border-ink-200 px-1" value={p.km} onChange={(e) => upd(p.id, { km: +e.target.value || 0 })} /></label>
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
