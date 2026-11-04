"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, X } from "lucide-react";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAllEvents } from "@/lib/repo";
import { DEFAULT_EVENT_FILTERS, filterEvents, type EventFilters } from "@/lib/events";
import { SPORTS } from "@/lib/sports";
import { cloudEnabled } from "@/lib/cloud";
import { communityEvents } from "@/lib/community";
import type { EventModel } from "@/lib/events";
import { eventHref } from "@/lib/url";

const sel = "h-10 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm";

export function EventsList() {
  const mine = useAllEvents();
  const [shared, setShared] = useState<EventModel[]>([]);
  useEffect(() => { if (cloudEnabled) communityEvents().then(setShared).catch(() => setShared([])); }, []);
  const all = useMemo(() => [...mine, ...shared.filter((s) => !mine.some((m) => m.id === s.id))], [mine, shared]);
  const [f, setF] = useState<EventFilters>(DEFAULT_EVENT_FILTERS);
  const regions = useMemo(() => [...new Set(all.map((e) => e.region).filter(Boolean))].sort(), [all]);
  const list = useMemo(() => filterEvents(all, f), [all, f]);
  const byMonth = useMemo(() => { const m = new Map<string, typeof list>(); for (const e of list) { const k = e.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), e]); } return [...m]; }, [list]);
  const dirty = JSON.stringify(f) !== JSON.stringify(DEFAULT_EVENT_FILTERS);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold sm:text-4xl">Calendrier des événements</h1><p className="mt-2 text-ink-600">Courses et sorties organisées. Vous organisez un événement ? <Link href="/organisateurs" className="font-semibold text-pine-700 underline">Espace organisateurs</Link></p></div>
      </div>
      <div className="mt-6 grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">Recherche<input className={sel} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Nom, lieu, organisateur" /></label>
        <label className="grid gap-1 text-sm font-medium">Sport<select className={sel} value={f.sport} onChange={(e) => setF({ ...f, sport: e.target.value })}><option value="">Tous</option>{Object.entries(SPORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-medium">Région<select className={sel} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}><option value="">Toutes</option>{regions.map((r) => <option key={r}>{r}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-sm font-medium">Dist. min<input type="number" min={0} className={sel} value={f.minKm} onChange={(e) => setF({ ...f, minKm: Math.max(0, +e.target.value || 0) })} /></label><label className="grid gap-1 text-sm font-medium">Dist. max<input type="number" min={0} className={sel} value={f.maxKm} onChange={(e) => setF({ ...f, maxKm: +e.target.value || 0 })} /></label></div>
        <label className="grid gap-1 text-sm font-medium">Du<input type="date" className={sel} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Au<input type="date" className={sel} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        {dirty && <div className="flex items-end"><Button variant="secondary" size="sm" onClick={() => setF(DEFAULT_EVENT_FILTERS)}><X className="size-4" />Réinitialiser</Button></div>}
      </div>
      <p className="mt-4 text-sm text-ink-600" aria-live="polite"><b>{list.length}</b> événement(s)</p>
      {!list.length && <p className="mt-4 rounded-xl border border-dashed border-ink-200 p-8 text-center text-ink-500">Aucun événement ne correspond à ces critères.</p>}
      {byMonth.map(([k, evs]) => (
        <section key={k} className="mt-6"><h2 className="mb-3 flex items-center gap-2 text-lg font-bold capitalize"><CalendarDays className="size-5 text-pine-600" />{new Date(k + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h2>
          <ul className="grid gap-3">{evs.map((e) => { const d = new Date(e.date + "T12:00:00"); return (
            <li key={e.id}><Link href={eventHref(e.id)} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-ink-100 transition hover:-translate-y-0.5 hover:shadow-card">
              <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-ink-900 text-white"><div className="text-center"><div className="font-display text-2xl font-bold leading-none">{d.getDate()}</div><div className="mt-0.5 text-[11px] uppercase text-ink-300">{d.toLocaleDateString("fr-FR", { month: "short" })}</div></div></div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5">{[...new Set(e.races.map((r) => r.sport))].map((s) => <Badge key={s} tone="pine">{SPORTS[s].label}</Badge>)}{e.origin === "demo" ? <DemoBadge /> : e.origin === "community" ? <Badge tone="glacier">Organisateur</Badge> : <Badge>Créé ici</Badge>}</div>
                <h3 className="mt-1 font-semibold">{e.name}</h3><p className="flex items-center gap-1 text-sm text-ink-500"><MapPin className="size-3.5" />{[e.place, e.region].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-sm text-ink-700">{e.races.map((r) => `${r.label} ${r.distanceKm} km`).join(" · ")}</p></div></Link></li>); })}</ul></section>
      ))}
    </div>
  );
}
