"use client";
import { ChevronDown, Check, Lock, CircleDashed, Sparkles, FileText, ScanSearch, CalendarClock, ClipboardList, FileDown, ShieldCheck, CircleAlert } from "lucide-react";
import clsx from "clsx";
import { ValidateBox, AnalyseRunner, DocumentsRunner, type Save } from "./flow";
import type { Flow, FlowItem, FlowStep } from "@/lib/trail-flow";
import { adminFile, timeline, PREP_NOTICE, prepReport } from "@/lib/race-prep";
import type { EventModel } from "@/lib/events";
import { download, safeName } from "@/lib/formats";
import { prepPdf } from "@/lib/pdf";

/** État d'une rubrique, tel qu'affiché sur sa carte. */
export type CardStatus = FlowStep["status"];
export const CARD_STATUS: Record<CardStatus, { label: string; chip: string; bar: string; bubble: string }> = {
  done: { label: "Terminé", chip: "bg-pine-600 text-white", bar: "bg-pine-500", bubble: "bg-pine-600 text-white" },
  progress: { label: "En cours", chip: "bg-ember-500 text-white", bar: "bg-ember-500", bubble: "bg-ember-500 text-white" },
  todo: { label: "À faire", chip: "bg-white text-ink-800 ring-1 ring-ink-300", bar: "bg-ember-500", bubble: "bg-ink-100 text-ink-700" },
  locked: { label: "Verrouillé", chip: "bg-ink-100 text-ink-500", bar: "bg-ink-300", bubble: "bg-ink-100 text-ink-400" },
  optional: { label: "Facultatif", chip: "bg-glacier-100 text-glacier-600 ring-1 ring-glacier-500/30", bar: "bg-glacier-500", bubble: "bg-glacier-100 text-glacier-600" },
};

/**
 * Tuile de rubrique en mosaïque : titre, informations principales, statut et progression, bouton « Développer ».
 * Développée, la tuile prend toute la largeur et son contenu s'ouvre sur place (pas de changement de page ni d'onglet).
 */
