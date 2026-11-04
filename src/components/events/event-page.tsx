"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPin, CalendarDays, ExternalLink, Settings, Download, FolderOpen, Route as RouteIcon, TriangleAlert } from "lucide-react";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RouteMap } from "@/components/map/route-map";
import { useAllEvents, collectionsRepo } from "@/lib/repo";
import { useAllRoutes } from "@/lib/route-vm";
import { POST_KINDS, type EventModel, type Race } from "@/lib/events";
import { SPORTS } from "@/lib/sports";
import { cloudEnabled } from "@/lib/cloud";
import { communityEvent, communityRoute } from "@/lib/community";
import type { RouteVM } from "@/lib/route-model";
import { FORMATS, download, safeName, serialize, type GpsFormat } from "@/lib/formats";
import { collectionHref, manageHref, ownerHref, routeHref } from "@/lib/url";
import { fmtDuration, fmtKm, fmtM } from "@/lib/geo";

const safeUrl = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };

export function EventPage({ id }: { id: string }) {
  const local = useAllEvents().find((e) => e.id === id);
  const [cloudEv, setCloudEv] = useState<EventModel | null | undefined>(undefined);
  useEffect(() => {
    if (!cloudEnabled || local || !id) return;
    let dead = false; communityEvent(id).then((e) => !dead && setCloudEv(e)).catch(() => !dead && setCloudEv(null));
    return () => { dead = true; };
  }, [id, local]);
  const ev = local ?? cloudEv ?? undefined;

  // Tracés : parcours enregistrés ou de démonstration, sinon parcours publiés par l'organisateur (base de données)
  const all = useAllRoutes();
  const [fetched, setFetched] = useState<Record<string, RouteVM | null>>({});
  useEffect(() => {
    if (!cloudEnabled || !ev) return;
    const missing = ev.races.map((r) => r.routeId).filter((x): x is string => !!x && !all.some((v) => v.id === x) && !(x in fetched));
    for (const rid of new Set(missing)) communityRoute(rid).then((v) => setFetched((m) => ({ ...m, [rid]: v }))).catch(() => setFetched((m) => ({ ...m, [rid]: null })));
  }, [ev, all, fetched]);
  const routeOf = (rid?: string): RouteVM | null | undefined => (rid ? all.find((v) => v.id === rid) ?? fetched[rid] : null);
  const url = useMemo(() => (ev ? safeUrl(ev.registrationUrl) : null), [ev]);
  const collection = ev?.collectionId ? collectionsRepo.getAll().find((c) => c.id === ev.collectionId) : undefined;

  if (!ev) return <div className="mx-auto max-w-xl px-4 py-24 text-center">{cloudEnabled && !local && cloudEv === undefined && id ? <p className="text-ink-500">Chargement de l'événement…</p> : <><h1 className="text-3xl font-bold">Événement introuvable</h1><p className="mt-2 text-ink-600">Il n'existe pas sur cet appareil et n'a pas été publié.</p><Link href="/evenements" className="mt-6 inline-block font-semibold text-pine-700 underline">Retour au calendrier</Link></>}</div>;

  const mine = ev.origin === "mine";
  const dl = (v: RouteVM, f: GpsFormat) => download(`${safeName(v.name)}.${FORMATS[f].ext}`, serialize(f, { name: v.name, description: v.description, coords: v.coords, pois: v.pois }), FORMATS[f].mime);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/evenements" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />Calendrier</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>{ev.origin === "demo" && <DemoBadge />}{ev.origin === "community" && <Badge tone="glacier">Publié par un organisateur</Badge>}
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{ev.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-600"><span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" />{new Date(ev.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span><span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{[ev.place, ev.region].filter(Boolean).join(", ")}</span></p>
          <p className="mt-1 text-sm text-ink-500">Organisé par {ev.ownerId ? <Link className="font-semibold text-pine-700 underline" href={ownerHref(ev.ownerId)}>{ev.organizer}</Link> : ev.organizer}</p></div>
        <div className="flex flex-wrap gap-2">
          {url && <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-11 items-center gap-2 rounded-xl bg-ember-500 px-5 font-semibold text-white hover:bg-ember-600"><ExternalLink className="size-4" />S'inscrire</a>}
          {mine && <Link href={manageHref(ev.id)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 font-semibold hover:bg-ink-50"><Settings className="size-4" />Gérer</Link>}
        </div>
      </header>
      {ev.description && <p className="mt-6 whitespace-pre-line text-ink-700">{ev.description}</p>}

      {ev.races.length > 0 && (
        <section className="mt-8" aria-label="Tracés de l'événement">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Tracés</h2>
            {collection && <Link href={collectionHref(collection.id)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-pine-700 underline"><FolderOpen className="size-4" />Tous les parcours de l'événement</Link>}
            {!collection && ev.collectionId && <Link href={collectionHref(ev.collectionId)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-pine-700 underline"><FolderOpen className="size-4" />Tous les parcours de l'événement</Link>}</div>
          <ul className="mt-3 grid gap-2">{ev.races.map((r) => { const v = routeOf(r.routeId); return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-100">
              <div className="min-w-0 flex-1"><p className="font-semibold">{r.label}</p><p className="text-sm text-ink-500">{r.distanceKm} km · {r.gainM} m D+ · départ {r.startTime}</p></div>
              {v ? <><a href={`#course-${r.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-pine-600 px-4 text-sm font-semibold text-white hover:bg-pine-700"><RouteIcon className="size-4" />Voir le tracé</a><Button size="sm" variant="secondary" onClick={() => dl(v, "gpx")}><Download className="size-4" />GPX</Button></> : <span className="text-xs text-ink-500">{r.routeId && v === undefined && cloudEnabled ? "Chargement du tracé…" : "Tracé non disponible"}</span>}
            </li>); })}</ul>
        </section>
      )}

      <div className="mt-6 grid gap-4">{ev.races.map((r) => <RaceCard key={r.id} race={r} route={routeOf(r.routeId)} mine={mine} eventId={ev.id} posts={ev.posts.filter((p) => p.raceId === r.id && ["ravito", "eau", "controle"].includes(p.kind))} dl={dl} />)}</div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Informations pratiques</h2><p className="mt-2 whitespace-pre-line text-sm text-ink-700">{ev.practical || "Non renseignées."}</p></section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="text-lg font-bold">Règlement</h2><p className="mt-2 whitespace-pre-line text-sm text-ink-700">{ev.rules || "Non renseigné."}</p></section>
      </div>
    </div>
  );
}

function RaceCard({ race: r, route: v, mine, eventId, posts, dl }: { race: Race; route: RouteVM | null | undefined; mine: boolean; eventId: string; posts: EventModel["posts"]; dl: (v: RouteVM, f: GpsFormat) => void }) {
  return (
    <article id={`course-${r.id}`} className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-ink-100">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">{r.label}</h3><Badge tone="pine">{SPORTS[r.sport].label}</Badge></div>
      <p className="mt-1 text-sm text-ink-700">{r.distanceKm} km · {r.gainM} m D+ · départ {r.startTime} · temps limite {r.maxHours} h{r.fee ? ` · ${r.fee}` : ""}</p>
      {v ? (
        <div className="mt-3">
          <RouteMap coords={v.coords} pois={v.pois} className="h-72" title={`${r.label} — ${v.name}`} />
          <p className="mt-2 text-sm text-ink-600">Tracé mesuré : <b>{fmtKm(v.stats.distanceM)}</b> · D+ <b>{fmtM(v.stats.gainM)}</b> · D− <b>{fmtM(v.stats.lossM)}</b> · durée estimée {fmtDuration(v.durationMin)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><Link href={routeHref(v.id)} className="text-sm font-semibold text-pine-700 underline">Fiche complète et profil altimétrique</Link>
            {(Object.keys(FORMATS) as GpsFormat[]).map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => dl(v, f)}><Download className="size-3.5" />{FORMATS[f].label}</Button>)}</div>
        </div>
      ) : (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-ink-50 p-3 text-sm text-ink-600"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          {!r.routeId ? (mine ? <>Aucun tracé n'est lié à cette course. <Link className="font-semibold text-pine-700 underline" href={manageHref(eventId)}>Liez un parcours dans l'espace organisateur</Link>.</> : "Aucun tracé n'a été associé à cette course.")
            : v === undefined && cloudEnabled ? "Chargement du tracé…" : mine ? "Le parcours lié est introuvable sur cet appareil (supprimé ?)." : "L'organisateur n'a pas publié ce tracé."}</p>
      )}
      {posts.length > 0 && <ul className="mt-3 flex flex-wrap gap-2 text-xs">{[...posts].sort((a, b) => a.km - b.km).map((p) => <li key={p.id} className="rounded-full bg-ink-50 px-2.5 py-1">{POST_KINDS[p.kind].label} · km {p.km.toFixed(1)}{p.cutoffH != null ? ` · barrière ${p.cutoffH} h` : ""}</li>)}</ul>}
    </article>
  );
}
