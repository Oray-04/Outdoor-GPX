"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Lock, CircleDashed, ShieldCheck, Sparkles, Loader2, ArrowRight, ArrowLeft, Route as RouteIcon, Upload, Wand2, Compass, PenLine, TriangleAlert, CircleCheck, ListChecks, FileDown } from "lucide-react";
import clsx from "clsx";
import { Button, ButtonLink } from "@/components/ui/button";
import { routesRepo } from "@/lib/repo";
import { routeSurvey, profileForSport } from "@/lib/routing";
import { proposePosts, type EventModel } from "@/lib/events";
import { departmentsAlong, rulesDraft, PREP_NOTICE, prepReport, type Prep } from "@/lib/race-prep";
import { trailFlow, type Flow, type FlowItem, type FlowStep, type StepId } from "@/lib/trail-flow";
import { trackStats, fmtKm, fmtM } from "@/lib/geo";
import { download, safeName } from "@/lib/formats";
import { prepPdf } from "@/lib/pdf";
import { editorHref } from "@/lib/url";
import { uid, type LL } from "@/lib/types";

export type Save = (fn: (e: EventModel) => EventModel) => void;
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const useFlow = (ev: EventModel): Flow => { const routes = routesRepo.useAll(); return trailFlow(ev, routes.map((r) => r.id), todayISO()); };

const STATUS: Record<FlowStep["status"], { label: string; cls: string }> = {
  done: { label: "Terminé", cls: "bg-pine-600 text-white" }, progress: { label: "En cours", cls: "bg-ember-500 text-white" },
  todo: { label: "À faire", cls: "bg-white text-ink-700 ring-1 ring-ink-300" }, locked: { label: "Verrouillé", cls: "bg-ink-100 text-ink-400" },
};

/** Fil des six étapes : numéro, état, avancement. Une étape verrouillée dit ce qui la débloque. */
export function Stepper({ flow, active, onPick }: { flow: Flow; active: StepId; onPick: (s: StepId) => void }) {
  return (
    <nav aria-label="Étapes de l'organisation" className="rounded-2xl bg-white p-2 shadow-card ring-1 ring-ink-100">
      <ol className="flex gap-1 overflow-x-auto lg:grid lg:grid-cols-6">
        {flow.steps.map((s) => { const on = s.id === active, locked = s.status === "locked"; return (
          <li key={s.id} className="min-w-[8.5rem] flex-1 lg:min-w-0">
            <button type="button" onClick={() => onPick(s.id)} aria-current={on ? "step" : undefined} title={locked ? s.lockedWhy : undefined} data-step={s.id} data-status={s.status}
              className={clsx("flex h-full w-full flex-col gap-1.5 rounded-xl px-3 py-2.5 text-left transition", on ? "bg-ink-950 text-white shadow-lift" : locked ? "text-ink-400 hover:bg-ink-50" : "text-ink-800 hover:bg-ink-50")}>
              <span className="flex items-center gap-2">
                <span className={clsx("grid size-7 shrink-0 place-items-center rounded-full font-display text-xs font-bold", s.status === "done" ? "bg-pine-600 text-white" : on ? "bg-brass-400 text-ink-950" : locked ? "bg-ink-100 text-ink-400" : s.status === "progress" ? "bg-ember-500 text-white" : "bg-ink-100 text-ink-700")}>{s.status === "done" ? <Check className="size-4" /> : locked ? <Lock className="size-3.5" /> : s.n}</span>
                <span className="truncate text-sm font-semibold">{s.short}</span>
              </span>
              <span className={clsx("text-[11px] font-medium", on ? "text-white/70" : "text-ink-500")}>{locked ? "Verrouillé" : s.id === "verification" ? `${flow.todo.length + flow.toValidate.length} point(s) ouvert(s)` : `${s.done}/${s.total} · ${STATUS[s.status].label}`}</span>
              <span className={clsx("h-1 overflow-hidden rounded-full", on ? "bg-white/15" : "bg-ink-100")}><span className={clsx("block h-full rounded-full", s.status === "done" ? "bg-pine-500" : "bg-ember-500")} style={{ width: `${s.total ? (100 * s.done) / s.total : 0}%` }} /></span>
            </button>
          </li>); })}
      </ol>
    </nav>
  );
}