export function SectionCard({ id, n, title, icon: I, status, progress, facts, summary, lockedWhy, open, onToggle, wide, current, children }: {
  id: string; n?: number; title: string; icon: typeof Check; status: CardStatus; progress?: { done: number; total: number } | null;
  facts?: (string | null | false | undefined)[]; summary?: string; lockedWhy?: string; open: boolean; onToggle: () => void; /** tuile double en mosaïque */ wide?: boolean; /** rubrique à traiter en priorité */ current?: boolean; children: React.ReactNode;
}) {
  const st = CARD_STATUS[status], pct = progress && progress.total ? Math.round((100 * progress.done) / progress.total) : status === "done" ? 100 : 0;
  const shown = (facts ?? []).filter(Boolean) as string[];
  const toggle = <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`contenu-${id}`} data-action="developper" className={clsx("inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition", open ? "bg-ink-100 text-ink-900 hover:bg-ink-200" : "bg-ink-950 text-white hover:bg-ink-800")}>{open ? "Réduire" : "Développer"}<ChevronDown className={clsx("size-4 transition", open && "rotate-180")} /></button>;
  const bar = progress && progress.total > 0 ? <div className="grid gap-1"><div className="h-1.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${title} : ${progress.done} sur ${progress.total}`}><div className={clsx("h-full rounded-full transition-all", st.bar)} style={{ width: `${pct}%` }} /></div><span className="text-[11px] text-ink-500">{progress.done}/{progress.total} point(s) traité(s)</span></div> : null;
  return (
    <section id={`rubrique-${id}`} aria-labelledby={`titre-${id}`} data-card={id} data-status={status}
      className={clsx("group/tile relative flex scroll-mt-24 flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 transition", open ? "col-span-full ring-2 ring-ink-900/80" : clsx(current ? "ring-2 ring-ember-500/70" : "ring-ink-100", "hover:-translate-y-0.5 hover:shadow-lift", wide && "sm:col-span-2"))} data-current={current ? "1" : undefined}>
      {/* liseré d'état en haut de la tuile */}
      <span aria-hidden="true" className={clsx("absolute inset-x-0 top-0 h-1", st.bar)} />
      {open ? (
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[auto_minmax(0,1fr)_12rem_auto] md:items-center">
          <span className={clsx("grid size-12 shrink-0 place-items-center rounded-2xl", st.bubble)} aria-hidden="true">{status === "done" ? <Check className="size-6" /> : status === "locked" ? <Lock className="size-5" /> : <I className="size-6" />}</span>
          <div className="min-w-0">{n != null && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Rubrique {n}</p>}<h2 id={`titre-${id}`} className="text-xl font-bold leading-tight sm:text-2xl">{title}</h2>{summary && <p className="mt-0.5 text-sm text-ink-600">{summary}</p>}</div>
          <div className="grid gap-1.5"><span className={clsx("w-fit rounded-full px-3 py-1 text-xs font-bold", st.chip)}>{st.label}</span>{bar}</div>
          {toggle}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 p-4 pt-5 sm:p-5 sm:pt-6">
          <div className="flex items-start justify-between gap-3">
            <span className={clsx("grid size-11 shrink-0 place-items-center rounded-2xl", st.bubble)} aria-hidden="true">{status === "done" ? <Check className="size-5" /> : status === "locked" ? <Lock className="size-5" /> : <I className="size-5" />}</span>
            <span className="flex flex-col items-end gap-1">{current && <span className="rounded-full bg-ember-500/10 px-2.5 py-0.5 text-[11px] font-bold text-ember-600">Prochaine étape</span>}<span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-bold", st.chip)} aria-label={`État : ${st.label}`}>{st.label}</span></span>
          </div>
          <div className="min-w-0">
            {n != null && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Rubrique {n}</p>}
            <h2 id={`titre-${id}`} className="text-xl font-bold leading-tight">{title}</h2>
            {summary && <p className={clsx("mt-1 text-sm text-ink-600", !wide && "line-clamp-3")}>{summary}</p>}
          </div>
          {shown.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label="Informations principales">{shown.map((f) => <li key={f} className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">{f}</li>)}</ul>}
          {status === "locked" && lockedWhy && <p className="flex items-start gap-1.5 text-sm font-medium text-ink-600"><Lock className="mt-0.5 size-3.5 shrink-0" />{lockedWhy}</p>}
          <div className="mt-auto grid gap-3 pt-1">{bar}{toggle}</div>
        </div>
      )}
      {open && <div id={`contenu-${id}`} className="grid gap-5 border-t border-ink-100 bg-paper/60 p-4 sm:p-6">{children}</div>}
    </section>
  );
}

const ItemIcon = ({ state }: { state: FlowItem["state"] }) => state === "done" ? <Check className="mt-0.5 size-4 shrink-0 text-pine-600" aria-label="Fait" /> : state === "optional" ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-ink-300" aria-label="Facultatif" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-label="À faire" />;
/** Points de la rubrique (sans les validations humaines, présentées à part). */
export function StepChecklist({ step }: { step: FlowStep }) {
  const list = step.items.filter((x) => !x.validateId); if (!list.length) return null;
  return <ul className="grid gap-1.5 rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:grid-cols-2" aria-label="Points de la rubrique">{list.map((x) => <li key={x.id} className="flex gap-2 text-sm"><ItemIcon state={x.state} /><span className={clsx(x.state === "done" && "text-ink-500")}>{x.label}{x.state === "optional" && <span className="ml-1 text-xs text-ink-400">(facultatif)</span>}{x.hint && x.state !== "done" && <span className="block text-xs text-ink-500">{x.hint}</span>}</span></li>)}</ul>;
}
export function StepValidations({ step, ev, save }: { step: FlowStep; ev: EventModel; save: Save }) {
  const vals = step.items.filter((x) => x.validateId); if (!vals.length) return null;
  return <div className="rounded-2xl bg-white p-4 ring-1 ring-ink-100"><h3 className="flex items-center gap-2 text-base font-bold"><ShieldCheck className="size-5 text-glacier-600" />Votre validation</h3><p className="text-sm text-ink-500">Ces décisions vous engagent : le site les prépare mais ne les prend pas à votre place.</p><div className="mt-3 grid gap-2 md:grid-cols-2">{vals.map((x) => <ValidateBox key={x.id} item={x} ev={ev} save={save} />)}</div></div>;
}

type Gen = "a-generer" | "genere" | "a-completer" | "indisponible";
const GEN: Record<Gen, { label: string; cls: string }> = {
  "a-generer": { label: "À générer", cls: "bg-white text-ink-700 ring-1 ring-ink-300" },
  genere: { label: "Généré", cls: "bg-pine-600 text-white" },
  "a-completer": { label: "À compléter", cls: "bg-warn/15 text-[#8a5a00] ring-1 ring-warn/40" },
  indisponible: { label: "Après génération", cls: "bg-ink-100 text-ink-500" },
};
const placeholders = (t: string) => (t.match(/\[[^\]]*(compléter|préciser)[^\]]*\]/gi) ?? []).length;

