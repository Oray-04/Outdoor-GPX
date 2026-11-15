"use client";
import { Field, RequiredLegend, filled } from "@/components/ui/field";
import { LocationFields } from "@/components/ui/location-fields";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Eye, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { AnalysisTab } from "./analysis-tab";
import { PrepTab } from "./prep-tab";
import { Consistency, LogisticsSummary } from "./logistics";
import { Stepper, StepFrame, StepParcours, AnalyseRunner, DocumentsRunner, FinalCheck, LockedPanel, useFlow } from "./flow";
import type { StepId } from "@/lib/trail-flow";
import { Button } from "@/components/ui/button";
import { collectionsRepo, eventsRepo, routesRepo } from "@/lib/repo";
import { cloudEnabled } from "@/lib/cloud";
import { collectionHref, editorHref } from "@/lib/url";
import { ROLES, raceFactsFromRoute, type EventModel, type Member, type Race, type Role } from "@/lib/events";
import { SPORTS, estimateMinutes, type Sport } from "@/lib/sports";
import { fmtDuration } from "@/lib/geo";
import { uid } from "@/lib/types";
import { eventHref } from "@/lib/url";

const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
const panel = "rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100";

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
  const active = picked ?? flow.current, step = flow.steps.find((s) => s.id === active)!;
  const pick = (s: StepId) => { setPicked(s); requestAnimationFrame(() => { const t = document.getElementById("etapes"); if (t && t.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + t.getBoundingClientRect().top - 80, behavior: "smooth" }); }); };
  const frame = (auto: string | undefined, children: React.ReactNode) => <StepFrame step={step} flow={flow} ev={ev} save={save} onPick={pick} auto={auto}>{children}</StepFrame>;
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Link href="/organisateurs" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Organisation Trail</Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0"><h1 className="text-3xl sm:text-4xl">{ev.name}</h1><p className="mt-1 text-sm text-ink-600">{/^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? new Date(`${ev.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "Date à préciser"} · {ev.place || "Lieu à préciser"} · {ev.races.length} course(s)</p></div>
        <div className="flex items-center gap-4"><div className="w-44" role="img" aria-label={`Préparation : ${flow.percent} %`}><p className="flex items-baseline justify-between text-xs font-semibold text-ink-600"><span>Préparation</span><span className="font-display text-lg text-ink-900">{flow.percent} %</span></p><div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-gradient-to-r from-pine-600 to-pine-400 transition-all" style={{ width: `${flow.percent}%` }} /></div></div>
          <Link href={eventHref(ev.id)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 text-sm font-semibold hover:bg-ink-50"><Eye className="size-4" />Page publique</Link></div>
      </header>
      <Consistency ev={ev} save={save} />
      <div id="etapes" className="mt-5 scroll-mt-20 lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="lg:sticky lg:top-20"><div className="lg:hidden"><Stepper flow={flow} active={active} onPick={pick} /></div><div className="hidden lg:block"><Stepper vertical flow={flow} active={active} onPick={pick} /><p className="mt-3 px-2 text-xs text-ink-500">Chaque étape ouvre la suivante. Vous pouvez revenir sur une étape terminée à tout moment.</p></div></aside>
      <div className="min-w-0">
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
        {active === "logistique" && frame("départ et arrivée sont placés aux extrémités de chaque parcours, les points d'intérêt des parcours deviennent des postes, d'autres postes peuvent être proposés depuis le parcours ; kilomètres et temps de passage sont calculés. Tout est partagé avec les parcours : rien n'est saisi deux fois.", <>
          <LogisticsSummary ev={ev} />
        </>)}
        {active === "verification" && frame(undefined, <FinalCheck flow={flow} ev={ev} save={save} onPick={pick} />)}
      </>)}
      </div></div>
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
        {!routes.length ? <p className="mt-1 text-sm text-ink-600">Une course s&apos;appuie toujours sur un parcours. <Link className="font-semibold text-pine-700 underline" href="/creer">Créez un parcours</Link>, <Link className="font-semibold text-pine-700 underline" href="/fichiers">importez un GPX</Link> ou partez d&apos;un <Link className="font-semibold text-pine-700 underline" href="/explorer/?itineraire=">itinéraire de référence</Link>, puis revenez ici.</p> : (<>
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
