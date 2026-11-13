"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, ArrowRight, Route as RouteIcon, Flag, ScanSearch, FileText, MapPinned, ClipboardCheck, Sparkles, Lock } from "lucide-react";
import clsx from "clsx";
import { Button, ButtonLink } from "@/components/ui/button";
import { eventsRepo, routesRepo } from "@/lib/repo";
import type { EventModel } from "@/lib/events";
import { trailFlow, STEP_META } from "@/lib/trail-flow";
import { ownerHref, manageHref, withBase } from "@/lib/url";
import { useAuth } from "@/lib/auth";
import { uid } from "@/lib/types";
import { Field, RequiredLegend, filled } from "@/components/ui/field";
import { LocationFields } from "@/components/ui/location-fields";
import { todayISO } from "./flow";

const ICONS = [RouteIcon, Flag, ScanSearch, FileText, MapPinned, ClipboardCheck];
const AUTO = ["Vous tracez ou importez.", "Distance et dénivelés repris du parcours.", "Premier clic : le site lit vos parcours.", "Second clic : documents et postes proposés.", "Vous ajustez sur la carte.", "Vous validez ce qui vous engage."];

export function OrganizerHome() {
  const events = eventsRepo.useAll(), routes = routesRepo.useAll();
  const auth = useAuth();
  const [f, setF] = useState({ name: "", organizer: "", date: "", place: "", region: "" });
  const field = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
  const [errs, setErrs] = useState<Record<string, string>>({});
  const mine = events.filter((e) => e.origin === "mine"), hasRoute = routes.length > 0;
  const create = (e: React.FormEvent) => {
    e.preventDefault(); if (!hasRoute) return;
    const bad: Record<string, string> = {};
    for (const [k, label] of [["name", "Le nom"], ["organizer", "L'organisateur"], ["date", "La date"], ["place", "Le lieu"]] as const) if (!filled(f[k])) bad[k] = `${label} est obligatoire.`;
    setErrs(bad); if (Object.keys(bad).length) return;
    const ev: EventModel = { id: uid(), ...f, name: f.name.trim(), description: "", rules: "", practical: "", registrationUrl: "", races: [], posts: [], volunteers: [], team: [], origin: "mine", createdAt: Date.now() };
    eventsRepo.upsert(ev); location.assign(withBase(manageHref(ev.id)));
  };
  const ids = routes.map((r) => r.id), today = todayISO();
  return (
    <div>
      <section className="bg-ink-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="eyebrow !text-brass-400">Organisation Trail</p>
          <h1 className="mt-2 max-w-3xl text-4xl sm:text-5xl">Organisez votre trail, <em className="text-brass-400">étape par étape</em>.</h1>
          <p className="mt-4 max-w-2xl text-white/70">Même pour une première édition : vous tracez les parcours, le site en tire l&apos;analyse, les documents et une logistique proposée. Vous gardez la main sur ce qui vous engage.</p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{STEP_META.map((s, i) => { const I = ICONS[i]; return (
            <li key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><span className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-full bg-brass-400 font-display text-xs font-bold text-ink-950">{i + 1}</span><I className="size-4 text-brass-400" /></span><span className="mt-2 block text-sm font-semibold">{s.title}</span><span className="mt-0.5 block text-xs text-white/60">{AUTO[i]}</span></li>); })}</ol>
          <p className="mt-4 flex items-center gap-2 text-sm text-white/70"><Sparkles className="size-4 text-brass-400" />Une fois les parcours enregistrés et quatre informations données, deux clics suffisent pour l&apos;analyse, les documents et les postes.</p>
        </div>
      </section>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_24rem]">
        <section aria-labelledby="mes-trails">
          <div className="flex flex-wrap items-end justify-between gap-2"><h2 id="mes-trails" className="text-2xl">Mes trails ({mine.length})</h2><Link href={ownerHref(auth.user?.id ?? "me")} className="text-sm font-semibold text-pine-700 underline">Ma page publique d&apos;organisateur</Link></div>
          {!mine.length ? <div className="mt-4 rounded-2xl border border-dashed border-ink-300 bg-white/60 p-8 text-center"><p className="font-display text-lg font-bold">Aucun trail pour l&apos;instant</p><p className="mx-auto mt-1 max-w-md text-sm text-ink-600">{hasRoute ? "Vos parcours sont prêts : créez votre trail avec le formulaire ci-contre." : "Commencez par l'étape 1 : enregistrez le parcours de votre course."}</p>{!hasRoute && <div className="mt-4 flex flex-wrap justify-center gap-2"><ButtonLink href="/creer">Tracer un parcours</ButtonLink><ButtonLink href="/fichiers" variant="secondary">Importer un GPX</ButtonLink></div>}</div> : (
            <ul className="mt-4 grid gap-3">{mine.map((e) => { const fl = trailFlow(e, ids, today), cur = fl.steps.find((s) => s.id === fl.current)!; return (
              <li key={e.id} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
                <div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><Link href={manageHref(e.id)} className="text-lg font-semibold hover:text-pine-700">{e.name}</Link><p className="text-sm text-ink-500">{e.date} · {e.place} · {e.races.length} course(s) · {e.posts.length} poste(s) · {e.volunteers.length} bénévole(s)</p></div>
                  <Button size="sm" variant="ghost" aria-label={`Supprimer ${e.name}`} onClick={() => confirm(`Supprimer « ${e.name} » ? Courses, postes et fiches bénévoles de cet événement seront supprimés.`) && eventsRepo.remove(e.id)}><Trash2 className="size-4" /></Button></div>
                <div className="mt-3 flex items-center gap-1" aria-hidden="true">{fl.steps.map((s) => <span key={s.id} className={clsx("h-1.5 flex-1 rounded-full", s.status === "done" ? "bg-pine-500" : s.status === "progress" ? "bg-ember-500" : s.status === "locked" ? "bg-ink-100" : "bg-ink-300")} />)}</div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-ink-600"><b className="font-display text-ink-900">{fl.percent} %</b> · étape {cur.n} sur 6 : {cur.title}{fl.toValidate.length ? ` · ${fl.toValidate.length} validation(s) en attente` : ""}</p>
                  <ButtonLink href={manageHref(e.id)} size="sm">Continuer<ArrowRight className="size-4" /></ButtonLink></div>
              </li>); })}</ul>)}
        </section>
        <aside>
          <form onSubmit={create} noValidate className="grid gap-3 rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100" aria-labelledby="nouveau">
            <h2 id="nouveau" className="text-xl">Nouveau trail</h2>
            {!hasRoute ? <div className="rounded-xl bg-warn/10 p-3 text-sm text-ink-800"><p className="flex items-center gap-2 font-semibold"><Lock className="size-4" />Étape 1 d&apos;abord</p><p className="mt-1">Un trail s&apos;appuie sur au moins un parcours enregistré : c&apos;est lui qui fournit distance, dénivelé et tracé.</p><div className="mt-3 flex flex-wrap gap-2"><ButtonLink href="/creer" size="sm">Tracer un parcours</ButtonLink><ButtonLink href="/fichiers" size="sm" variant="secondary">Importer un GPX</ButtonLink></div></div>
              : <p className="text-sm text-ink-500">{routes.length} parcours enregistré(s) : vous les associerez aux courses juste après.</p>}
            <fieldset disabled={!hasRoute} className="grid gap-3 disabled:opacity-50"><RequiredLegend className="-mt-1" />
              <Field l="Nom du trail" required error={errs.name}><input required aria-invalid={!!errs.name} className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} /></Field>
              <Field l="Organisateur" required error={errs.organizer}><input required aria-invalid={!!errs.organizer} className={field} value={f.organizer} onChange={(e) => setF({ ...f, organizer: e.target.value })} maxLength={120} placeholder="Association, club…" /></Field>
              <Field l="Date" required error={errs.date}><input required aria-invalid={!!errs.date} type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
              <LocationFields place={f.place} region={f.region} onChange={(v) => setF({ ...f, ...v })} placeRequired placeError={errs.place} />
              <Button type="submit"><Plus className="size-4" />Créer le trail</Button></fieldset>
          </form>
        </aside>
      </div>
    </div>
  );
}
