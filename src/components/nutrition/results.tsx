"use client";
import { Wheat, Droplets, Sparkles as Salt, Coffee, TriangleAlert, Info, ShieldAlert, FileDown, Save, Package } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import type { NutritionResult } from "@/lib/nutrition/engine";
import { shortfalls, type Gap } from "@/lib/nutrition/plan";
import { gapFixes } from "@/lib/nutrition/gaps";
import type { Notice, PlanInput } from "@/lib/nutrition/types";
import { fmtDur, fmtL, fmtRel } from "@/lib/nutrition/labels";
import { CATEGORY_SHORT } from "@/lib/nutrition/products";
import { DISCLAIMER } from "@/lib/nutrition/references";
import { CumulativeChart, CaffeineChart } from "./charts";

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

export function Results({ input, r, onPdf, onSave, saved }: { input: PlanInput; r: NutritionResult; onPdf: () => void; onSave: () => void; saved: boolean }) {
  const p = r.plan, run = p.slots, dur = input.race.durationMin!, sf = shortfalls(p);
  const runIdx = new Map(run.filter((s) => s.kind === "course").map((s, k) => [s, k]));
  const fixes = gapFixes(input, sf.totals);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5" aria-label="Plan nutritionnel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="eyebrow">Votre plan</p><h2 className="text-2xl sm:text-3xl">{input.race.name || "Plan de course"}</h2><p className="text-sm text-ink-600">{input.race.distanceKm != null ? `${input.race.distanceKm} km · ` : ""}{input.race.gainM ? `${input.race.gainM} m D+ · ` : ""}{fmtDur(dur)} · départ {input.race.startTime} · {input.weather.tempC} °C, {input.weather.humidityPct} %</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={onSave}><Save className="size-4" />{saved ? "Plan enregistré" : "Enregistrer le plan"}</Button><Button onClick={onPdf} data-action="pdf"><FileDown className="size-4" />Fiche PDF</Button></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Indicateurs principaux">
        <div role="listitem"><Kpi I={Wheat} label="Glucides" main={String(r.carbs.gph)} unit="g/h" sub={`Objectif ${r.carbs.totalG} g au total`} color="#d05f2a" gap={sf.totals.carbsG} unitTotal="g" /></div>
        <div role="listitem"><Kpi I={Droplets} label="Hydratation" main={String(r.hydration.mlh)} unit="ml/h" sub={`Objectif ${fmtL(r.hydration.totalMl)} au total`} color="#1f7594" gap={sf.totals.waterMl} unitTotal="ml" /></div>
        <div role="listitem"><Kpi I={Salt} label="Sodium" main={String(r.sodium.mgh)} unit="mg/h" sub={`Objectif ${r.sodium.totalMg} mg au total`} color="#12624b" gap={sf.totals.sodiumMg} unitTotal="mg" /></div>
        <div role="listitem"><Kpi I={Coffee} label="Caféine" main={String(r.caffeine.totalMg)} unit="mg" sub={r.caffeine.totalMg ? `${r.caffeine.totalMgKg} mg/kg cumulés` : "Aucune prise prévue"} color="#a67c2e" /></div>
      </div>
      {sf.any && <section className="rounded-2xl border-2 border-danger bg-danger/[0.06] p-4 sm:p-5" aria-labelledby="res-gaps" data-section="manques">
        <h3 id="res-gaps" className="flex items-center gap-2 text-lg font-bold text-danger"><ShieldAlert className="size-5" />Objectifs non atteints : à corriger</h3>
        <ul className="mt-3 grid gap-2">{fixes.map((f) => <li key={f.metric} className="rounded-xl bg-white/85 p-3 text-sm"><p className="font-bold text-ink-900">{f.title} : <span className="text-danger">{f.got} {f.unit} prévus pour {f.target} {f.unit} — manque {f.gap} {f.unit} ({100 - f.pct} %)</span></p><p className="mt-0.5 text-ink-700">{f.how}</p></li>)}</ul>
        <p className="mt-2 text-xs text-ink-600">Dans le planning, les valeurs en rouge signalent les prises où le retard s&apos;accumule.</p>
      </section>}
      <Notices list={[...r.warnings, ...[r.carbs, r.hydration, r.sodium, r.caffeine, p].flatMap((x) => x.notices).filter((n) => n.level === "alert")]} />

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="frost-panel grid gap-3 p-5" aria-labelledby="res-carbs">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="res-carbs" className="text-base font-bold">Glucides</h3><Badge ok={r.carbs.source === "calcul"}>{r.carbs.source === "calcul" ? "Calculé" : "Valeur saisie"}</Badge></div>
          <p className="text-sm text-ink-700">{r.carbs.band.label}. Objectif <b>{r.carbs.gph} g/h</b>, plafond personnel {r.carbs.cap} g/h (fixé par {r.carbs.capBy}). Total <b>{r.carbs.totalG} g</b>{r.carbs.totalG !== r.carbs.flatTotalG ? ` (montée progressive ; ${r.carbs.flatTotalG} g sans elle)` : ""}.</p>
          <CumulativeChart r={r} metric="carbsG" color="#d05f2a" unit="g" label="Glucides" />
          <Notices list={r.carbs.notices.filter((n) => n.level !== "alert")} compact />
        </section>
        <section className="frost-panel grid gap-3 p-5" aria-labelledby="res-water">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="res-water" className="text-base font-bold">Hydratation</h3><Badge ok={r.hydration.reliability === "mesuree"}>{r.hydration.reliability === "mesuree" ? "Sudation mesurée" : "Sudation estimée"}</Badge></div>
          <p className="text-sm text-ink-700">Sueur ≈ <b>{String(r.hydration.sweatLh).replace(".", ",")} L/h</b>{r.hydration.reliability === "estimee" ? ` (fourchette ${String(r.hydration.sweatRange[0]).replace(".", ",")}–${String(r.hydration.sweatRange[1]).replace(".", ",")} L/h)` : ""}. Boire <b>{r.hydration.mlh} ml/h</b>, soit {r.hydration.replacePct} % des pertes ({fmtL(r.hydration.totalMl)}). Perte de masse prévue ≈ <b>{String(r.hydration.lossPct).replace(".", ",")} %</b> ({String(r.hydration.lossKg).replace(".", ",")} kg).</p>
          <CumulativeChart r={r} metric="waterMl" color="#1f7594" unit="ml" label="Eau" />
          <Notices list={r.hydration.notices.filter((n) => n.level !== "alert")} compact />
          {r.sweatError && <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm">Test de sudation non utilisé : {r.sweatError}</p>}
        </section>
        <section className="frost-panel grid gap-3 p-5" aria-labelledby="res-na">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="res-na" className="text-base font-bold">Sodium</h3><Badge ok={r.sodium.reliability === "mesuree"}>{r.sodium.reliability === "mesuree" ? "Sueur analysée" : "Concentration estimée"}</Badge></div>
          <dl className="grid grid-cols-3 gap-2 text-sm">{[["Pertes", `${r.sodium.lossMgH} mg/h`], ["Objectif", `${r.sodium.mgh} mg/h`], ["Prévu (produits)", `${Math.round(p.totals.got.sodiumMg / (dur / 60))} mg/h`]].map(([a, b]) => <div key={a} className="rounded-xl bg-ink-50 p-2.5"><dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{a}</dt><dd className="font-display text-lg font-bold">{b}</dd></div>)}</dl>
          <p className="text-sm text-ink-700">Sueur à {r.sodium.sweatMgL} mg/L × {String(r.hydration.sweatLh).replace(".", ",")} L/h. Pertes totales ≈ {r.sodium.lossTotalMg} mg ; objectif {r.sodium.totalMg} mg ({r.sodium.replacePct} % des pertes).</p>
          <CumulativeChart r={r} metric="sodiumMg" color="#12624b" unit="mg" label="Sodium" />
          <Notices list={r.sodium.notices.filter((n) => n.level !== "alert")} compact />
          {r.sodiumError && <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm">{r.sodiumError}</p>}
        </section>
        <section className="frost-panel grid gap-3 p-5" aria-labelledby="res-caf">
          <h3 id="res-caf" className="text-base font-bold">Caféine</h3>
          {r.caffeine.totalMg ? (<>
            <ul className="flex flex-wrap gap-2 text-sm">{r.caffeine.doses.map((d) => <li key={d.id} className="rounded-full bg-brass-100 px-3 py-1 font-semibold text-[#5f4a1f]">{d.mg} mg · {fmtRel(d.atMin)}</li>)}</ul>
            <CaffeineChart r={r} startTime={input.race.startTime} />
            <Notices list={r.caffeine.notices.filter((n) => n.level !== "alert")} compact />
            <details className="text-sm"><summary className="cursor-pointer font-semibold text-ink-700">Précautions</summary><ul className="mt-2 list-disc pl-5 text-ink-600">{r.caffeine.precautions.map((x) => <li key={x}>{x}</li>)}</ul></details>
          </>) : <p className="text-sm text-ink-600">Aucune caféine prévue. Choisissez une stratégie à l&apos;étape 4 si vous le souhaitez.</p>}
        </section>
      </div>

      <section className="frost-panel p-5" aria-labelledby="res-timeline">
        <h3 id="res-timeline" className="text-base font-bold">Timeline nutritionnelle</h3>
        <div className="mt-4 overflow-x-auto pb-2"><div className="relative min-w-[40rem]" style={{ height: 92 }}>
          <div className="absolute inset-x-0 top-11 h-1.5 rounded-full bg-gradient-to-r from-pine-500 via-glacier-500 to-ember-500 opacity-60" />
          {p.points.map((pt, k) => { const edge = k === 0 ? "start" : k === p.points.length - 1 ? "end" : "mid"; return <div key={pt.name + pt.tMin} className={clsx("absolute top-0", edge === "start" ? "text-left" : edge === "end" ? "-translate-x-full text-right" : "-translate-x-1/2 text-center")} style={{ left: `${(pt.tMin / dur) * 100}%` }}><span className="block whitespace-nowrap text-[11px] font-semibold text-ink-700">{pt.name}</span><span className="block text-[10px] text-ink-500">{pt.km != null ? `km ${pt.km}` : fmtDur(pt.tMin)}</span><span className={clsx("mt-1 block size-3 rounded-full border-2 border-white bg-ink-900 shadow", edge === "start" ? "-ml-1.5" : edge === "end" ? "ml-auto -mr-1.5" : "mx-auto")} /></div>; })}
          {run.filter((s) => s.kind === "course").map((s) => <span key={s.tMin} title={`${s.clock} : ${Math.round(s.got.carbsG)} g, ${Math.round(s.got.waterMl)} ml${s.target.caffeineMg ? `, ${s.target.caffeineMg} mg caféine` : ""}`} className={clsx("absolute top-[3.6rem] size-2.5 -translate-x-1/2 rounded-full", s.target.caffeineMg ? "bg-[#a67c2e] ring-2 ring-brass-400/60" : "bg-ember-500")} style={{ left: `${(s.tMin / dur) * 100}%` }} />)}
          <span className="absolute bottom-0 left-0 text-[10px] text-ink-500">● prise · <span className="text-[#a67c2e]">●</span> prise avec caféine</span>
        </div></div>
      </section>

      <section className="frost-panel p-5" aria-labelledby="res-table">
        <h3 id="res-table" className="text-base font-bold">Planning chronologique</h3>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[46rem] text-sm">
          <thead><tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500"><th className="py-2 pr-2">Heure</th><th className="pr-2">Km</th><th className="pr-2">Glucides</th><th className="pr-2">Eau</th><th className="pr-2">Sodium</th><th className="pr-2">Caféine</th><th>À prendre</th></tr></thead>
          <tbody>{run.map((s) => (
            <tr key={`${s.kind}${s.tMin}`} className={clsx("border-b border-ink-100 align-top last:border-0", s.aid && "bg-brass-100/40", s.kind === "avant" && "bg-brass-100/50")}>
              <td className="py-2 pr-2 font-display font-semibold">{s.clock}</td><td className="pr-2">{s.km ?? (s.kind === "avant" ? "avant" : "—")}</td>
              {(["carbsG", "waterMl", "sodiumMg"] as const).map((m) => { const k = runIdx.get(s), f = k != null ? sf.slots[k]?.[m] : undefined, u = m === "carbsG" ? "g" : m === "waterMl" ? "ml" : "mg"; return <td key={m} className={clsx("pr-2", f?.behind && "bg-danger/10 font-bold text-danger")}>{Math.round(s.got[m])} {u}{f?.behind && <span className="block text-[11px] font-semibold">retard −{f.behindBy} {u}</span>}</td>; })}<td className="pr-2">{s.target.caffeineMg ? <b className="text-[#5f4a1f]">{s.target.caffeineMg} mg</b> : ""}</td>
              <td className="text-ink-700">{[...s.items.map((it) => `${it.qty} × ${it.name}`), ...(s.drinkMl ? [`${Math.round(s.drinkMl)} ml de boisson`] : []), ...(s.plainWaterMl ? [`${Math.round(s.plainWaterMl)} ml d'eau`] : []), ...(s.caffeineOtherMg ? [`${s.caffeineOtherMg} mg de caféine (café, comprimé…)`] : [])].join(" · ") || "—"}{s.aid && <span className="ml-1 rounded bg-brass-100 px-1.5 text-[11px] font-semibold text-brass-600">{s.aid}</span>}</td>
            </tr>))}</tbody>
          <tfoot><tr className="border-t-2 border-ink-200 font-semibold"><td className="py-2" colSpan={2}>Total prévu</td>{(["carbsG", "waterMl", "sodiumMg"] as const).map((m) => { const g = sf.totals[m], bad = g.status === "short" || g.status === "missing"; return <td key={m} className={clsx(bad && "font-extrabold text-danger")}>{m === "waterMl" ? fmtL(g.got) : `${g.got} ${m === "carbsG" ? "g" : "mg"}`}</td>; })}<td>{p.totals.target.caffeineMg} mg</td><td /></tr>
            <tr className="text-xs text-ink-500"><td className="pb-2" colSpan={2}>Objectif</td>{(["carbsG", "waterMl", "sodiumMg"] as const).map((m) => { const g = sf.totals[m], bad = g.status === "short" || g.status === "missing"; return <td key={m} className={clsx(bad && "font-bold text-danger")}>{m === "waterMl" ? fmtL(g.target) : `${g.target} ${m === "carbsG" ? "g" : "mg"}`}{bad && <span className="block">manque {m === "waterMl" ? fmtL(g.gap) : g.gap}</span>}</td>; })}<td /><td /></tr></tfoot>
        </table></div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <section className="frost-panel p-5" aria-labelledby="res-seg">
          <h3 id="res-seg" className="text-base font-bold">Par tronçon : à emporter</h3>
          <ul className="mt-3 grid gap-2">{p.segments.map((g) => (
            <li key={g.index} className={clsx("rounded-xl border bg-white/60 p-3 text-sm", g.overCapacity ? "border-warn" : "border-ink-100")}>
              <p className="font-semibold">{g.from.name} → {g.to.name}<span className="ml-2 font-normal text-ink-500">{g.from.km != null && g.to.km != null ? `${(g.to.km - g.from.km).toFixed(1).replace(".", ",")} km · ` : ""}{fmtDur(g.to.tMin - g.from.tMin)}</span></p>
              <p className="mt-1 text-ink-700">{g.items.map((it) => `${it.qty} × ${it.name}`).join(" · ") || "Aucun produit"}{g.drinkPortions ? ` · ${g.drinkPortions} portion(s) de boisson` : ""}</p>
              {(() => { const gs = sf.segments[g.index], bad = (["carbsG", "sodiumMg"] as const).filter((m) => gs[m].status === "short" || gs[m].status === "missing"); return bad.length ? <p className="mt-1 rounded-lg bg-danger/10 px-2 py-1 text-xs font-bold text-danger">{bad.map((m) => `${m === "carbsG" ? "Glucides" : "Sodium"} : ${gs[m].got} / ${gs[m].target} ${m === "carbsG" ? "g" : "mg"} (manque ${gs[m].gap})`).join(" · ")}</p> : null; })()}
              <p className="mt-0.5 text-xs text-ink-500">{Math.round(g.got.carbsG)} g de glucides · {g.carryWaterMl} ml de liquide{g.overCapacity ? " (au-delà de votre capacité)" : ""} · {Math.round(g.got.sodiumMg)} mg de sodium{g.got.caffeineMg ? ` · ${Math.round(g.got.caffeineMg)} mg de caféine` : ""}</p>
            </li>))}</ul>
        </section>
        <section className="frost-panel p-5" aria-labelledby="res-prod">
          <h3 id="res-prod" className="flex items-center gap-2 text-base font-bold"><Package className="size-5 text-pine-600" />Produits nécessaires</h3>
          {p.totals.items.length || p.totals.drinkPortions ? <ul className="mt-3 grid gap-2 text-sm">{p.totals.items.map((it) => { const pr = input.products.find((x) => x.id === it.productId), short = p.shortages.find((x) => x.name === it.name); return <li key={it.productId} className="flex items-center gap-3 rounded-xl bg-ink-50 p-2.5"><span className="grid min-w-10 place-items-center rounded-lg bg-white px-2 py-1 font-display text-lg font-bold shadow-sm">{it.qty}</span><span className="min-w-0 flex-1"><b>{it.name}</b>{pr && <span className="text-ink-500"> · {CATEGORY_SHORT[pr.category]}</span>}<span className="block text-xs text-ink-500">{Math.round(it.carbsG)} g glucides · {Math.round(it.sodiumMg)} mg sodium{it.caffeineMg ? ` · ${Math.round(it.caffeineMg)} mg caféine` : ""}</span>{short && <span className="block text-xs font-semibold text-danger">Stock : {short.stock} seulement</span>}</span></li>; })}
            {p.totals.drinkPortions > 0 && <li className="flex items-center gap-3 rounded-xl bg-ink-50 p-2.5"><span className="grid min-w-10 place-items-center rounded-lg bg-white px-2 py-1 font-display text-lg font-bold shadow-sm">{p.totals.drinkPortions}</span><span><b>Portions de boisson</b><span className="block text-xs text-ink-500">{input.products.find((x) => x.id === input.prefs.drinkId)?.name}</span></span></li>}
            {p.totals.plainWaterMl > 0 && <li className="text-xs text-ink-500">+ {fmtL(p.totals.plainWaterMl)} d&apos;eau plate sur la course.</li>}
          </ul> : <p className="mt-2 text-sm text-ink-600">Aucun produit sélectionné : le planning indique les quantités en grammes, millilitres et milligrammes. Ajoutez vos produits à l&apos;étape 4.</p>}
        </section>
      </div>
      <Notices list={[...r.warnings, ...p.notices]} />
      <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-600">{DISCLAIMER}</p>
    </div>
  );
}

