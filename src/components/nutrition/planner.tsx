"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, User, Mountain, CloudSun, SlidersHorizontal, Sparkles, Package, FolderOpen, BookOpen, Trash2, RotateCcw, RefreshCw } from "lucide-react";
import { eventsRepo, routesRepo } from "@/lib/repo";
import { refreshLinked } from "@/lib/nutrition/link";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { computeNutrition, validateInput, type FieldError, type NutritionResult } from "@/lib/nutrition/engine";
import { productsRepo, plansRepo, loadDraft, saveDraft, emptyInput } from "@/lib/nutrition/storage";
import { nutritionPdf } from "@/lib/nutrition/pdf";
import { REFERENCES, ESTABLISHED, ASSUMPTIONS, DISCLAIMER } from "@/lib/nutrition/references";
import { fmtDur } from "@/lib/nutrition/labels";
import type { PlanInput } from "@/lib/nutrition/types";
import { download, safeName } from "@/lib/formats";
import { uid } from "@/lib/types";
import { StepProfile, StepRace, StepWeather, StepPrefs } from "./steps";
import { Results, Notices } from "./results";
import { Catalog } from "./catalog";

type V = Omit<PlanInput, "products">;
const STEPS = [
  { n: 1, title: "Profil", I: User }, { n: 2, title: "Course", I: Mountain }, { n: 3, title: "Météo", I: CloudSun }, { n: 4, title: "Produits", I: SlidersHorizontal }, { n: 5, title: "Plan", I: Sparkles },
] as const;
type Tab = "plan" | "produits" | "plans" | "methode";

