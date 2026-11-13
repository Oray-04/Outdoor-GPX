"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Mountain, Plus } from "lucide-react";
import { loadIndex, PRACTICE_LABEL, type LibEntry } from "@/lib/library";
import { useAllEvents } from "@/lib/repo";
import { SPORTS } from "@/lib/sports";
import { fmtKm, fmtM } from "@/lib/geo";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { TopoPattern } from "@/components/ui/route-card";
import { eventHref } from "@/lib/url";

/** Grands itinéraires réels de la bibliothèque de référence (tracés OpenStreetMap, statistiques calculées). */
export function ReferenceHighlights() {
  const [items, setItems] = useState<LibEntry[] | null>(null);
  useEffect(() => { loadIndex().then((all) => setItems(["gr20", "tmb", "gr54-oisans-ecrins", "grandes-alpes-velo"].map((id) => all.find((e) => e.id === id)).filter((e): e is LibEntry => !!e))).catch(() => setItems([])); }, []);
  if (items && !items.length) return <p className="rounded-xl border border-dashed border-ink-200 bg-white p-6 text-sm text-ink-500">Les itinéraires de référence sont momentanément indisponibles.</p>;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {(items ?? Array.from({ length: 4 }, () => null)).map((e, i) => e ? (
        <Link key={e.id} href={`/explorer/?itineraire=${e.id}`} className="group overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100">
          <div className="relative h-28 overflow-hidden bg-gradient-to-br from-pine-600 to-ink-900 text-white"><TopoPattern className="transition duration-700 group-hover:scale-110" /><Badge tone="dark" className="absolute left-3 top-3">{PRACTICE_LABEL[e.practice] ?? e.practice}</Badge><Mountain className="absolute bottom-3 right-3 size-6 text-brass-400" /></div>
          <div className="p-4"><h3 className="font-semibold leading-snug">{e.name}</h3><p className="mt-0.5 text-sm text-ink-500">{e.region}</p>
            <p className="mt-3 flex gap-4 text-sm"><span><b className="font-display">{fmtKm(e.distanceM)}</b></span><span><b className="font-display">{fmtM(e.gainM)}</b> D+</span></p></div>
        </Link>
      ) : <div key={i} className="h-56 animate-pulse rounded-2xl bg-ink-100" aria-hidden="true" />)}
    </div>
  );
}

/** Prochains événements réellement créés ou publiés ; sinon une invitation à en créer un. */
export function UpcomingEvents() {
  const today = new Date().toISOString().slice(0, 10);
  const events = useAllEvents().filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  if (!events.length) return (
    <div className="flex flex-col items-start gap-4 rounded-[var(--radius-card)] frost-panel border-dashed p-8 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="size-5 text-pine-600" />Aucun événement à venir pour l'instant</h3><p className="mt-1 max-w-xl text-sm text-ink-500">Le calendrier affiche uniquement les événements réellement créés par des organisateurs. Vous organisez un trail, une randonnée ou une course cycliste ?</p></div>
      <ButtonLink href="/organisateurs" variant="brand"><Plus className="size-4" />Créer un événement</ButtonLink>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {events.map((e) => { const d = new Date(e.date); return (
        <Link key={e.id} href={eventHref(e.id)} className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-ink-100">
          <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-ink-900 text-center text-white"><div><div className="font-display text-2xl font-bold leading-none">{d.getUTCDate()}</div><div className="mt-0.5 text-[11px] uppercase tracking-wider text-brass-400">{d.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" })}</div></div></div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{[...new Set(e.races.map((r) => r.sport))].slice(0, 2).map((sp) => <Badge key={sp} tone="pine">{SPORTS[sp].label}</Badge>)}</div>
            <h3 className="mt-1.5 font-semibold leading-snug">{e.name}</h3><p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500"><MapPin className="size-3.5" />{[e.place, e.region].filter(Boolean).join(" · ")}</p></div>
        </Link>); })}
    </div>
  );
}
