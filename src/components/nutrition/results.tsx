"use client";
import { useState } from "react";
import { Wheat, Droplets, Sparkles as Salt, Coffee, TriangleAlert, Info, ShieldAlert, FileDown, Save, Package, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import type { NutritionResult } from "@/lib/nutrition/engine";
import { shortfalls, type Gap, type Slot } from "@/lib/nutrition/plan";
import { gapFixes } from "@/lib/nutrition/gaps";
import type { Notice, PlanInput } from "@/lib/nutrition/types";
import { fmtDur, fmtL, fmtRel } from "@/lib/nutrition/labels";
import { CATEGORY_SHORT } from "@/lib/nutrition/products";
import { DISCLAIMER } from "@/lib/nutrition/references";
import { CumulativeChart } from "./charts";

const NOTICE = { info: { I: Info, c: "bg-glacier-100/60 text-ink-800", ic: "text-glacier-600" }, warn: { I: TriangleAlert, c: "bg-warn/10 text-ink-800", ic: "text-warn" }, alert: { I: ShieldAlert, c: "bg-danger/10 text-ink-900", ic: "text-danger" } } as const;
export function Notices({ list, compact }: { list: Notice[]; compact?: boolean }) {
  const seen = new Set<string>(), uniq = list.filter((n) => (seen.has(n.text) ? false : (seen.add(n.text), true))).sort((a, b) => ({ alert: 0, warn: 1, info: 2 })[a.level] - ({ alert: 0, warn: 1, info: 2 })[b.level]);
  if (!uniq.length) return null;
  return <ul className={clsx("grid", compact ? "gap-1.5" : "gap-2")}>{uniq.map((n) => { const s = NOTICE[n.level]; return <li key={n.text} className={clsx("flex gap-2 rounded-xl px-3 py-2 text-sm", s.c)}><s.I className={clsx("mt-0.5 size-4 shrink-0", s.ic)} aria-label={n.level === "alert" ? "Alerte" : n.level === "warn" ? "Attention" : "Information"} /><span>{n.text}</span></li>; })}</ul>;
}
const Badge = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", ok ? "bg-pine-100 text-pine-700" : "bg-brass-100 text-brass-600")}>{children}</span>;

function Kpi({ I, label, main, unit, sub, color, gap, unitTotal }: { I: typeof Wheat; label: string; main: string; unit: string; sub: string; color: string; gap?: Gap; unitTotal?: string }) {
  const bad = gap && (gap.status === "short" || gap.status === "missing");
  return (
    <div className={clsx("frost-panel relative overflow-hidden p-4", bad && "!border-2 !border-danger")} data-gap={gap?.status}>
      <span className="absolute -right-4 -top-4 size-20 rounded-full opacity-15" style={{ background: color }} aria-hidden="true" />
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-700"><span className="grid size-8 place-items-center rounded-xl text-white" style={{ background: color }}><I className="size-4" /></span>{label}</p>
      <p className="mt-3 font-display text-3xl font-bold leading-none">{main}<span className="ml-1 text-base font-semibold text-ink-500">{unit}</span></p>
      <p className="mt-1.5 text-sm text-ink-600">{sub}</p>
      {gap && gap.target > 0 && <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs font-semibold"><span className={bad ? "text-danger" : gap.status === "over" ? "text-ember-600" : "text-pine-700"}>Prévu {gap.got} {unitTotal} · {gap.pct} %</span><span className="text-ink-500">objectif {gap.target}</span></div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={`${gap.pct} % de l'objectif`}><div className={clsx("h-full rounded-full", bad ? "bg-danger" : gap.status === "over" ? "bg-ember-500" : "bg-pine-600")} style={{ width: `${Math.min(100, gap.pct)}%` }} /></div>
        {bad && <p className="mt-2 rounded-lg bg-danger px-2.5 py-1.5 text-sm font-bold text-white">Manque {gap.gap} {unitTotal}</p>}
        {gap.status === "over" && <p className="mt-2 text-xs font-semibold text-ember-600">Au-dessus de l&apos;objectif (+{gap.got - gap.target} {unitTotal})</p>}
      </div>}
    </div>
  );
}

/** Une ligne « à faire » d'une prise : produits, boisson, eau, caféine hors produits. */
const todo = (s: Slot) => [...s.items.map((it) => `${it.qty} × ${it.name}`), ...(s.drinkMl ? [`${Math.round(s.drinkMl / 10) * 10} ml de boisson`] : []), ...(s.plainWaterMl ? [`${Math.round(s.plainWaterMl / 10) * 10} ml d'eau`] : []), ...(s.caffeineOtherMg ? [`${s.caffeineOtherMg} mg de caféine (café, comprimé…)`] : [])];
const every = (m: number) => { if (m < 60 && Math.abs(m - Math.round(m)) > 0.05) return `${Math.floor(m)} à ${Math.ceil(m)} min`; const r = Math.round(m); return r >= 60 ? `${Math.floor(r / 60)} h${r % 60 ? ` ${String(r % 60).padStart(2, "0")}` : ""}` : `${r} min`; };
const TABS = [["carbsG", "Glucides", "#d05f2a", "g"], ["waterMl", "Eau", "#1f7594", "ml"], ["sodiumMg", "Sodium", "#12624b", "mg"], ["caffeine", "Caféine", "#a67c2e", "mg"]] as const;

export function Results({ input, r, onPdf, onSave, saved }: { input: PlanInput; r: NutritionResult; onPdf: () => void; onSave: () => void; saved: boolean }) {
  const p = r.plan, run = p.slots, dur = input.race.durationMin!, sf = shortfalls(p), iv = r.interval;
  const runIdx = new Map(run.filter((s) => s.kind === "course").map((s, k) => [s, k]));
  const fixes = gapFixes(input, sf.totals);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("carbsG");
  const [all, setAll] = useState(false);
  const shownSlots = all ? run : run.slice(0, 12);
  const sipMl = Math.round((r.hydration.mlh * iv.stepMin) / 60 / 10) * 10;
  const salt = input.products.filter((x) => input.prefs.productIds.includes(x.id) && x.category === "sel");
  const firstShare = r.carbs.ramp[0] ?? 1;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" aria-label="Plan nutritionnel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Votre plan</p><h2 className="text-2xl sm:text-3xl">{input.race.name || "Plan de course"}</h2><p className="text-sm text-ink-600">{input.race.distanceKm != null ? `${input.race.distanceKm} km · ` : ""}{input.race.gainM ? `${input.race.gainM} m D+ · ` : ""}{fmtDur(dur)} · départ {input.race.startTime} · {input.weather.tempC} °C, {input.weather.humidityPct} % d&apos;humidité</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={onSave}><Save className="size-4" />{saved ? "Plan enregistré" : "Enregistrer le plan"}</Button><Button onClick={onPdf} data-action="pdf"><FileDown className="size-4" />Fiche PDF</Button></div>
      </div>

      {/* l'essentiel, en clair */}
      <section className="rounded-3xl bg-ink-950 p-5 text-white shadow-lift sm:p-6" aria-labelledby="res-brief" data-section="en-bref">
        <p className="eyebrow !text-brass-400">L&apos;essentiel</p>
        <h3 id="res-brief" className="mt-1 text-2xl font-bold">Pendant la course, retenez ceci</h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li className="rounded-2xl bg-white/10 p-4" data-brief="glucides"><p className="flex items-center gap-2 text-sm font-semibold text-white/75"><Wheat className="size-4 text-[#f0a37c]" />Manger</p>
            <p className="mt-1 text-xl font-bold leading-snug">{iv.basis === "produits" ? `${iv.portions > 1 ? `${iv.portions} portions` : "1 portion"} toutes les ${every(iv.carbEveryMin)}` : iv.basis === "boisson" ? "Votre boisson suffit" : iv.basis === "aucun-objectif" ? "Rien à manger" : `${r.carbs.gph} g de glucides par heure`}</p>
            <p className="mt-1 text-sm text-white/75">{iv.basis === "produits" ? `${String(iv.servingG).replace(".", ",")} g de glucides par portion → environ ${iv.effectiveGph} g par heure (objectif ${r.carbs.gph} g/h).` : iv.basis === "boisson" ? `Elle apporte les ${r.carbs.gph} g de glucides par heure prévus.` : iv.basis === "aucun-objectif" ? "Pour cette durée, l'eau suffit." : "Ajoutez vos produits à l'étape 4 pour savoir quoi prendre et quand."}</p></li>
          <li className="rounded-2xl bg-white/10 p-4" data-brief="eau"><p className="flex items-center gap-2 text-sm font-semibold text-white/75"><Droplets className="size-4 text-[#7cc4de]" />Boire</p>
            <p className="mt-1 text-xl font-bold leading-snug">≈ {sipMl} ml toutes les {every(iv.stepMin)}</p>
            <p className="mt-1 text-sm text-white/75">Soit {r.hydration.mlh} ml par heure, par petites gorgées. Ne buvez pas plus que nécessaire : trop boire est aussi un risque.</p></li>
          <li className="rounded-2xl bg-white/10 p-4" data-brief="sel"><p className="flex items-center gap-2 text-sm font-semibold text-white/75"><Salt className="size-4 text-[#8fd1b4]" />Sel</p>
            <p className="mt-1 text-xl font-bold leading-snug">{r.sodium.mgh ? `${r.sodium.mgh} mg de sodium par heure` : "Pas de sel en plus"}</p>
            <p className="mt-1 text-sm text-white/75">{r.sodium.mgh ? (salt.length ? `Apporté par vos produits et votre boisson (${salt.map((x) => x.name).join(", ")}) : suivez le planning.` : "Apporté par votre boisson et vos produits ; s'il en manque, le plan vous le signale.") : "Pour un effort de cette durée, le plan ne prévoit pas de sodium en plus."}</p></li>
          <li className="rounded-2xl bg-white/10 p-4" data-brief="cafeine"><p className="flex items-center gap-2 text-sm font-semibold text-white/75"><Coffee className="size-4 text-brass-400" />Caféine</p>
            <p className="mt-1 text-xl font-bold leading-snug">{r.caffeine.totalMg ? r.caffeine.doses.map((d) => `${d.mg} mg`).join(" + ") : "Aucune"}</p>
            <p className="mt-1 text-sm text-white/75">{r.caffeine.totalMg ? r.caffeine.doses.map((d) => `${d.mg} mg ${d.atMin < 0 ? `${-d.atMin} min avant le départ` : `après ${fmtDur(d.atMin)} de course`}`).join(" · ") : "Facultative : à choisir à l'étape 4 si vous en avez l'habitude."}</p></li>
        </ul>
        <div className="mt-4 rounded-2xl bg-white/[0.06] p-4 text-sm text-white/85">
          <p className="font-semibold text-white">Pourquoi ces quantités ?</p>
          <p className="mt-1">Repère pour votre durée d&apos;effort : <b>{r.carbs.band.label}</b>. Votre objectif de <b>{r.carbs.gph} g/h</b> tient compte de l&apos;intensité, de votre habitude des glucides et de votre tolérance digestive (plafond personnel {r.carbs.cap} g/h, fixé par {r.carbs.capBy}).{firstShare < 1 ? ` Pour habituer votre ventre, la première heure démarre à environ ${Math.round(firstShare * 100)} % de l'objectif.` : ""}</p>
          <p className="mt-2 text-white/70">Chacun digère différemment : testez ce plan à l&apos;entraînement, avec les mêmes produits. Si le ventre proteste, réduisez puis augmentez peu à peu.</p>
        </div>
      </section>

      {sf.any && <section className="rounded-2xl border-2 border-danger bg-danger/[0.06] p-4 sm:p-5" aria-labelledby="res-gaps" data-section="manques">
        <h3 id="res-gaps" className="flex items-center gap-2 text-lg font-bold text-danger"><ShieldAlert className="size-5" />Objectifs non atteints : à corriger</h3>
        <ul className="mt-3 grid gap-2">{fixes.map((f) => <li key={f.metric} className="rounded-xl bg-white/85 p-3 text-sm"><p className="font-bold text-ink-900">{f.title} : <span className="text-danger">{f.got} {f.unit} prévus pour {f.target} {f.unit} — manque {f.gap} {f.unit} ({100 - f.pct} %)</span></p><p className="mt-0.5 text-ink-700">{f.how}</p></li>)}</ul>
      </section>}
      <Notices list={[...r.warnings, ...[r.carbs, r.hydration, r.sodium, r.caffeine, p].flatMap((x) => x.notices).filter((n) => n.level === "alert")]} />

      {/* planning à suivre */}
      <section className="frost-panel p-4 sm:p-5" aria-labelledby="res-steps" data-section="planning">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 id="res-steps" className="text-xl font-bold">Votre course, prise par prise</h3><p className="text-sm text-ink-600">{run.filter((s) => s.kind === "course").length} moments, à l&apos;heure ou au kilomètre. Les ravitaillements sont signalés.</p></div></div>
        <ol className="mt-4 grid gap-2" aria-label="Planning">{shownSlots.map((s) => { const t = todo(s), eat = s.items.length > 0, k = runIdx.get(s), behind = k != null && (["carbsG", "waterMl", "sodiumMg"] as const).some((m) => sf.slots[k]?.[m]?.behind); return (
          <li key={`${s.kind}${s.tMin}`} className={clsx("grid grid-cols-[4.6rem_minmax(0,1fr)] items-start gap-3 rounded-2xl p-3 ring-1 sm:grid-cols-[6rem_minmax(0,1fr)]", s.kind === "avant" ? "bg-brass-100/60 ring-brass-200" : s.aid ? "bg-brass-100/40 ring-brass-200" : eat ? "bg-white ring-ink-100" : "bg-white/50 ring-ink-100")} data-slot={eat ? "manger" : "boire"}>
            <div><p className="font-display text-xl font-bold leading-none">{s.clock.replace(/ \(.*\)/, "")}</p><p className="mt-1 text-xs text-ink-500">{s.kind === "avant" ? `${-s.tMin} min avant` : `${fmtDur(s.tMin)}`}{s.km != null ? ` · km ${String(s.km).replace(".", ",")}` : ""}</p></div>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5">{eat && <span className="inline-flex items-center gap-1 rounded-full bg-[#d05f2a]/10 px-2 py-0.5 text-xs font-bold text-[#a8471c]"><Wheat className="size-3.5" />Manger</span>}{(s.drinkMl || s.plainWaterMl) ? <span className="inline-flex items-center gap-1 rounded-full bg-[#1f7594]/10 px-2 py-0.5 text-xs font-bold text-[#1f7594]"><Droplets className="size-3.5" />Boire</span> : null}{(s.target.caffeineMg > 0) && <span className="inline-flex items-center gap-1 rounded-full bg-brass-100 px-2 py-0.5 text-xs font-bold text-[#5f4a1f]"><Coffee className="size-3.5" />Caféine</span>}{s.aid && <span className="rounded-full bg-brass-400/30 px-2 py-0.5 text-xs font-bold text-[#5f4a1f]">{s.aid}</span>}</p>
              <p className="mt-1 text-[15px] font-semibold text-ink-900">{t.join(" · ") || "Rien à prendre"}</p>
              {behind && <p className="mt-0.5 text-xs font-semibold text-danger">En retard sur l&apos;objectif à ce moment (voir « Objectifs non atteints »).</p>}
            </div>
          </li>); })}</ol>
        {run.length > 12 && <Button variant="secondary" size="sm" className="mt-3" onClick={() => setAll((x) => !x)}>{all ? "Réduire" : `Afficher toute la course (${run.length} moments)`}</Button>}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Indicateurs principaux">
        <div role="listitem"><Kpi I={Wheat} label="Glucides" main={String(r.carbs.gph)} unit="g/h" sub={`Objectif ${r.carbs.totalG} g au total`} color="#d05f2a" gap={sf.totals.carbsG} unitTotal="g" /></div>
        <div role="listitem"><Kpi I={Droplets} label="Hydratation" main={String(r.hydration.mlh)} unit="ml/h" sub={`Objectif ${fmtL(r.hydration.totalMl)} au total`} color="#1f7594" gap={sf.totals.waterMl} unitTotal="ml" /></div>
        <div role="listitem"><Kpi I={Salt} label="Sodium" main={String(r.sodium.mgh)} unit="mg/h" sub={`Objectif ${r.sodium.totalMg} mg au total`} color="#12624b" gap={sf.totals.sodiumMg} unitTotal="mg" /></div>
        <div role="listitem"><Kpi I={Coffee} label="Caféine" main={String(r.caffeine.totalMg)} unit="mg" sub={r.caffeine.totalMg ? `${r.caffeine.totalMgKg} mg par kg au total` : "Aucune prise prévue"} color="#a67c2e" /></div>
      </div>

      {/* détails : un nutriment à la fois, grand graphique */}
      <section className="frost-panel p-4 sm:p-5" aria-labelledby="res-details" data-section="details">
        <h3 id="res-details" className="text-xl font-bold">Comprendre le détail</h3>
        <div role="tablist" aria-label="Nutriment" className="mt-3 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-ink-100 p-1">{TABS.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition", tab === k ? "bg-white text-ink-900 shadow-sm" : "text-ink-600 hover:text-ink-900")}>{l}</button>)}</div>
        <div className="mt-4 grid gap-3">
          {tab === "carbsG" && <>
            <p className="text-sm text-ink-700">Les glucides (sucres des gels, barres, boissons) sont le carburant de l&apos;effort. Objectif <b>{r.carbs.gph} g/h</b>, soit <b>{r.carbs.totalG} g</b> sur la course{r.carbs.totalG !== r.carbs.flatTotalG ? ` (démarrage progressif ; ${r.carbs.flatTotalG} g sans lui)` : ""}. <Badge ok={r.carbs.source === "calcul"}>{r.carbs.source === "calcul" ? "Calculé" : "Valeur saisie"}</Badge></p>
            <CumulativeChart r={r} metric="carbsG" color="#d05f2a" unit="g" label="Glucides" />
            <Notices list={r.carbs.notices.filter((n) => n.level !== "alert")} compact /></>}
          {tab === "waterMl" && <>
            <p className="text-sm text-ink-700">Vous perdez environ <b>{String(r.hydration.sweatLh).replace(".", ",")} L de sueur par heure</b>{r.hydration.reliability === "estimee" ? ` (estimation, entre ${String(r.hydration.sweatRange[0]).replace(".", ",")} et ${String(r.hydration.sweatRange[1]).replace(".", ",")} L/h)` : " (mesuré)"}. Le plan vous fait boire <b>{r.hydration.mlh} ml/h</b>, soit {r.hydration.replacePct} % des pertes : on ne cherche pas à tout compenser. <Badge ok={r.hydration.reliability === "mesuree"}>{r.hydration.reliability === "mesuree" ? "Sudation mesurée" : "Sudation estimée"}</Badge></p>
            <CumulativeChart r={r} metric="waterMl" color="#1f7594" unit="ml" label="Eau" />
            <Notices list={r.hydration.notices.filter((n) => n.level !== "alert")} compact />
            {r.sweatError && <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm">Test de sudation non utilisé : {r.sweatError}</p>}</>}
          {tab === "sodiumMg" && <>
            <p className="text-sm text-ink-700">La sueur contient du sel (sodium). Pertes estimées ≈ <b>{r.sodium.lossMgH} mg/h</b> ; objectif <b>{r.sodium.mgh} mg/h</b> ({r.sodium.replacePct} % des pertes), prévu par vos produits : {Math.round(p.totals.got.sodiumMg / (dur / 60))} mg/h. <Badge ok={r.sodium.reliability === "mesuree"}>{r.sodium.reliability === "mesuree" ? "Sueur analysée" : "Concentration estimée"}</Badge></p>
            <CumulativeChart r={r} metric="sodiumMg" color="#12624b" unit="mg" label="Sodium" />
            <Notices list={r.sodium.notices.filter((n) => n.level !== "alert")} compact />
            {r.sodiumError && <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm">{r.sodiumError}</p>}</>}
          {tab === "caffeine" && (r.caffeine.totalMg ? <>
            <p className="text-sm text-ink-700">Total <b>{r.caffeine.totalMg} mg</b> ({r.caffeine.totalMgKg} mg par kg de poids). Prenez-la aux moments indiqués, sans en ajouter d&apos;autres sources (café, soda, gels caféinés…).</p>
            <ol className="grid gap-2">{r.caffeine.doses.map((d) => <li key={d.id} className="flex items-center gap-3 rounded-xl bg-brass-100/60 p-3 text-sm"><Coffee className="size-5 shrink-0 text-[#a67c2e]" /><span><b className="text-base">{d.mg} mg</b> · {fmtRel(d.atMin)}</span></li>)}</ol>
            <Notices list={r.caffeine.notices.filter((n) => n.level !== "alert")} compact />
            <details className="text-sm"><summary className="cursor-pointer font-semibold text-ink-700">Précautions</summary><ul className="mt-2 list-disc pl-5 text-ink-600">{r.caffeine.precautions.map((x) => <li key={x}>{x}</li>)}</ul></details>
          </> : <p className="text-sm text-ink-600">Aucune caféine prévue. Elle est facultative : choisissez une stratégie à l&apos;étape 4 si vous en avez l&apos;habitude.</p>)}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <section className="frost-panel p-5" aria-labelledby="res-seg">
          <h3 id="res-seg" className="text-base font-bold">Par tronçon : à emporter</h3>
          <ul className="mt-3 grid gap-2">{p.segments.map((g) => (
            <li key={g.index} className={clsx("rounded-xl border bg-white/60 p-3 text-sm", g.overCapacity ? "border-warn" : "border-ink-100")}>
              <p className="font-semibold">{g.from.name} → {g.to.name}<span className="ml-2 font-normal text-ink-500">{g.from.km != null && g.to.km != null ? `${(g.to.km - g.from.km).toFixed(1).replace(".", ",")} km · ` : ""}{fmtDur(g.to.tMin - g.from.tMin)}</span></p>
              <p className="mt-1 text-ink-700">{g.items.map((it) => `${it.qty} × ${it.name}`).join(" · ") || "Aucun produit"}{g.drinkPortions ? ` · ${g.drinkPortions} portion(s) de boisson` : ""}</p>
              <p className="mt-0.5 text-xs text-ink-500">{Math.round(g.got.carbsG)} g de glucides · {g.carryWaterMl} ml de liquide{g.overCapacity ? " (au-delà de votre capacité)" : ""} · {Math.round(g.got.sodiumMg)} mg de sodium{g.got.caffeineMg ? ` · ${Math.round(g.got.caffeineMg)} mg de caféine` : ""}</p>
            </li>))}</ul>
        </section>
        <section className="frost-panel p-5" aria-labelledby="res-prod">
          <h3 id="res-prod" className="flex items-center gap-2 text-base font-bold"><Package className="size-5 text-pine-600" />Produits à préparer</h3>
          {p.totals.items.length || p.totals.drinkPortions ? <ul className="mt-3 grid gap-2 text-sm">{p.totals.items.map((it) => { const pr = input.products.find((x) => x.id === it.productId), short = p.shortages.find((x) => x.name === it.name); return <li key={it.productId} className="flex items-center gap-3 rounded-xl bg-ink-50 p-2.5"><span className="grid min-w-10 place-items-center rounded-lg bg-white px-2 py-1 font-display text-lg font-bold shadow-sm">{it.qty}</span><span className="min-w-0"><b>{it.name}</b><span className="block text-xs text-ink-500">{pr ? `${CATEGORY_SHORT[pr.category]} · ` : ""}{Math.round(it.carbsG)} g de glucides{it.caffeineMg ? ` · ${Math.round(it.caffeineMg)} mg de caféine` : ""}</span>{short && <span className="block text-xs font-semibold text-danger">Stock insuffisant : {short.stock} pour {short.need}</span>}</span></li>; })}
            {p.totals.drinkPortions > 0 && <li className="flex items-center gap-3 rounded-xl bg-ink-50 p-2.5"><span className="grid min-w-10 place-items-center rounded-lg bg-white px-2 py-1 font-display text-lg font-bold shadow-sm">{p.totals.drinkPortions}</span><span><b>Portions de boisson</b><span className="block text-xs text-ink-500">{input.products.find((x) => x.id === input.prefs.drinkId)?.name}</span></span></li>}
            {p.totals.plainWaterMl > 0 && <li className="text-xs text-ink-500">+ {fmtL(p.totals.plainWaterMl)} d&apos;eau plate sur la course.</li>}
          </ul> : <p className="mt-2 text-sm text-ink-600">Aucun produit sélectionné : ajoutez vos produits à l&apos;étape 4 pour savoir quoi emporter.</p>}
        </section>
      </div>

      <details className="frost-panel group p-5" data-section="tableau">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold"><ChevronDown className="size-4 text-ink-400 transition group-open:rotate-180" />Tableau détaillé (grammes, millilitres, milligrammes)</summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[46rem] text-sm">
          <thead><tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500"><th className="py-2 pr-2">Heure</th><th className="pr-2">Km</th><th className="pr-2">Glucides</th><th className="pr-2">Eau</th><th className="pr-2">Sodium</th><th className="pr-2">Caféine</th><th>À prendre</th></tr></thead>
          <tbody>{run.map((s) => (
            <tr key={`${s.kind}${s.tMin}`} className={clsx("border-b border-ink-100 align-top last:border-0", s.aid && "bg-brass-100/40", s.kind === "avant" && "bg-brass-100/50")}>
              <td className="py-2 pr-2 font-display font-semibold">{s.clock}</td><td className="pr-2">{s.km ?? (s.kind === "avant" ? "avant" : "—")}</td>
              {(["carbsG", "waterMl", "sodiumMg"] as const).map((m) => { const k = runIdx.get(s), f = k != null ? sf.slots[k]?.[m] : undefined, u = m === "carbsG" ? "g" : m === "waterMl" ? "ml" : "mg"; return <td key={m} className={clsx("pr-2", f?.behind && "bg-danger/10 font-bold text-danger")}>{Math.round(s.got[m])} {u}</td>; })}
              <td className="pr-2">{s.target.caffeineMg ? `${Math.round(s.got.caffeineMg + s.caffeineOtherMg)} mg` : "—"}</td>
              <td className="text-ink-700">{todo(s).join(" · ") || "—"}{s.aid && <span className="ml-1 rounded bg-brass-100 px-1.5 text-xs font-semibold">{s.aid}</span>}</td>
            </tr>))}</tbody>
          <tfoot><tr className="border-t-2 border-ink-200 font-semibold"><td className="py-2" colSpan={2}>Total prévu / objectif</td>{(["carbsG", "waterMl", "sodiumMg"] as const).map((m) => { const g = sf.totals[m], bad = g.status === "short" || g.status === "missing"; return <td key={m} className={clsx(bad && "font-extrabold text-danger")}>{m === "waterMl" ? `${fmtL(g.got)} / ${fmtL(g.target)}` : `${g.got} / ${g.target} ${m === "carbsG" ? "g" : "mg"}`}</td>; })}<td>{r.caffeine.totalMg ? `${r.caffeine.totalMg} mg` : "—"}</td><td /></tr></tfoot>
        </table></div>
      </details>
      <Notices list={[...r.warnings, ...p.notices]} />
      <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">{DISCLAIMER}</p>
    </div>
  );
}