const ItemIcon = ({ state }: { state: FlowItem["state"] }) => state === "done" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-pine-600" aria-label="Fait" /> : state === "validate" ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-glacier-600" aria-label="À valider" /> : state === "optional" ? <CircleDashed className="mt-0.5 size-4 shrink-0 text-ink-300" aria-label="Facultatif" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-label="À faire" />;

/** Validation humaine : le site prépare, l'organisateur engage sa responsabilité en cochant. */
export function ValidateBox({ item, ev, save }: { item: FlowItem; ev: EventModel; save: Save }) {
  const on = (ev.prep?.validated ?? []).includes(item.validateId!), ready = item.state !== "todo";
  return (
    <label className={clsx("flex gap-3 rounded-xl border p-3 text-sm", on ? "border-pine-200 bg-pine-50" : ready ? "border-glacier-500/40 bg-glacier-100/50" : "border-ink-100 bg-ink-50 text-ink-500")}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-pine-600)]" checked={on} disabled={!ready && !on} onChange={() => save((e) => { const v = new Set(e.prep?.validated ?? []); if (v.has(item.validateId!)) v.delete(item.validateId!); else v.add(item.validateId!); return { ...e, prep: { ...(e.prep ?? {}), validated: [...v] } }; })} />
      <span><span className="flex items-center gap-1.5 font-semibold"><ShieldCheck className="size-4 text-glacier-600" />{item.label}</span><span className="mt-0.5 block text-xs text-ink-600">{on ? "Validé par vous." : ready ? item.hint : "Disponible quand les éléments à valider seront prêts."}</span></span>
    </label>
  );
}

/** En-tête d'étape : objectif, ce que le site fait seul, ce qu'il reste à faire, étape suivante. */
export function StepFrame({ step, flow, ev, save, onPick, auto, children }: { step: FlowStep; flow: Flow; ev: EventModel; save: Save; onPick: (s: StepId) => void; auto?: string; children: React.ReactNode }) {
  const i = flow.steps.findIndex((s) => s.id === step.id), prev = flow.steps[i - 1], next = flow.steps[i + 1];
  const open = step.items.filter((x) => x.state === "todo"), vals = step.items.filter((x) => x.validateId);
  return (
    <section aria-labelledby="step-title" className="mt-5">
      <header className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100">
        <p className="eyebrow">Étape {step.n} sur 6</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 id="step-title" className="text-2xl">{step.title}</h2><p className="mt-1 max-w-2xl text-sm text-ink-600">{step.goal}</p></div>
          <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold", STATUS[step.status].cls)}>{STATUS[step.status].label}</span></div>
        {auto && <p className="mt-3 flex gap-2 rounded-xl bg-brass-100/70 px-3 py-2 text-sm text-ink-800"><Sparkles className="mt-0.5 size-4 shrink-0 text-brass-600" /><span><b>Automatique :</b> {auto}</span></p>}
        {step.id !== "verification" && step.items.length > 0 && (
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label="Avancement de l'étape">{step.items.filter((x) => !x.validateId).map((x) => <li key={x.id} className="flex gap-2 text-sm"><ItemIcon state={x.state} /><span className={clsx(x.state === "done" && "text-ink-500")}>{x.label}{x.hint && x.state !== "done" && <span className="block text-xs text-ink-500">{x.hint}</span>}</span></li>)}</ul>)}
      </header>
      <div className="mt-5 grid gap-5">{children}</div>
      {vals.length > 0 && step.id !== "verification" && <div className="mt-5 rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100"><h3 className="flex items-center gap-2 text-base font-bold"><ShieldCheck className="size-5 text-glacier-600" />Votre validation</h3><p className="text-sm text-ink-500">Ces décisions vous engagent : le site les prépare mais ne les prend pas à votre place.</p><div className="mt-3 grid gap-2 md:grid-cols-2">{vals.map((v) => <ValidateBox key={v.id} item={v} ev={ev} save={save} />)}</div></div>}
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {prev ? <Button variant="secondary" onClick={() => onPick(prev.id)}><ArrowLeft className="size-4" />{prev.short}</Button> : <span />}
        {next && (next.status === "locked"
          ? <p className="flex items-center gap-2 text-sm text-ink-600"><Lock className="size-4 text-ink-400" />Pour passer à « {next.title} » : {next.lockedWhy}</p>
          : <Button onClick={() => onPick(next.id)} data-next>{open.length ? `Continuer vers ${next.short}` : `Étape suivante : ${next.short}`}<ArrowRight className="size-4" /></Button>)}
      </footer>
    </section>
  );
}

