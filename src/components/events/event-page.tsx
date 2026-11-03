"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowLeft, MapPin, CalendarDays, ExternalLink, Settings } from "lucide-react";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { RouteMap } from "@/components/map/route-map";
import { useAllEvents, routesRepo } from "@/lib/repo";
import { POST_KINDS } from "@/lib/events";
import { SPORTS } from "@/lib/sports";
import { routeHref, manageHref } from "@/lib/url";

const safeUrl = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };

export function EventPage({ id }: { id: string }) {
  const ev = useAllEvents().find((e) => e.id === id);
  const routes = routesRepo.useAll();
  const url = useMemo(() => (ev ? safeUrl(ev.registrationUrl) : null), [ev]);
  if (!ev) return <div className="mx-auto max-w-xl px-4 py-24 text-center"><h1 className="text-3xl font-bold">Événement introuvable</h1><Link href="/evenements" className="mt-6 inline-block font-semibold text-pine-700 underline">Retour au calendrier</Link></div>;
  const mine = ev.origin === "mine";
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/evenements" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Calendrier</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>{ev.origin === "demo" && <DemoBadge />}<h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{ev.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-600"><span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" />{new Date(ev.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span><span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{[ev.place, ev.region].filter(Boolean).join(", ")}</span></p>
          <p className="mt-1 text-sm text-ink-500">Organisé par {ev.organizer}</p></div>
        <div className="flex gap-2">
          {url && <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-11 items-center gap-2 rounded-xl bg-ember-500 px-5 font-semibold text-white hover:bg-ember-600"><ExternalLink className="size-4" />S'inscrire</a>}
          {mine && <Link href={manageHref(ev.id)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 font-semibold hover:bg-ink-50"><Settings className="size-4" />Gérer</Link>}
        </div>
      </header>
      {ev.description && <p className="mt-6 whitespace-pre-line text-ink-700">{ev.description}</p>}

      <section className="mt-8"><h2 className="text-xl font-bold">Courses</h2>
        {!ev.races.length ? <p className="mt-2 text-ink-500">Aucune course renseignée.</p> : (
          <div className="mt-3 grid gap-4">{ev.races.map((r) => { const rt = r.routeId ? routes.find((x) => x.id === r.routeId) : undefined; const posts = ev.posts.filter((p) => p.raceId === r.id && ["ravito", "eau", "controle"].includes(p.kind)); return (
            <article key={r.id} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">{r.label}</h3><Badge tone="pine">{SPORTS[r.sport].label}</Badge></div>
              <p className="mt-1 text-sm text-ink-700">{r.distanceKm} km · {r.gainM} m D+ · départ {r.startTime} · temps limite {r.maxHours} h{r.fee ? ` · ${r.fee}` : ""}</p>
              {rt && <div className="mt-3"><RouteMap coords={rt.coords} pois={rt.pois} className="h-64" /><Link href={routeHref(rt.id)} className="mt-1 inline-block text-sm font-semibold text-pine-700 underline">Voir la fiche et le profil du parcours</Link></div>}
              {posts.length > 0 && <ul className="mt-3 flex flex-wrap gap-2 text-xs">{posts.sort((a, b) => a.km - b.km).map((p) => <li key={p.id} className="rounded-full bg-ink-50 px-2.5 py-1">{POST_KINDS[p.kind].label} · km {p.km.toFixed(1)}{p.cutoffH != null ? ` · barrière ${p.cutoffH} h` : ""}</li>)}</ul>}
            </article>); })}</div>)}
      </section>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Informations pratiques</h2><p className="mt-2 whitespace-pre-line text-sm text-ink-700">{ev.practical || "Non renseignées."}</p></section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Règlement</h2><p className="mt-2 whitespace-pre-line text-sm text-ink-700">{ev.rules || "Non renseigné."}</p></section>
      </div>
    </div>
  );
}
