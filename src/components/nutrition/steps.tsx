"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Route as RouteIcon, Wand2, FlaskConical, Info, CalendarDays } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { eventsRepo, routesRepo } from "@/lib/repo";
import { trackStats } from "@/lib/geo";
import { positionOnTrack } from "@/lib/events";
import { suggestDurationMin, type FieldError } from "@/lib/nutrition/engine";
import { measuredSweatRate } from "@/lib/nutrition/hydration";
import { computeCaffeine } from "@/lib/nutrition/caffeine";
import { HABIT_LABEL, INTENSITY_LABEL, LEVEL_LABEL, RACE_LABEL, SALT_LABEL, SENSITIVITY_LABEL, SKY_LABEL, STRATEGY_LABEL, SWEAT_LABEL, TOLERANCE_LABEL, fmtDur, fmtRel } from "@/lib/nutrition/labels";
import type { PlanInput } from "@/lib/nutrition/types";
import { uid } from "@/lib/types";
import { Catalog } from "./catalog";

type V = Omit<PlanInput, "products">;
export type SetV = (fn: (v: V) => V) => void;
const inp = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
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
    const { ev, rc } = hit, rt = routes.find((x) => x.id === rc.routeId)!, s = trackStats(rt.coords, 3), km = Math.round(s.distanceM / 100) / 10;
    const posts = ev.posts.filter((p) => p.raceId === rc.id && (p.kind === "ravito" || p.kind === "eau") && p.km > 0 && p.km < km).sort((a, b) => a.km - b.km);
    const aid = posts.length ? posts.map((p) => ({ id: uid(), name: p.name || (p.kind === "eau" ? "Point d'eau" : "Ravitaillement"), km: Math.round(p.km * 10) / 10, etaMin: null, water: true, food: p.kind === "ravito" })) : aidFromRoute(rt);
    set((x) => ({ ...x, race: { ...x.race, eventRace: { eventId: ev.id, raceId: rc.id }, routeId: rt.id, name: `${ev.name} — ${rc.label}`, distanceKm: km, gainM: Math.round(s.gainM), startTime: /^\d{1,2}:\d{2}$/.test(rc.startTime) ? rc.startTime : x.race.startTime, type: km > 80 ? "ultra" : rc.sport === "course" ? "route" : "trail" }, aid: aid.length ? aid : x.aid }));
  };
  const aidFromRoute = (rt: (typeof routes)[number]) => rt.pois.filter((p) => p.type === "ravito" || p.type === "eau").map((p) => ({ id: uid(), name: p.name || (p.type === "eau" ? "Point d'eau" : "Ravitaillement"), km: Math.round(positionOnTrack(rt.coords, p.lng, p.lat).km * 10) / 10, etaMin: null, water: true, food: p.type === "ravito" })).sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  const suggestion = suggestDurationMin(r.type, r.distanceKm, r.gainM, v.athlete.level);
  /** Reprend distance, dénivelé et points de ravitaillement d'un parcours enregistré (aucune ressaisie). */
  const importRoute = (id: string) => {
    const rt = routes.find((x) => x.id === id); if (!rt) { up({ routeId: undefined, eventRace: undefined }); return; }
    const s = trackStats(rt.coords, 3), km = Math.round(s.distanceM / 100) / 10;
    const aid = aidFromRoute(rt);
    set((x) => ({ ...x, race: { ...x.race, eventRace: undefined, routeId: id, name: x.race.name || rt.name, distanceKm: km, gainM: Math.round(s.gainM), type: km > 80 ? "ultra" : rt.sport === "course" ? "route" : "trail" }, aid: aid.length ? aid : x.aid }));
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

export function StepPrefs({ v, set, errors }: { v: V; set: SetV; errors: FieldError[] }) {
  const p = v.prefs, up = (q: Partial<V["prefs"]>) => set((x) => ({ ...x, prefs: { ...x.prefs, ...q } })), c = p.caffeine, upC = (q: Partial<V["prefs"]["caffeine"]>) => up({ caffeine: { ...c, ...q } });
  const test = p.sweatTest, testRes = test ? measuredSweatRate(test) : null;
  const preview = useMemo(() => (v.athlete.weightKg && v.race.durationMin ? computeCaffeine({ weightKg: v.athlete.weightKg, durationMin: v.race.durationMin, strategy: c.strategy, customMgKg: c.customMgKg, sensitivity: c.sensitivity, habitualMgDay: c.habitualMgDay, halfLifeH: c.halfLifeH, doses: null, startTime: v.race.startTime }) : null), [v.athlete.weightKg, v.race.durationMin, v.race.startTime, c.strategy, c.customMgKg, c.sensitivity, c.habitualMgDay, c.halfLifeH]);
  const doses = c.doses ?? null;
  return (<>
    <Card title="Produits utilisés" hint="Cochez ce que vous emporterez. Le plan calcule le nombre exact de chaque produit.">
      <Catalog selected={p.productIds} onToggle={(id) => up({ productIds: p.productIds.includes(id) ? p.productIds.filter((x) => x !== id) : [...p.productIds, id], drinkId: p.drinkId === id && p.productIds.includes(id) ? null : p.drinkId })} drinkId={p.drinkId} onDrink={(id) => up({ drinkId: id })} />
      <label className="grid gap-1 text-sm font-medium">Préférences alimentaires (facultatif)<textarea rows={2} className="rounded-lg border border-ink-200 bg-white p-3 text-sm" value={p.foodNotes} maxLength={300} placeholder="Ex. salé après 4 h, pas de fructose, sans gluten…" onChange={(e) => up({ foodNotes: e.target.value })} /></label>
    </Card>
    <Card title="Objectifs et organisation" hint="Laissez vide pour utiliser les valeurs calculées. Une valeur saisie hors des repères est acceptée mais signalée.">
      <div className="grid gap-4 sm:grid-cols-3"><Num label="Objectif glucidique" unit="g/h" value={p.carbOverrideGph} onChange={(n) => up({ carbOverrideGph: n })} hint="Calculé si vide" error={err(errors, "carbOverrideGph")} /><Num label="Eau" unit="ml/h" value={p.intakeOverrideMlH} onChange={(n) => up({ intakeOverrideMlH: n })} hint="Calculée si vide" /><Num label="Sodium" unit="mg/h" value={p.sodiumOverrideMgH} onChange={(n) => up({ sodiumOverrideMgH: n })} hint="Calculé si vide" /></div>
      <div className="grid gap-4 sm:grid-cols-3"><Num label="Une prise toutes les" unit="min" value={p.intervalMin} onChange={(n) => up({ intervalMin: n ?? 20 })} error={err(errors, "intervalMin")} /><Num label="Liquide transporté" unit="ml" value={p.carryMl} onChange={(n) => up({ carryMl: n })} hint="Flasques et poche à eau ; facultatif" error={err(errors, "carryMl")} />
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium"><input type="checkbox" className="size-4 accent-[var(--color-pine-600)]" checked={p.refillAtAid} onChange={(e) => up({ refillAtAid: e.target.checked })} />Je recharge aux ravitaillements</label></div>
    </Card>
    <Card title="Caféine" hint="Facultative. Stratégie prudente par défaut ; testez-la toujours à l'entraînement.">
      <Choice label="Stratégie" value={c.strategy} options={STRATEGY_LABEL} onChange={(x) => upC({ strategy: x, doses: null })} />
      {c.strategy === "personnalisee" && <Num label="Dose totale" unit="mg/kg" value={c.customMgKg} onChange={(n) => upC({ customMgKg: n, doses: null })} hint="Bornée à 6 mg/kg ; au-delà de 3 mg/kg, effets indésirables plus fréquents." />}
      {c.strategy !== "aucune" && (<>
        <div className="grid gap-4 sm:grid-cols-3"><Num label="Consommation habituelle" unit="mg/jour" value={c.habitualMgDay} onChange={(n) => upC({ habitualMgDay: n })} hint="Un expresso ≈ 60 à 100 mg" /><Num label="Demi-vie" unit="h" value={c.halfLifeH} onChange={(n) => upC({ halfLifeH: n })} hint="5 h par défaut (de 2 à 10 h)" /><label className="grid gap-1 text-sm font-medium">Heure du coucher le soir<input type="time" className={inp} value={c.bedtime} onChange={(e) => upC({ bedtime: e.target.value })} /><span className="text-xs font-normal text-ink-500">Pour estimer la caféine restante</span></label></div>
        <Choice label="Sensibilité à la caféine" value={c.sensitivity} options={SENSITIVITY_LABEL} onChange={(x) => upC({ sensitivity: x, doses: null })} />
        <div className="rounded-xl bg-ink-50 p-3 text-sm">
          <p className="font-semibold">Prises {doses ? "personnalisées" : "proposées"}</p>
          {(doses ?? preview?.doses ?? []).length ? <ul className="mt-2 grid gap-1.5">{(doses ?? preview?.doses ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">{doses ? <>
              <span className="relative w-28"><input aria-label="Moment (min, négatif = avant le départ)" inputMode="numeric" className={clsx(inp, "!h-9 pr-10")} value={d.atMin} onChange={(e) => { const n = parse(e.target.value); if (n != null) upC({ doses: doses.map((x) => (x.id === d.id ? { ...x, atMin: Math.round(n) } : x)) }); }} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-500">min</span></span>
              <span className="relative w-28"><input aria-label="Dose (mg)" inputMode="numeric" className={clsx(inp, "!h-9 pr-9")} value={d.mg} onChange={(e) => { const n = parse(e.target.value); if (n != null) upC({ doses: doses.map((x) => (x.id === d.id ? { ...x, mg: Math.max(0, Math.round(n)) } : x)) }); }} /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-500">mg</span></span>
              <span className="text-xs text-ink-500">{fmtRel(d.atMin)}</span><button type="button" aria-label="Retirer cette prise" className="grid size-8 place-items-center rounded-lg hover:bg-danger/10" onClick={() => upC({ doses: doses.filter((x) => x.id !== d.id) })}><Trash2 className="size-4" /></button>
            </> : <span><b>{d.mg} mg</b> · {fmtRel(d.atMin)}</span>}</li>))}</ul> : <p className="mt-1 text-ink-500">{v.athlete.weightKg && v.race.durationMin ? "Aucune prise." : "Renseignez poids et durée pour voir les prises proposées."}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {!doses && preview && preview.doses.length > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => upC({ doses: preview.doses.map((d) => ({ ...d, id: uid() })) })}>Personnaliser les prises</Button>}
            {doses && <><Button type="button" size="sm" variant="secondary" onClick={() => upC({ doses: [...doses, { id: uid(), atMin: Math.round((v.race.durationMin ?? 120) / 2), mg: 50 }] })}><Plus className="size-4" />Ajouter une prise</Button><Button type="button" size="sm" variant="ghost" onClick={() => upC({ doses: null })}>Revenir aux prises proposées</Button></>}
          </div>
          <p className="mt-2 text-xs text-ink-500">Moment en minutes depuis le départ ; négatif = avant le départ (ex. −45).</p>
        </div>
      </>)}
    </Card>
    <Card title="Mesures personnelles (facultatif)" hint="Elles remplacent les estimations et rendent le plan bien plus fiable.">
      <details open={!!test}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-pine-700"><FlaskConical className="size-4" />Test de sudation par pesée</summary>
        <p className="mt-2 text-xs text-ink-500">Sortie d&apos;au moins 30 min à l&apos;intensité et dans des conditions proches de la course. Pesez-vous nu, séché, avant et après. Débit = (poids avant − poids après + liquide bu − urines) / durée.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([["preKg", "Poids avant", "kg"], ["postKg", "Poids après", "kg"], ["fluidL", "Liquide bu", "L"], ["urineL", "Urines", "L"], ["durationMin", "Durée", "min"]] as const).map(([k, l, u]) => <Num key={k} label={l} unit={u} value={test?.[k] ?? null} onChange={(n) => up({ sweatTest: { preKg: null, postKg: null, fluidL: null, urineL: null, durationMin: null, ...test, [k]: n } })} />)}
        </div>
        {testRes?.lh != null ? <p className="mt-2 rounded-lg bg-pine-50 px-3 py-2 text-sm text-pine-700">Débit de sudation mesuré : <b>{testRes.lh.toString().replace(".", ",")} L/h</b> — utilisé à la place de l&apos;estimation.</p> : testRes?.error && test && Object.values(test).some((x) => x != null) && <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-sm">{testRes.error}</p>}
        {test && <button type="button" className="mt-2 text-xs font-semibold text-ink-600 underline" onClick={() => up({ sweatTest: null })}>Effacer le test</button>}
      </details>
      <Choice label="Votre sueur" value={p.saltProfile} options={SALT_LABEL} onChange={(x) => up({ saltProfile: x })} />
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]"><Num label="Sodium de la sueur mesuré (analyse)" value={p.sweatSodium?.value ?? null} onChange={(n) => up({ sweatSodium: n == null ? null : { value: n, unit: p.sweatSodium?.unit ?? "mgL" } })} hint="Facultatif — remplace l'estimation" />
        <select aria-label="Unité" className={clsx(inp, "w-32")} value={p.sweatSodium?.unit ?? "mgL"} onChange={(e) => up({ sweatSodium: { value: p.sweatSodium?.value ?? null, unit: e.target.value as "mgL" | "mmolL" } })}><option value="mgL">mg/L</option><option value="mmolL">mmol/L</option></select></div>
      <p className="flex gap-2 text-xs text-ink-500"><Info className="mt-0.5 size-3.5 shrink-0" />1 mmol/L de sodium = 23 mg/L. Ne confondez pas la concentration de la sueur (mg/L) et la quantité à absorber (mg/h).</p>
    </Card>
  </>);
}