/** Étape 1 : les parcours enregistrés, et les quatre façons d'en obtenir un. */
export function StepParcours({ ev }: { ev: EventModel }) {
  const routes = routesRepo.useAll();
  const used = (id: string) => ev.races.filter((r) => r.routeId === id).map((r) => r.label);
  const ways: [string, string, string, typeof PenLine][] = [["/creer", "Tracer un parcours", "Cliquez sur la carte : le tracé suit les sentiers.", PenLine], ["/fichiers", "Importer un GPX", "Reprenez une trace enregistrée avec une montre ou une autre application.", Upload], ["/generer", "Générer une boucle", "Un départ, une distance : le site propose des boucles.", Wand2], ["/explorer", "Explorer la carte", "Repérez le terrain, puis ouvrez l'éditeur.", Compass]];
  return (<>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{ways.map(([href, t, d, I]) => <Link key={href} href={href} className="group rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100 transition hover:-translate-y-0.5 hover:shadow-lift"><span className="grid size-10 place-items-center rounded-xl bg-pine-50 text-pine-700"><I className="size-5" /></span><span className="mt-3 block font-semibold">{t}</span><span className="mt-0.5 block text-sm text-ink-500">{d}</span><span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-pine-700">Ouvrir<ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></span></Link>)}</div>
    <div className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100">
      <h3 className="text-base font-bold">Vos parcours enregistrés ({routes.length})</h3>
      <p className="text-sm text-ink-500">Un parcours par course. Pensez à cliquer sur « Enregistrer » dans l&apos;éditeur, puis revenez ici.</p>
      {!routes.length ? <p className="mt-3 rounded-xl border border-dashed border-ink-200 p-5 text-sm text-ink-600">Aucun parcours pour l&apos;instant. Commencez par en tracer ou en importer un : c&apos;est lui qui fournira distance, dénivelé et tracé à tout le reste.</p> : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">{routes.map((r) => { const s = trackStats(r.coords, 3), u = used(r.id); return (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-50 text-ink-600"><RouteIcon className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.name}</span><span className="block text-xs text-ink-500">{fmtKm(s.distanceM)} · {fmtM(s.gainM)} D+ · {fmtM(s.lossM)} D−{r.pois.length ? ` · ${r.pois.length} point(s) d'intérêt` : ""}</span>{u.length > 0 && <span className="mt-0.5 block text-xs font-medium text-pine-700">Utilisé par : {u.join(", ")}</span>}</span>
            <Link href={editorHref(r.id)} className="shrink-0 text-sm font-semibold text-pine-700 underline">Modifier</Link></li>); })}</ul>)}
    </div>
  </>);
}

/** Étape 3, premier clic : relevé de chaque parcours (goudron, chemins, routes rencontrées) et départements traversés. Rien n'est supposé : ce qui n'a pas pu être mesuré est dit. */
export function AnalyseRunner({ ev, save }: { ev: EventModel; save: Save }) {
  const routes = routesRepo.useAll();
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const linked = ev.races.filter((r) => r.routeId && routes.some((x) => x.id === r.routeId)), prep = ev.prep ?? {};
  async function run() {
    setMsg(null); const paved = { ...(prep.paved ?? {}) }, offRoad = { ...(prep.offRoad ?? {}) }, roads = { ...(prep.roads ?? {}) }, deps = new Set<string>(); let ok = 0, depOk = true;
    for (const r of linked) {
      setBusy(`Lecture du parcours « ${r.label} »…`);
      const line = routes.find((x) => x.id === r.routeId)!.coords.map((c) => [c[0], c[1]] as LL);
      try { const s = await routeSurvey(line, profileForSport(r.sport)); if (s) { paved[r.id] = s.pavedPct; offRoad[r.id] = s.offRoadPct; roads[r.id] = s.roads; ok++; } } catch { /* service indisponible : non renseigné */ }
      const d = await departmentsAlong(line); if (d) d.forEach((x) => deps.add(x)); else depOk = false;
    }
    const departments = depOk ? [...deps].sort() : prep.departments;
    save((e) => ({ ...e, prep: { ...(e.prep ?? {}), paved, offRoad, roads, departments, analysedAt: Date.now(), ...(depOk && deps.size ? { multiDept: deps.size > 1 } : {}) } }));
    const n = linked.reduce((s, r) => s + (roads[r.id]?.length ?? 0), 0);
    setMsg(ok === linked.length && depOk ? { kind: "ok", text: `Analyse terminée : ${linked.length} parcours lu(s), ${n} traversée(s) ou passage(s) sur route repéré(s)${deps.size ? `, département(s) ${[...deps].sort().join(", ")}` : ""}.` } : { kind: "warn", text: `Analyse incomplète : ${ok}/${linked.length} parcours lu(s)${depOk ? "" : ", départements non obtenus"}. Un service de calcul n'a pas répondu : relancez dans un instant. Ce qui manque est signalé ci-dessous.` });
    setBusy(null);
  }
  return (
    <div className="rounded-2xl bg-ink-950 p-5 text-white shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className="eyebrow !text-brass-400">Premier clic</p><h3 className="mt-1 text-xl font-bold">{prep.analysedAt ? "Analyse effectuée" : "Analyser mes parcours"}</h3>
        <p className="mt-1 max-w-xl text-sm text-white/70">Le site lit {linked.length} parcours : part de goudron et de sentiers, traversées de routes, départements. Aucune saisie.{prep.analysedAt ? ` Dernière analyse le ${new Date(prep.analysedAt).toLocaleDateString("fr-FR")}.` : ""}</p></div>
        <Button size="lg" disabled={!!busy || !linked.length} onClick={run} data-action="analyser">{busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}{prep.analysedAt ? "Relancer l'analyse" : "Lancer l'analyse"}</Button></div>
      {busy && <p role="status" className="mt-3 text-sm text-white/80">{busy}</p>}
      {msg && <p role="status" className={clsx("mt-3 rounded-lg px-3 py-2 text-sm", msg.kind === "ok" ? "bg-pine-600/30 text-white" : "bg-warn/25 text-white")}>{msg.text}</p>}
    </div>
  );
}