/** Planificateur nutritionnel : assistant en cinq étapes, catalogue de produits, plans enregistrés, méthode et références. */
export function NutritionPlanner() {
  const [tab, setTab] = useState<Tab>("plan");
  const [v, setV] = useState<V>(emptyInput);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(1);
  const [savedId, setSavedId] = useState<string | null>(null);
  const products = productsRepo.useAll(), plans = plansRepo.useAll();
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { setV(loadDraft()); setReady(true); }, []);
  useEffect(() => { if (ready) saveDraft(v); }, [v, ready]);
  const set = (fn: (x: V) => V) => { setV(fn); setSavedId(null); };
  const input: PlanInput = useMemo(() => ({ ...v, products, prefs: { ...v.prefs, productIds: v.prefs.productIds.filter((id) => products.some((p) => p.id === id)), drinkId: v.prefs.drinkId && products.some((p) => p.id === v.prefs.drinkId) ? v.prefs.drinkId : null } }), [v, products]);
  const check = useMemo(() => validateInput(input), [input]);
  const errsOf = (s: number) => check.errors.filter((e) => e.step === s);
  const firstBad = check.errors.length ? Math.min(...check.errors.map((e) => e.step)) : null;
  const [tick, setTick] = useState(0);
  const result: NutritionResult | null = useMemo(() => { if (check.errors.length) return null; try { return computeNutrition(input, uid); } catch { return null; } }, [input, check.errors.length, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const [note, setNote] = useState<string | null>(null);
  /** Actualiser : relit la saisie, les produits et les plans enregistrés, reprend les données du parcours ou de la course liée, puis recalcule le plan. */
  const refresh = () => {
    const res = refreshLinked(loadDraft(), eventsRepo.getAll(), routesRepo.getAll(), uid);
    setV(res.v); setTick((t) => t + 1); setNote(`Actualisé à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. ${res.note}`);
  };
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const go = (s: number) => { setStep(s); requestAnimationFrame(() => { const t = top.current; if (t && t.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + t.getBoundingClientRect().top - 80, behavior: "smooth" }); }); };
  const next = () => { setShown((x) => ({ ...x, [step]: true })); if (errsOf(step).length) return; go(step + 1); };
  const state = (n: number) => (n === 5 ? (result ? "ok" : "locked") : errsOf(n).length ? (shown[n] ? "bad" : "todo") : "ok");
  const pdf = async () => { if (result) download(`${safeName(v.race.name || "plan-nutritionnel")}-nutrition.pdf`, await nutritionPdf(input, result), "application/pdf"); };
  const save = () => { const id = savedId ?? uid(); plansRepo.upsert({ id, name: v.race.name || `Plan du ${new Date().toLocaleDateString("fr-FR")}`, savedAt: Date.now(), input: v }); setSavedId(id); };
  const vis = (errors: FieldError[], s: number) => (shown[s] ? errors : []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Nutrition</p><h1 className="text-3xl sm:text-4xl">Planificateur nutritionnel</h1><p className="mt-1 max-w-2xl text-ink-600">Quoi manger et boire pendant votre course, et quand : un plan simple, prise par prise, avec vos propres produits.</p></div>
        <Button variant="secondary" onClick={refresh} data-action="actualiser" title="Recharger vos produits, vos plans et les données du parcours lié, puis recalculer"><RefreshCw className="size-4" />Actualiser</Button>
      </header>
      {note && <p role="status" className="mt-3 rounded-xl bg-pine-50 px-3 py-2 text-sm text-pine-800">{note}</p>}
      <div role="tablist" aria-label="Sections du planificateur" className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-ink-100/80 p-1">
        {([["plan", "Planifier", Sparkles], ["produits", `Mes produits (${products.length})`, Package], ["plans", `Mes plans (${plans.length})`, FolderOpen], ["methode", "Méthode", BookOpen]] as const).map(([k, l, I]) => <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition", tab === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900")}><I className="size-4" />{l}</button>)}
      </div>

      {tab === "plan" && (
        <div ref={top} className="mt-6 scroll-mt-24 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          <nav aria-label="Étapes" className="lg:sticky lg:top-20">
            <ol className="frost-panel flex gap-1 overflow-x-auto p-2 lg:grid lg:overflow-visible">
              {STEPS.map(({ n, title, I }) => { const st = state(n), on = step === n, locked = n === 5 && !result; return (
                <li key={n} className="min-w-[7.5rem] flex-1 lg:min-w-0"><button type="button" onClick={() => { if (!locked) go(n); else { setShown({ 1: true, 2: true, 3: true, 4: true }); if (firstBad) go(firstBad); } }} aria-current={on ? "step" : undefined} data-step={n}
                  className={clsx("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition", on ? "bg-ink-950 text-white shadow-lift" : "hover:bg-white/70")}>
                  <span className={clsx("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold", st === "ok" && !on ? "bg-pine-600 text-white" : st === "bad" ? "bg-danger text-white" : on ? "bg-brass-400 text-ink-950" : "bg-ink-100 text-ink-600")}>{locked ? <Lock className="size-3.5" /> : st === "ok" && !on && n < 5 ? <Check className="size-4" /> : <I className="size-3.5" />}</span>
                  <span className="min-w-0"><span className="block text-sm font-semibold">{n}. {title}</span><span className={clsx("block text-[11px]", on ? "text-white/70" : "text-ink-500")}>{n === 5 ? (result ? "Prêt" : "Compléter les étapes") : st === "bad" ? "À corriger" : st === "ok" ? "Complet" : "À remplir"}</span></span>
                </button></li>); })}
            </ol>
            <button type="button" className="mt-2 hidden items-center gap-1.5 px-2 text-xs font-semibold text-ink-500 hover:text-ink-800 lg:inline-flex" onClick={() => { if (confirm("Effacer toute la saisie en cours ?")) { setV(emptyInput()); setShown({}); setStep(1); } }}><RotateCcw className="size-3.5" />Nouvelle saisie</button>
          </nav>
          <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:mt-0">
            {step === 1 && <section className="rounded-2xl bg-brass-100/60 p-4 ring-1 ring-brass-200 sm:p-5" aria-label="Comment ça marche" data-guide>
              <p className="font-bold text-ink-900">Vous débutez ? Voici comment ça marche</p>
              <ol className="mt-2 grid gap-1.5 text-sm text-ink-700 sm:grid-cols-3">
                <li className="flex gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-950 text-xs font-bold text-white">1</span>Quelques questions sur vous, la course et la météo (2 minutes).</li>
                <li className="flex gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-950 text-xs font-bold text-white">2</span>Vous cochez ce que vous emporterez : gels, barres, boisson…</li>
                <li className="flex gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-950 text-xs font-bold text-white">3</span>Le site calcule quoi prendre et à quelle fréquence, prise par prise.</li>
              </ol>
              <p className="mt-2 text-xs text-ink-600">Les quantités dépendent de la durée, de l&apos;intensité et de votre habitude : ce sont des repères à tester à l&apos;entraînement, pas une règle universelle. Dans le doute, laissez les réglages par défaut.</p>
            </section>}
            {step === 1 && <StepProfile v={v} set={set} errors={vis(errsOf(1), 1)} />}
            {step === 2 && <StepRace v={v} set={set} errors={vis(errsOf(2), 2)} />}
            {step === 3 && <StepWeather v={v} set={set} errors={vis(errsOf(3), 3)} />}
            {step === 4 && <StepPrefs v={v} set={set} errors={vis(errsOf(4), 4)} result={result} />}
            {step === 5 && (result ? <Results input={input} r={result} onPdf={pdf} onSave={save} saved={!!savedId} /> : <div className="frost-panel p-6 text-center"><Lock className="mx-auto size-6 text-ink-400" /><p className="mt-2 font-semibold">Le plan se génère dès que les informations indispensables sont renseignées.</p><ul className="mx-auto mt-3 max-w-md text-left text-sm text-danger">{check.errors.map((e) => <li key={e.field}>Étape {e.step} : {e.text}</li>)}</ul></div>)}
            {step < 5 && check.warnings.length > 0 && <Notices list={check.warnings} compact />}
            {step < 5 && <div className="flex flex-wrap items-center justify-between gap-3">
              {step > 1 ? <Button variant="secondary" onClick={() => go(step - 1)}><ArrowLeft className="size-4" />Retour</Button> : <span />}
              <div className="flex items-center gap-3">{shown[step] && errsOf(step).length > 0 && <span role="alert" className="text-sm text-danger">Complétez les champs signalés.</span>}<Button onClick={next} data-next>{step === 4 ? "Générer le plan" : "Continuer"}<ArrowRight className="size-4" /></Button></div>
            </div>}
            {step === 5 && <div><Button variant="secondary" onClick={() => go(4)}><ArrowLeft className="size-4" />Modifier les produits</Button></div>}
          </div>
        </div>)}

      {tab === "produits" && <div className="mt-6"><Catalog /></div>}

      {tab === "plans" && (
        <div className="mt-6 grid gap-3">
          {!plans.length ? <p className="rounded-2xl border border-dashed border-ink-300 bg-white/50 p-6 text-center text-sm text-ink-600">Aucun plan enregistré. Générez un plan puis cliquez sur « Enregistrer le plan ».</p> : plans.map((pl) => (
            <div key={pl.id} className="frost-panel flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1"><p className="font-semibold">{pl.name}</p><p className="text-sm text-ink-500">{pl.input.race.distanceKm != null ? `${pl.input.race.distanceKm} km · ` : ""}{pl.input.race.durationMin ? fmtDur(pl.input.race.durationMin) : "durée ?"} · enregistré le {new Date(pl.savedAt).toLocaleDateString("fr-FR")}</p></div>
              <Button size="sm" onClick={() => { setV({ ...emptyInput(), ...pl.input }); setSavedId(pl.id); setShown({ 1: true, 2: true, 3: true, 4: true }); setTab("plan"); setStep(5); }}><FolderOpen className="size-4" />Ouvrir</Button>
              <Button size="sm" variant="ghost" aria-label={`Supprimer ${pl.name}`} onClick={() => confirm(`Supprimer le plan « ${pl.name} » ?`) && plansRepo.remove(pl.id)}><Trash2 className="size-4" /></Button>
            </div>))}
        </div>)}

      {tab === "methode" && (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="frost-panel p-5"><h2 className="text-lg font-bold">Recommandations établies</h2><ul className="mt-2 list-disc pl-5 text-sm text-ink-700">{ESTABLISHED.map((x) => <li key={x} className="mt-1">{x}</li>)}</ul></section>
          <section className="frost-panel p-5"><h2 className="text-lg font-bold">Hypothèses de calcul</h2><p className="text-sm text-ink-500">Choix du site quand la littérature ne fixe pas de valeur ; tous réglables dans les constantes du moteur.</p><ul className="mt-2 list-disc pl-5 text-sm text-ink-700">{ASSUMPTIONS.map((x) => <li key={x} className="mt-1">{x}</li>)}</ul></section>
          <section className="frost-panel p-5 lg:col-span-2"><h2 className="text-lg font-bold">Formules</h2><ul className="mt-2 grid gap-1 text-sm text-ink-700 sm:grid-cols-2">{["Glucides totaux = objectif horaire × durée (avec montée progressive éventuelle)", "Débit de sudation (L/h) = (poids avant − poids après + liquide bu − urines) / durée", "Pertes de sodium (mg/h) = sueur (L/h) × concentration (mg/L) ; 1 mmol/L = 23 mg/L", "Dose de caféine (mg) = poids (kg) × dose (mg/kg)", "Caféine résiduelle = Σ dose × 2^(−temps écoulé / demi-vie)", "Perte de masse prévue = (sueur − apport) × durée"].map((x) => <li key={x} className="rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs">{x}</li>)}</ul></section>
          <section className="frost-panel p-5 lg:col-span-2"><h2 className="text-lg font-bold">Références</h2><ol className="mt-2 list-decimal pl-5 text-sm text-ink-700">{REFERENCES.map((x) => <li key={x.id} className="mt-1">{x.text}</li>)}</ol><p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-sm">{DISCLAIMER}</p></section>
        </div>)}
    </div>
  );
}
