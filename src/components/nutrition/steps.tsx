"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Route as RouteIcon, Wand2, Info, CalendarDays, Timer, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { eventsRepo, routesRepo } from "@/lib/repo";
import { linkEventRace, linkRoute } from "@/lib/nutrition/link";
import { suggestDurationMin, type FieldError, type NutritionResult } from "@/lib/nutrition/engine";
import { measuredSweatRate } from "@/lib/nutrition/hydration";
import { computeCaffeine } from "@/lib/nutrition/caffeine";
import { HABIT_LABEL, INTENSITY_LABEL, LEVEL_LABEL, RACE_LABEL, SALT_LABEL, SENSITIVITY_LABEL, SKY_LABEL, STRATEGY_LABEL, SWEAT_LABEL, TOLERANCE_LABEL, fmtDur, fmtRel } from "@/lib/nutrition/labels";
import type { PlanInput } from "@/lib/nutrition/types";
import { uid } from "@/lib/types";
import { Catalog } from "./catalog";

type V = Omit<PlanInput, "products">;
export type SetV = (fn: (v: V) => V) => void;
const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
/** « 20 min », « 1 h 15 » ; minutes fractionnaires arrondies. */
export const fmtEvery = (m: number) => { if (m < 60 && Math.abs(m - Math.round(m)) > 0.05) return `${Math.floor(m)} à ${Math.ceil(m)} min`; const r = Math.round(m); return r >= 60 ? `${Math.floor(r / 60)} h${r % 60 ? ` ${String(r % 60).padStart(2, "0")}` : ""}` : `${r} min`; };
const parse = (s: string): number | null => { const t = s.trim().replace(",", "."); if (t === "") return null; const n = Number(t); return Number.isFinite(n) ? n : null; };