/** Étape 4, second clic : règlement (s'il n'existe pas), postes proposés pour chaque course sans poste, à partir du parcours et de l'analyse. Rien d'existant n'est écrasé. */
export function DocumentsRunner({ ev, save }: { ev: EventModel; save: Save }) {
  const routes = routesRepo.useAll(); const prep: Prep = ev.prep ?? {};
  const [msg, setMsg] = useState<string | null>(null);
  const run = () => {
    let nPosts = 0, nRaces = 0; const wroteRules = !ev.rules.trim();
    save((e) => {
      let posts = e.posts;
      for (const r of e.races) {
        if (posts.some((p) => p.raceId === r.id)) continue;
        const rt = routes.find((x) => x.id === r.routeId); if (!rt) continue;
        const add = proposePosts({ race: r, coords: rt.coords, pois: rt.pois, roads: e.prep?.roads?.[r.id] ?? [], newId: uid });
        posts = [...posts, ...add]; nPosts += add.length; nRaces++;
      }
      return { ...e, posts, rules: e.rules.trim() ? e.rules : rulesDraft(e, e.prep ?? {}), prep: { ...(e.prep ?? {}), docsAt: Date.now() } };
    });
    setMsg(`${wroteRules ? "Règlement rédigé. " : "Règlement existant conservé. "}${nPosts ? `${nPosts} poste(s) proposé(s) sur ${nRaces} course(s) : départ, arrivée, ravitaillements, secours, signaleurs.` : "Postes existants conservés."} Dossier administratif, échéancier et dossier de préparation sont à jour.`);
  };
  const pdf = async () => download(`${safeName(ev.name)}-preparation.pdf`, await prepPdf(ev.name, `${ev.organizer || "Organisateur à préciser"} · ${ev.date || "date à préciser"} · ${ev.place || "lieu à préciser"}`, PREP_NOTICE, prepReport(ev, prep)), "application/pdf");
  return (
    <div className="rounded-2xl bg-ink-950 p-5 text-white shadow-lift">
      <div className="flex flex-wrap items-center justify-between gap-4"><div className="min-w-0"><p className="eyebrow !text-brass-400">Second clic</p><h3 className="mt-1 text-xl font-bold">{prep.docsAt ? "Documents générés" : "Générer les documents et la logistique"}</h3>
        <p className="mt-1 max-w-xl text-sm text-white/70">Règlement, dossier administratif, échéancier, dossier de préparation, et une logistique proposée (postes placés sur chaque parcours). Ce que vous avez déjà saisi n&apos;est jamais écrasé.</p></div>
        <div className="flex flex-wrap gap-2"><Button size="lg" onClick={run} data-action="generer"><Sparkles className="size-5" />{prep.docsAt ? "Régénérer ce qui manque" : "Tout générer"}</Button>{prep.docsAt && <Button size="lg" variant="onDark" onClick={pdf}><FileDown className="size-5" />PDF</Button>}</div></div>
      {msg && <p role="status" className="mt-3 rounded-lg bg-pine-600/30 px-3 py-2 text-sm">{msg}</p>}
    </div>
  );
}