/**
 * Génération automatique — facultative. L'organisateur choisit : le site prépare ses documents, ou il a déjà les siens
 * et passe directement à la logistique. Tout ce que le site sait générer est listé avec son état.
 */
export function GenerationPanel({ ev, save, flow, onOpen }: { ev: EventModel; save: Save; flow: Flow; onOpen: (id: string) => void }) {
  const prep = ev.prep ?? {}, mode = prep.docMode;
  const setMode = (m: "site" | "propres" | undefined) => save((e) => ({ ...e, prep: { ...(e.prep ?? {}), docMode: m } }));
  const file = adminFile(ev, prep), fileOk = file.filter((f) => f.ok).length, ph = placeholders(ev.rules);
  const late = /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? timeline(ev.date, !!prep.multiDept).length : 0;
  const rows: { id: string; icon: typeof Check; title: string; what: string; state: Gen; detail?: string }[] = [
    { id: "analyse", icon: ScanSearch, title: "Analyse des parcours", what: "Goudron, chemins, traversées de routes, départements traversés", state: prep.analysedAt ? "genere" : "a-generer", detail: prep.analysedAt ? `le ${new Date(prep.analysedAt).toLocaleDateString("fr-FR")}${prep.departments?.length ? ` · départements ${prep.departments.join(", ")}` : ""}` : undefined },
    { id: "reglement", icon: FileText, title: "Règlement", what: "Rédigé à partir de vos courses et de l'analyse", state: ev.rules.trim().length < 40 ? "a-generer" : ph ? "a-completer" : "genere", detail: ev.rules.trim().length >= 40 && ph ? `${ph} mention(s) entre crochets à compléter` : undefined },
    { id: "dossier", icon: ClipboardList, title: "Dossier administratif", what: "Pièces à réunir pour la mairie ou la préfecture", state: !prep.docsAt ? "a-generer" : fileOk < file.length ? "a-completer" : "genere", detail: prep.docsAt ? `${fileOk}/${file.length} pièce(s) prête(s)` : undefined },
    { id: "echeancier", icon: CalendarClock, title: "Échéancier", what: "Les échéances datées jusqu'au jour J", state: !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? "a-completer" : prep.docsAt ? "genere" : "a-generer", detail: /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? `${late} échéance(s)` : "date de l'événement à renseigner" },
    { id: "pdf", icon: FileDown, title: "Dossier de préparation (PDF)", what: "Tout réuni dans un document à partager", state: prep.docsAt ? "genere" : "indisponible", detail: prep.docsAt ? undefined : "après la génération des documents" },
  ];
  const pdf = async () => download(`${safeName(ev.name)}-preparation.pdf`, await prepPdf(ev.name, `${ev.organizer || "Organisateur à préciser"} · ${ev.date || "date à préciser"} · ${ev.place || "lieu à préciser"}`, PREP_NOTICE, prepReport(ev, prep)), "application/pdf");
  const choice = (m: "site" | "propres", t: string, d: string, I: typeof Check) => (
    <label className={clsx("flex cursor-pointer gap-3 rounded-2xl p-4 ring-2 transition", mode === m ? "bg-white ring-ink-900" : "bg-white/70 ring-ink-100 hover:ring-ink-300")}>
      <input type="radio" name={`docmode-${ev.id}`} className="mt-1 size-4 accent-[var(--color-pine-600)]" checked={mode === m} onChange={() => setMode(m)} data-docmode={m} />
      <span><span className="flex items-center gap-2 font-bold"><I className="size-4 text-pine-600" />{t}</span><span className="mt-0.5 block text-sm text-ink-600">{d}</span></span>
    </label>);
  return (
    <section aria-labelledby="gen-titre" className="grid gap-4 rounded-3xl bg-white p-4 ring-1 ring-ink-100 sm:p-5" data-generation>
      <div><p className="eyebrow">Facultatif</p><h3 id="gen-titre" className="text-xl font-bold">Génération automatique</h3><p className="text-sm text-ink-600">Le site peut préparer pour vous l&apos;analyse des parcours et les documents. Vous n&apos;êtes pas obligé de passer par là : si vous avez déjà vos documents, passez directement à la logistique.</p></div>
      <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Préparation des documents">
        {choice("site", "Le site prépare mes documents", "Analyse des parcours, règlement, dossier administratif, échéancier et PDF. Ces éléments comptent alors dans votre progression.", Sparkles)}
        {choice("propres", "J'ai déjà mes documents", "Vous confirmez seulement qu'ils sont prêts. L'analyse et la génération restent disponibles si besoin, sans être demandées.", FileText)}
      </div>
      {mode && <button type="button" onClick={() => setMode(undefined)} className="w-fit text-xs font-semibold text-ink-500 underline">Décider plus tard (tout reste facultatif)</button>}
      {mode === "propres" && <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-pine-50 p-3 text-sm text-pine-800"><Check className="size-4" />Vous avez vos documents : la logistique vous attend.<button type="button" className="font-semibold underline" onClick={() => onOpen("logistique")}>Aller à la logistique</button></p>}
      <ul className="grid gap-2" aria-label="Éléments générables">{rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper/70 p-3 ring-1 ring-ink-100" data-gen={r.id} data-gen-state={r.state}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-ink-700 ring-1 ring-ink-100"><r.icon className="size-4" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{r.title}</span><span className="block text-xs text-ink-500">{r.what}{r.detail ? ` · ${r.detail}` : ""}</span></span>
          <span className={clsx("rounded-full px-2.5 py-1 text-xs font-bold", GEN[r.state].cls)}>{GEN[r.state].label}</span>
          {r.id === "pdf" && prep.docsAt ? <button type="button" onClick={pdf} className="text-sm font-semibold text-pine-700 underline">Télécharger</button> : null}
          {r.id === "reglement" && ev.rules.trim().length >= 40 ? <button type="button" onClick={() => onOpen("documents")} className="text-sm font-semibold text-pine-700 underline">Voir</button> : null}
        </li>))}</ul>
      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0"><AnalyseRunner ev={ev} save={save} /><DocumentsRunner ev={ev} save={save} /></div>
      <p className="text-xs text-ink-500">{flow.percent} % de l&apos;organisation est prêt. {mode === "site" ? "Les éléments générés comptent dans ce pourcentage." : "L'analyse et les documents générés n'entrent pas dans ce pourcentage tant que vous ne choisissez pas « Le site prépare mes documents »."}</p>
    </section>
  );
}