/** Champ numérique facultatif ou obligatoire, avec unité ; vide = valeur manquante (jamais remplacée par une valeur fictive). */
export function Num({ label, value, onChange, unit, required, error, hint, step, min, max, id }: { label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; required?: boolean; error?: string; hint?: string; step?: number; min?: number; max?: number; id?: string }) {
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <label className="grid gap-1 text-sm font-medium">
      <span>{label}{required && <span className="ml-0.5 font-bold text-danger" aria-hidden="true">*</span>}</span>
      <span className="relative"><input id={id} inputMode="decimal" type="text" aria-invalid={!!error} required={required} className={clsx(inp, unit && "pr-14", error && "border-danger")} value={raw ?? (value == null ? "" : String(value).replace(".", ","))} step={step} min={min} max={max}
        onChange={(e) => { setRaw(e.target.value); onChange(parse(e.target.value)); }} onBlur={() => setRaw(null)} />
        {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500">{unit}</span>}</span>
      {hint && !error && <span className="text-xs font-normal text-ink-500">{hint}</span>}
      {error && <span role="alert" className="text-xs font-normal text-danger">{error}</span>}
    </label>
  );
}
/** Choix exclusif en pastilles (groupe de boutons radio accessible). */
export function Choice<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: Record<T, string>; onChange: (v: T) => void; hint?: string }) {
  return (
    <fieldset className="grid gap-1.5"><legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{(Object.keys(options) as T[]).map((k) => <label key={k} className={clsx("cursor-pointer rounded-full border px-3 py-1.5 text-sm font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brass-500", value === k ? "border-pine-600 bg-pine-600 text-white" : "border-ink-200 bg-white/80 text-ink-700 hover:border-pine-400")}><input type="radio" className="sr-only" checked={value === k} onChange={() => onChange(k)} />{options[k]}</label>)}</div>
      {hint && <span className="text-xs text-ink-500">{hint}</span>}
    </fieldset>
  );
}
const err = (errors: FieldError[], field: string) => errors.find((e) => e.field === field)?.text;
const Card = ({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) => <section className="frost-panel grid gap-4 p-4 sm:p-5"><div><h3 className="text-base font-bold">{title}</h3>{hint && <p className="text-sm text-ink-500">{hint}</p>}</div>{children}</section>;

export function StepProfile({ v, set, errors }: { v: V; set: SetV; errors: FieldError[] }) {
  const a = v.athlete, up = (p: Partial<V["athlete"]>) => set((x) => ({ ...x, athlete: { ...x.athlete, ...p } }));
  return (
    <Card title="Profil sportif" hint="Le poids sert au calcul de la caféine et de la sudation ; l'habitude et la tolérance plafonnent les glucides.">
      <div className="grid gap-4 sm:grid-cols-2"><Num label="Poids" unit="kg" required value={a.weightKg} onChange={(n) => up({ weightKg: n })} error={err(errors, "weightKg")} /><Num label="Expérience en endurance" unit="ans" value={a.experienceYears} onChange={(n) => up({ experienceYears: n })} hint="Facultatif" error={err(errors, "experienceYears")} /></div>
      <Choice label="Niveau" value={a.level} options={LEVEL_LABEL} onChange={(x) => up({ level: x })} />
      <Choice label="Tolérance digestive à l'effort" value={a.tolerance} options={TOLERANCE_LABEL} onChange={(x) => up({ tolerance: x })} hint="Faible : nausées, crampes d'estomac ou ballonnements fréquents quand vous mangez en courant." />
      <Choice label="Habitudes nutritionnelles pendant l'effort" value={a.habit} options={HABIT_LABEL} onChange={(x) => up({ habit: x })} hint="90 g/h ne sont proposés qu'avec un intestin entraîné, une bonne tolérance et un niveau confirmé." />
    </Card>
  );
}

export function StepRace({ v, set, errors }: { v: V; set: SetV; errors: FieldError[] }) {
  const r = v.race, up = (p: Partial<V["race"]>) => set((x) => ({ ...x, race: { ...x.race, ...p } }));
  const routes = routesRepo.useAll(), events = eventsRepo.useAll();
  // courses d'événements dont le parcours est enregistré sur l'appareil
  const eventRaces = events.flatMap((ev) => ev.races.filter((rc) => rc.routeId && routes.some((x) => x.id === rc.routeId)).map((rc) => ({ ev, rc })));
  /** Reprend la course d'un événement : parcours lié, distance, dénivelé, heure de départ et ravitaillements placés dans l'organisation. */
  const importEventRace = (key: string) => {
    const hit = eventRaces.find(({ ev, rc }) => `${ev.id}:${rc.id}` === key);
    if (!hit) { up({ eventRace: undefined }); return; }
    set((x) => linkEventRace(x, hit.ev, hit.rc.id, routes.find((r) => r.id === hit.rc.routeId)!, uid));
  };
  const suggestion = suggestDurationMin(r.type, r.distanceKm, r.gainM, v.athlete.level);
  /** Reprend distance, dénivelé et points de ravitaillement d'un parcours enregistré (aucune ressaisie). */
  const importRoute = (id: string) => {
    const rt = routes.find((x) => x.id === id); if (!rt) { up({ routeId: undefined, eventRace: undefined }); return; }
    set((x) => linkRoute(x, rt, uid));
  };
  const upAid = (id: string, p: Partial<V["aid"][number]>) => set((x) => ({ ...x, aid: x.aid.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
  return (<>
    <Card title="Caractéristiques de la course">
      {eventRaces.length > 0 && <label className="grid gap-1 text-sm font-medium"><span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-ember-600" />Course d&apos;un de mes événements (facultatif)</span><select className={inp} value={r.eventRace ? `${r.eventRace.eventId}:${r.eventRace.raceId}` : ""} onChange={(e) => importEventRace(e.target.value)}><option value="">— Aucune —</option>{events.filter((ev) => eventRaces.some((x) => x.ev.id === ev.id)).map((ev) => <optgroup key={ev.id} label={`${ev.name}${ev.date ? ` · ${ev.date}` : ""}`}>{eventRaces.filter((x) => x.ev.id === ev.id).map(({ rc }) => <option key={rc.id} value={`${ev.id}:${rc.id}`}>{rc.label} — {String(rc.distanceKm).replace(".", ",")} km, {rc.gainM} m D+</option>)}</optgroup>)}</select><span className="text-xs font-normal text-ink-500">Parcours, distance, dénivelé, heure de départ et ravitaillements de l&apos;organisation sont repris automatiquement.</span></label>}
      {routes.length > 0 && <label className="grid gap-1 text-sm font-medium"><span className="flex items-center gap-1.5"><RouteIcon className="size-4 text-pine-600" />{eventRaces.length ? "Ou partir d'un de mes parcours" : "Partir d'un de mes parcours (facultatif)"}</span><select className={inp} value={r.eventRace ? "" : r.routeId ?? ""} onChange={(e) => importRoute(e.target.value)}><option value="">— Saisie manuelle —</option>{routes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><span className="text-xs font-normal text-ink-500">Distance, dénivelé et ravitaillements (points d&apos;intérêt du parcours) sont repris automatiquement.</span></label>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Nom de la course (facultatif)<input className={inp} value={r.name} maxLength={80} onChange={(e) => up({ name: e.target.value })} /></label><Choice label="Type de course" value={r.type} options={RACE_LABEL} onChange={(x) => up({ type: x })} /></div>
      <div className="grid gap-4 sm:grid-cols-3"><Num label="Distance" unit="km" value={r.distanceKm} onChange={(n) => up({ distanceKm: n })} error={err(errors, "distanceKm")} /><Num label="Dénivelé positif" unit="m" value={r.gainM} onChange={(n) => up({ gainM: n })} error={err(errors, "gainM")} /><label className="grid gap-1 text-sm font-medium">Heure de départ<input type="time" className={inp} value={r.startTime} onChange={(e) => up({ startTime: e.target.value })} />{err(errors, "startTime") && <span role="alert" className="text-xs text-danger">{err(errors, "startTime")}</span>}</label></div>
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto]">
        <DurationField value={r.durationMin} onChange={(n) => up({ durationMin: n })} error={err(errors, "durationMin")} />
        {suggestion != null && <Button type="button" variant="secondary" onClick={() => up({ durationMin: suggestion })}><Wand2 className="size-4" />Estimer : {fmtDur(suggestion)}</Button>}
      </div>
      {suggestion != null && <p className="-mt-2 text-xs text-ink-500">Estimation à partir de la distance, du dénivelé (km-effort) et du niveau : à remplacer par votre temps réel si vous le connaissez.</p>}
      <Choice label="Intensité" value={r.intensity} options={INTENSITY_LABEL} onChange={(x) => up({ intensity: x })} hint="Facile : conversation aisée. Soutenue : allure de course sur une distance longue. Élevée : effort court et intense." />
    </Card>
    <Card title="Ravitaillements" hint="Facultatif : indiquez le kilomètre ou l'heure de passage (l'heure manquante est estimée au prorata de la distance). Les quantités sont regroupées par tronçon.">
      {!v.aid.length && <p className="text-sm text-ink-500">Aucun ravitaillement : le plan prévoit que vous emportez tout dès le départ.</p>}
      <ul className="grid gap-2">{v.aid.map((a, k) => (
        <li key={a.id} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-ink-100 bg-white/60 p-2.5 sm:grid-cols-[1.4fr_0.7fr_0.8fr_auto_auto]">
          <label className="col-span-2 grid gap-1 text-xs font-medium sm:col-span-1">Nom<input className={inp} value={a.name} onChange={(e) => upAid(a.id, { name: e.target.value })} placeholder={`Ravitaillement ${k + 1}`} /></label>
          <Num label="Km" value={a.km} onChange={(n) => upAid(a.id, { km: n })} />
          <label className="grid gap-1 text-xs font-medium">Passage (h:mm de course)<input className={inp} placeholder="estimé" value={a.etaMin == null ? "" : `${Math.floor(a.etaMin / 60)}:${String(a.etaMin % 60).padStart(2, "0")}`} onChange={(e) => { const m = /^(\d{1,2}):(\d{2})$/.exec(e.target.value.trim()); upAid(a.id, { etaMin: m ? +m[1] * 60 + +m[2] : null }); }} /></label>
          <label className="flex h-10 items-center gap-1.5 text-xs font-medium"><input type="checkbox" className="accent-[var(--color-pine-600)]" checked={a.water} onChange={(e) => upAid(a.id, { water: e.target.checked })} />Eau</label>
          <button type="button" aria-label={`Retirer ${a.name || `le ravitaillement ${k + 1}`}`} className="grid size-10 place-items-center rounded-lg hover:bg-danger/10 hover:text-danger" onClick={() => set((x) => ({ ...x, aid: x.aid.filter((y) => y.id !== a.id) }))}><Trash2 className="size-4" /></button>
        </li>))}</ul>
      <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => set((x) => ({ ...x, aid: [...x.aid, { id: uid(), name: "", km: null, etaMin: null, water: true, food: true }] }))}><Plus className="size-4" />Ajouter un ravitaillement</Button>
    </Card>
  </>);
}

/** Durée en heures et minutes (deux champs), convertie en minutes. */
function DurationField({ value, onChange, error }: { value: number | null; onChange: (v: number | null) => void; error?: string }) {
  const h = value == null ? "" : String(Math.floor(value / 60)), m = value == null ? "" : String(Math.round(value % 60));
  const upd = (hh: string, mm: string) => { const H = parse(hh), M = parse(mm); onChange(H == null && M == null ? null : (H ?? 0) * 60 + (M ?? 0)); };
  return (
    <fieldset className="grid gap-1"><legend className="mb-1 text-sm font-medium">Durée estimée<span className="ml-0.5 font-bold text-danger" aria-hidden="true">*</span></legend>
      <div className="flex items-center gap-2"><span className="relative w-28"><input aria-label="Heures" inputMode="numeric" className={clsx(inp, "pr-8", error && "border-danger")} value={h} onChange={(e) => upd(e.target.value, m)} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500">h</span></span>
        <span className="relative w-28"><input aria-label="Minutes" inputMode="numeric" className={clsx(inp, "pr-10", error && "border-danger")} value={m} onChange={(e) => upd(h, e.target.value)} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-500">min</span></span></div>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </fieldset>
  );
}

export function StepWeather({ v, set, errors }: { v: V; set: SetV; errors: FieldError[] }) {
  const w = v.weather, up = (p: Partial<V["weather"]>) => set((x) => ({ ...x, weather: { ...x.weather, ...p } }));
  return (
    <Card title="Conditions météorologiques" hint="Prévisions du jour de course. Température et humidité pèsent fortement sur la sudation.">
      <div className="grid gap-4 sm:grid-cols-2"><Num label="Température moyenne pendant la course" unit="°C" required value={w.tempC} onChange={(n) => up({ tempC: n })} error={err(errors, "tempC")} /><Num label="Humidité" unit="%" required value={w.humidityPct} onChange={(n) => up({ humidityPct: n })} error={err(errors, "humidityPct")} /></div>
      <Choice label="Conditions" value={w.sky} options={SKY_LABEL} onChange={(x) => up({ sky: x })} />
      <Choice label="Votre sudation" value={w.sweat} options={SWEAT_LABEL} onChange={(x) => up({ sweat: x })} hint="Abondante : vêtements trempés rapidement, même par temps doux. Un test de pesée (étape suivante) remplace cette estimation." />
    </Card>
  );
}

export function StepPrefs({ v, set, errors, result }: { v: V; set: SetV; errors: FieldError[]; result?: NutritionResult | null }) {
  const p = v.prefs, up = (q: Partial<V["prefs"]>) => set((x) => ({ ...x, prefs: { ...x.prefs, ...q } })), c = p.caffeine, upC = (q: Partial<V["prefs"]["caffeine"]>) => up({ caffeine: { ...c, ...q } });
  const test = p.sweatTest, testRes = test ? measuredSweatRate(test) : null;
  const preview = useMemo(() => (v.athlete.weightKg && v.race.durationMin ? computeCaffeine({ weightKg: v.athlete.weightKg, durationMin: v.race.durationMin, strategy: c.strategy, customMgKg: c.customMgKg, sensitivity: c.sensitivity, habitualMgDay: c.habitualMgDay, doses: null, startTime: v.race.startTime }) : null), [v.athlete.weightKg, v.race.durationMin, v.race.startTime, c.strategy, c.customMgKg, c.sensitivity, c.habitualMgDay]);
  const doses = c.doses ?? null, iv = result?.interval;
  return (<>
    <Card title="Ce que vous emporterez" hint="Cochez vos gels, barres, pâtes de fruits ou boissons. Le site calcule tout seul à quel rythme les prendre et combien en emporter.">
      <Catalog selected={p.productIds} onToggle={(id) => up({ productIds: p.productIds.includes(id) ? p.productIds.filter((x) => x !== id) : [...p.productIds, id], drinkId: p.drinkId === id && p.productIds.includes(id) ? null : p.drinkId })} drinkId={p.drinkId} onDrink={(id) => up({ drinkId: id })} />
      {result && iv && <div className="rounded-2xl bg-pine-50 p-4 ring-1 ring-pine-100" data-interval aria-live="polite">
        <p className="flex items-center gap-2 text-sm font-bold text-pine-800"><Timer className="size-4" />Rythme calculé pour vous</p>
        {iv.basis === "produits" ? <>
          <p className="mt-1 text-lg font-bold text-ink-900">{iv.portions > 1 ? `${iv.portions} portions` : "1 portion"} toutes les {fmtEvery(iv.carbEveryMin)}</p>
          <p className="mt-1 text-sm text-ink-700">Objectif : <b>{result.carbs.gph} g de glucides par heure</b>.{iv.drinkGph ? ` Votre boisson en apporte environ ${iv.drinkGph} g/h ; il reste ${iv.solidGph} g/h à prendre en produits.` : ""} Une portion de vos produits contient en moyenne <b>{String(iv.servingG).replace(".", ",")} g</b>.</p>
          <p className="mt-1 rounded-lg bg-white/70 px-3 py-1.5 text-sm text-ink-700">Calcul : {iv.portions > 1 ? `${iv.portions} × ` : ""}{String(iv.servingG).replace(".", ",")} g ÷ {iv.solidGph} g/h × 60 min = {String(Math.round(((iv.servingG ?? 0) * iv.portions / iv.solidGph) * 60 * 10) / 10).replace(".", ",")} min{Math.abs(((iv.servingG ?? 0) * iv.portions / iv.solidGph) * 60 - iv.carbEveryMin) > 0.05 ? `, arrondi à ${fmtEvery(iv.carbEveryMin)}` : ""} → environ {iv.effectiveGph} g/h au total.</p>
          {iv.stepMin < iv.carbEveryMin && <p className="mt-1 text-sm text-ink-700">Entre deux prises, buvez quelques gorgées toutes les {fmtEvery(iv.stepMin)} environ.</p>}
        </> : iv.basis === "boisson" ? <p className="mt-1 text-sm text-ink-700">Votre boisson couvre à elle seule l&apos;objectif de {result.carbs.gph} g/h : buvez-en régulièrement, quelques gorgées toutes les {fmtEvery(iv.stepMin)}.</p>
          : iv.basis === "aucun-objectif" ? <p className="mt-1 text-sm text-ink-700">Pour un effort de cette durée, aucun apport de glucides n&apos;est nécessaire : buvez selon la soif.</p>
          : <p className="mt-1 text-sm text-ink-700">Cochez au moins un produit (gel, barre…) : le site calculera l&apos;intervalle entre les prises à partir de ses glucides et de votre objectif de {result.carbs.gph} g/h.</p>}
      </div>}
    </Card>
    <Card title="Caféine (facultatif)" hint="Elle peut aider en fin d'effort, mais elle ne convient pas à tout le monde. Ne testez jamais une nouvelle dose le jour de la course.">
      <Choice label="Voulez-vous de la caféine ?" value={c.strategy} options={STRATEGY_LABEL} onChange={(x) => upC({ strategy: x, doses: null })} hint="« Prudente » est le bon choix pour commencer." />
      {c.strategy === "personnalisee" && <Num label="Dose totale" unit="mg/kg" value={c.customMgKg} onChange={(n) => upC({ customMgKg: n, doses: null })} hint="Bornée à 6 mg/kg ; au-delà de 3 mg/kg, effets indésirables plus fréquents." />}
      {c.strategy !== "aucune" && (<>
        <div className="grid gap-4 sm:grid-cols-2"><Num label="Caféine que vous prenez d'habitude" unit="mg/jour" value={c.habitualMgDay} onChange={(n) => upC({ habitualMgDay: n })} hint="Un expresso ≈ 60 à 100 mg" /><Choice label="Sensibilité à la caféine" value={c.sensitivity} options={SENSITIVITY_LABEL} onChange={(x) => upC({ sensitivity: x, doses: null })} /></div>
        <div className="rounded-xl bg-ink-50 p-3 text-sm">
          <p className="font-semibold">Quand la prendre {doses ? "(vos horaires)" : "(proposé)"}</p>
          {(doses ?? preview?.doses ?? []).length ? <ul className="mt-2 grid gap-1.5">{(doses ?? preview?.doses ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">{doses ? <>
              <span className="relative w-28"><input aria-label="Moment (min, négatif = avant le départ)" inputMode="numeric" className={clsx(inp, "!h-9 pr-10")} value={d.atMin} onChange={(e) => { const n = parse(e.target.value); if (n != null) upC({ doses: doses.map((x) => (x.id === d.id ? { ...x, atMin: Math.round(n) } : x)) }); }} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-500">min</span></span>
              <span className="relative w-28"><input aria-label="Dose (mg)" inputMode="numeric" className={clsx(inp, "!h-9 pr-9")} value={d.mg} onChange={(e) => { const n = parse(e.target.value); if (n != null) upC({ doses: doses.map((x) => (x.id === d.id ? { ...x, mg: Math.max(0, Math.round(n)) } : x)) }); }} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-500">mg</span></span>
              <span className="text-xs text-ink-500">{fmtRel(d.atMin)}</span><button type="button" aria-label="Retirer cette prise" className="grid size-8 place-items-center rounded-lg hover:bg-danger/10" onClick={() => upC({ doses: doses.filter((x) => x.id !== d.id) })}><Trash2 className="size-4" /></button>
            </> : <span><b>{d.mg} mg</b> · {fmtRel(d.atMin)}</span>}</li>))}</ul> : <p className="mt-1 text-ink-500">{v.athlete.weightKg && v.race.durationMin ? "Aucune prise." : "Renseignez votre poids et la durée pour voir les prises proposées."}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {!doses && preview && preview.doses.length > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => upC({ doses: preview.doses.map((d) => ({ ...d, id: uid() })) })}>Changer les horaires</Button>}
            {doses && <><Button type="button" size="sm" variant="secondary" onClick={() => upC({ doses: [...doses, { id: uid(), atMin: Math.round((v.race.durationMin ?? 120) / 2), mg: 50 }] })}><Plus className="size-4" />Ajouter une prise</Button><Button type="button" size="sm" variant="ghost" onClick={() => upC({ doses: null })}>Revenir à la proposition</Button></>}
          </div>
          {doses && <p className="mt-2 text-xs text-ink-500">Moment en minutes depuis le départ ; négatif = avant le départ (ex. −45).</p>}
        </div>
      </>)}
    </Card>
    <details className="frost-panel group p-5" open={p.carbOverrideGph != null || p.intakeOverrideMlH != null || p.sodiumOverrideMgH != null || p.carryMl != null || errors.length > 0}>
      <summary className="flex cursor-pointer list-none items-center gap-2"><ChevronDown className="size-4 text-ink-400 transition group-open:rotate-180" /><span><span className="block font-bold">Réglages avancés (facultatif)</span><span className="block text-sm text-ink-500">Si vous connaissez déjà vos besoins. Sinon, laissez vide : tout est calculé.</span></span></summary>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3"><Num label="Objectif glucidique" unit="g/h" value={p.carbOverrideGph} onChange={(n) => up({ carbOverrideGph: n })} hint="Calculé si vide" error={err(errors, "carbOverrideGph")} /><Num label="Eau" unit="ml/h" value={p.intakeOverrideMlH} onChange={(n) => up({ intakeOverrideMlH: n })} hint="Calculée si vide" /><Num label="Sodium" unit="mg/h" value={p.sodiumOverrideMgH} onChange={(n) => up({ sodiumOverrideMgH: n })} hint="Calculé si vide" /></div>
        <div className="grid gap-4 sm:grid-cols-2"><Num label="Liquide transporté" unit="ml" value={p.carryMl} onChange={(n) => up({ carryMl: n })} hint="Flasques et poche à eau" error={err(errors, "carryMl")} />
          <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium"><input type="checkbox" className="size-4 accent-[var(--color-pine-600)]" checked={p.refillAtAid} onChange={(e) => up({ refillAtAid: e.target.checked })} />Je recharge aux ravitaillements</label></div>
      </div>
    </details>
    <details className="frost-panel group p-5" open={!!test || !!p.sweatSodium?.value}>
      <summary className="flex cursor-pointer list-none items-center gap-2"><ChevronDown className="size-4 text-ink-400 transition group-open:rotate-180" /><span><span className="block font-bold">Mesures personnelles (facultatif)</span><span className="block text-sm text-ink-500">Un test de sudation remplace les estimations et rend le plan bien plus fiable.</span></span></summary>
      <div className="mt-4 grid gap-4">
        <p className="text-xs text-ink-500">Sortie d&apos;au moins 30 min à l&apos;intensité et dans des conditions proches de la course. Pesez-vous nu, séché, avant et après. Débit = (poids avant − poids après + liquide bu − urines) / durée.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([["preKg", "Poids avant", "kg"], ["postKg", "Poids après", "kg"], ["fluidL", "Liquide bu", "L"], ["urineL", "Urines", "L"], ["durationMin", "Durée", "min"]] as const).map(([k, l, u]) => <Num key={k} label={l} unit={u} value={test?.[k] ?? null} onChange={(n) => up({ sweatTest: { preKg: null, postKg: null, fluidL: null, urineL: null, durationMin: null, ...test, [k]: n } })} />)}
        </div>
        {testRes?.lh != null ? <p className="rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-700">Débit de sudation mesuré : <b>{testRes.lh.toString().replace(".", ",")} L/h</b> — utilisé à la place de l&apos;estimation.</p> : testRes?.error && test && Object.values(test).some((x) => x != null) && <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm">{testRes.error}</p>}
        {test && <button type="button" className="w-fit text-xs font-semibold text-ink-600 underline" onClick={() => up({ sweatTest: null })}>Effacer le test</button>}
        <Choice label="Votre sueur" value={p.saltProfile} options={SALT_LABEL} onChange={(x) => up({ saltProfile: x })} />
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]"><Num label="Sodium de la sueur mesuré (analyse)" value={p.sweatSodium?.value ?? null} onChange={(n) => up({ sweatSodium: n == null ? null : { value: n, unit: p.sweatSodium?.unit ?? "mgL" } })} hint="Facultatif — remplace l'estimation" />
          <select aria-label="Unité" className={clsx(inp, "w-32")} value={p.sweatSodium?.unit ?? "mgL"} onChange={(e) => up({ sweatSodium: { value: p.sweatSodium?.value ?? null, unit: e.target.value as "mgL" | "mmolL" } })}><option value="mgL">mg/L</option><option value="mmolL">mmol/L</option></select></div>
        <p className="flex gap-2 text-xs text-ink-500"><Info className="mt-0.5 size-3.5 shrink-0" />1 mmol/L de sodium = 23 mg/L. Ne confondez pas la concentration de la sueur (mg/L) et la quantité à absorber (mg/h).</p>
      </div>
    </details>
  </>);
}