/** Étape 6 : tout l'événement en trois colonnes. */
export function FinalCheck({ flow, ev, save, onPick }: { flow: Flow; ev: EventModel; save: Save; onPick: (s: StepId) => void }) {
  const title = (id: StepId) => flow.steps.find((s) => s.id === id)!.short;
  const col = (t: string, hint: string, I: typeof ListChecks, tone: string, children: React.ReactNode, n: number) => <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100" aria-label={t}><h3 className="flex items-center gap-2 text-base font-bold"><I className={clsx("size-5", tone)} />{t}<span className="ml-auto rounded-full bg-ink-50 px-2 py-0.5 font-display text-sm">{n}</span></h3><p className="text-xs text-ink-500">{hint}</p><div className="mt-3 grid gap-2">{children}</div></section>;
  const ready = !flow.todo.length && !flow.toValidate.length;
  return (<>
    <div className={clsx("rounded-2xl p-5 shadow-card ring-1", ready ? "bg-pine-600 text-white ring-pine-600" : "bg-white ring-ink-100")} role="status">
      <p className={clsx("eyebrow", ready && "!text-white/80")}>Bilan</p>
      <p className="mt-1 text-xl font-bold">{ready ? "Votre trail est prêt." : `${flow.percent} % prêt — ${flow.todo.length} point(s) à compléter, ${flow.toValidate.length} à valider.`}</p>
      <p className={clsx("mt-1 text-sm", ready ? "text-white/80" : "text-ink-600")}>{ready ? "Tout est renseigné et validé. Gardez un œil sur l'échéancier jusqu'au jour J." : "Chaque ligne ci-dessous renvoie à l'étape où la traiter."}</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-3">
      {col("À compléter", "Informations ou actions manquantes.", TriangleAlert, "text-warn", flow.todo.length ? flow.todo.map((x) => <button key={x.id} type="button" onClick={() => onPick(x.step)} className="rounded-xl border border-warn/40 bg-warn/5 p-3 text-left text-sm hover:bg-warn/10"><span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-500">{title(x.step)}</span><span className="font-medium">{x.label}</span>{x.hint && <span className="block text-xs text-ink-600">{x.hint}</span>}</button>) : <p className="text-sm text-pine-700">Rien à compléter.</p>, flow.todo.length)}
      {col("À valider par vous", "Documents officiels et décisions de sécurité.", ShieldCheck, "text-glacier-600", flow.toValidate.length ? flow.toValidate.map((x) => <ValidateBox key={x.id} item={x} ev={ev} save={save} />) : <p className="text-sm text-pine-700">Aucune validation en attente.</p>, flow.toValidate.length)}
      {col("Terminé", "Fait par vous ou calculé par le site.", CircleCheck, "text-pine-600", flow.done.map((x) => <p key={x.id} className="flex gap-2 text-sm text-ink-600"><Check className="mt-0.5 size-4 shrink-0 text-pine-600" />{x.label}</p>), flow.done.length)}
    </div>
  </>);
}

export function LockedPanel({ step, onPick, flow }: { step: FlowStep; flow: Flow; onPick: (s: StepId) => void }) {
  const cur = flow.steps.find((s) => s.id === flow.current)!;
  return <div className="mt-5 rounded-2xl border border-dashed border-ink-300 bg-white/70 p-8 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-ink-100 text-ink-500"><Lock className="size-5" /></span><h2 className="mt-3 text-xl">Étape {step.n} — {step.title}</h2><p className="mx-auto mt-1 max-w-md text-sm text-ink-600">{step.goal}</p><p className="mx-auto mt-3 max-w-md rounded-xl bg-warn/10 px-3 py-2 text-sm font-medium text-ink-800">Pour l&apos;ouvrir : {step.lockedWhy}</p><div className="mt-4 flex justify-center"><ButtonLink href="#" onClick={(e) => { e.preventDefault(); onPick(cur.id); }}>Aller à l&apos;étape {cur.n} — {cur.short}<ArrowRight className="size-4" /></ButtonLink></div></div>;
}
