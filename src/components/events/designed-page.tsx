"use client";
import Link from "next/link";
import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, MapPin, CalendarDays, ExternalLink, Settings, Download, FolderOpen, Route as RouteIcon, TriangleAlert, Palette } from "lucide-react";
import { RouteMap } from "@/components/map/route-map";
import { POST_KINDS, type EventModel, type Race } from "@/lib/events";
import { SPORTS } from "@/lib/sports";
import type { RouteVM } from "@/lib/route-model";
import { FORMATS, type GpsFormat } from "@/lib/formats";
import { collectionHref, manageHref, routeHref } from "@/lib/url";
import { fmtDuration, fmtKm, fmtM } from "@/lib/geo";
import { poisOf, type PublicPoint, type RunnerMap } from "@/lib/public-map";
import type { Poi } from "@/lib/types";
import { BLOCKS, daysUntil, keyFacts, themeVars, type EventPageDesign, type PageBlock } from "@/lib/event-page";

/**
 * Page publique d'un événement personnalisée par son organisateur : bandeau, fond et couleurs propres, blocs dans l'ordre choisi.
 * `preview` : aperçu dans l'espace organisateur (cartes remplacées par un cadre, liens inactifs, blocs vides signalés).
 */
export interface DesignedProps {
  ev: EventModel; design: EventPageDesign; routeOf: (rid?: string) => RouteVM | null | undefined; url: string | null; collectionId?: string;
  canEdit: boolean; dl: (v: RouteVM, f: GpsFormat) => void; preview?: boolean; loadingRoutes?: boolean;
  /** carte des coureurs : points publics et carte importée (jamais les postes internes) */
  runner: RunnerMap;
}

export function DesignedEventPage({ ev, design, routeOf, url, collectionId, canEdit, dl, preview, loadingRoutes, runner }: DesignedProps) {
  const t = design.theme, v = themeVars(t);
  const style = { "--ev-bg": v.bg, "--ev-card": v.card, "--ev-ink": v.ink, "--ev-muted": v.muted, "--ev-line": v.line, "--ev-primary": v.primary, "--ev-on-primary": v.onPrimary, "--ev-accent": v.accent, "--ev-on-accent": v.onAccent, "--ev-link": v.link, background: v.bg, color: v.ink } as CSSProperties;
  const banner: CSSProperties = t.banner === "image" && t.bannerImage
    ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,.62)), url(${t.bannerImage})`, backgroundSize: "cover", backgroundPosition: `center ${t.bannerFocus ?? 50}%`, color: "#ffffff" }
    : t.banner === "uni" ? { background: t.primary, color: v.onPrimary } : { background: `linear-gradient(130deg, ${t.primary} 0%, ${t.primary} 35%, ${t.accent} 100%)`, color: "#ffffff", textShadow: "0 1px 12px rgba(0,0,0,.35)" };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ev.date) ? new Date(ev.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date à préciser";
  const A = ({ href, children, className, ext, style: st }: LinkProps) => preview ? <span className={className} style={st}>{children}</span> : ext ? <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className} style={st}>{children}</a> : <Link href={href} className={className} style={st}>{children}</Link>;
  const cta = "inline-flex h-11 items-center gap-2 rounded-xl px-5 font-semibold shadow-sm transition hover:brightness-110";
  // la carte importée s'affiche d'elle-même avant les cartes des parcours si la page n'a pas de bloc « Carte des coureurs »
  const all = runner.image && !design.blocks.some((b) => b.kind === "plan") ? design.blocks.flatMap((b) => (b.kind === "cartes" ? [{ id: "auto-plan", kind: "plan" as const }, b] : [b])) : design.blocks;
  const blocks = all.filter((b) => !b.hidden);

  return (
    <div style={style} className={clsx("@container", preview ? "min-h-full" : "min-h-screen")} data-event-page="custom" data-theme-bg={t.background}>
      <header style={banner} className="relative">
        <div className={preview ? "px-5 pb-8 pt-5" : "mx-auto max-w-5xl px-4 pb-12 pt-6 sm:px-6 sm:pb-16"}>
          {!preview && <Link href="/evenements" className="inline-flex items-center gap-1.5 text-sm opacity-85 hover:opacity-100"><ArrowLeft className="size-4" />Calendrier</Link>}
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold leading-tight @xl:text-5xl" style={{ overflowWrap: "anywhere" }}>{ev.name}</h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 opacity-95"><span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" />{date}</span>{(ev.place || ev.region) && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" />{[ev.place, ev.region].filter(Boolean).join(", ")}</span>}</p>
              {ev.organizer && <p className="mt-1 text-sm opacity-85">Organisé par {ev.organizer}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {url && <A href={url} ext className={`ev-cta ${cta}`}><ExternalLink className="size-4" />S&apos;inscrire</A>}
              {canEdit && !preview && <><Link href={`${manageHref(ev.id)}#rubrique-page`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/90 px-4 font-semibold text-ink-900 hover:bg-white"><Palette className="size-4" />Personnaliser</Link><Link href={manageHref(ev.id)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/90 px-4 font-semibold text-ink-900 hover:bg-white"><Settings className="size-4" />Gérer</Link></>}
            </div>
          </div>
        </div>
      </header>
      <style>{`[data-event-page="custom"] .ev-cta{background:var(--ev-accent);color:var(--ev-on-accent)}`}</style>
      <main className={preview ? "grid gap-4 p-4" : "mx-auto grid max-w-5xl gap-5 px-4 py-8 sm:px-6"}>
        {blocks.map((b) => <Block key={b.id} b={b} ev={ev} runner={runner} routeOf={routeOf} url={url} collectionId={collectionId} canEdit={canEdit} dl={dl} preview={preview} loadingRoutes={loadingRoutes} A={A} />)}
        {!blocks.length && <p className="rounded-2xl p-6 text-center" style={{ background: "var(--ev-card)", color: "var(--ev-muted)" }}>Aucun bloc affiché.</p>}
      </main>
    </div>
  );
}

type LinkProps = { href: string; children: ReactNode; className?: string; ext?: boolean; style?: CSSProperties };
const card: CSSProperties = { background: "var(--ev-card)", borderColor: "var(--ev-line)" };
function Section({ title, children, id }: { title?: string; children: ReactNode; id?: string }) {
  return <section id={id} className="scroll-mt-24 rounded-2xl border p-5 @md:p-6" style={card}>{title && <h2 className="mb-3 text-xl font-bold" style={{ color: "var(--ev-ink)" }}><span className="mr-2 inline-block h-5 w-1.5 rounded-full align-[-3px]" style={{ background: "var(--ev-primary)" }} />{title}</h2>}{children}</section>;
}
const Empty = ({ what }: { what: string }) => <p className="text-sm italic" style={{ color: "var(--ev-muted)" }}>{what} — à compléter dans l&apos;espace organisateur (bloc masqué sur la page publique tant qu&apos;il est vide).</p>;

function Block({ b, ev, runner, routeOf, url, collectionId, canEdit, dl, preview, loadingRoutes, A }: { b: PageBlock; ev: EventModel; runner: RunnerMap; routeOf: DesignedProps["routeOf"]; url: string | null; collectionId?: string; canEdit: boolean; dl: DesignedProps["dl"]; preview?: boolean; loadingRoutes?: boolean; A: (p: LinkProps) => ReactNode }) {
  const title = b.title?.trim() || BLOCKS[b.kind].label;
  const text = (s: string) => <p className="whitespace-pre-line leading-relaxed" style={{ color: "var(--ev-ink)" }}>{s}</p>;
  switch (b.kind) {
    case "presentation": return ev.description.trim() ? <Section title={b.title?.trim() || undefined}>{text(ev.description)}</Section> : preview ? <Section title={title}><Empty what="Présentation vide" /></Section> : null;
    case "pratique": return ev.practical.trim() ? <Section title={title}>{text(ev.practical)}</Section> : preview ? <Section title={title}><Empty what="Informations pratiques vides" /></Section> : null;
    case "reglement": return ev.rules.trim() ? <Section title={title}>{text(ev.rules)}</Section> : preview ? <Section title={title}><Empty what="Règlement vide" /></Section> : null;
    case "texte": return b.text?.trim() || preview ? <Section title={b.title?.trim() || undefined}>{b.text?.trim() ? text(b.text) : <Empty what="Bloc de texte vide" />}</Section> : null;
    case "chiffres": {
      const k = keyFacts(ev), d = daysUntil(ev.date);
      const items = [[String(k.courses), k.courses > 1 ? "courses" : "course"], k.distances && [k.distances, "distances"], k.gain && [k.gain, "dénivelé maximal"], d != null && d >= 0 && [d === 0 ? "Aujourd'hui" : `J−${d}`, "avant le départ"], ev.place && [ev.place, "lieu"]].filter(Boolean) as [string, string][];
      return <section aria-label={title} className="grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-5">{items.map(([v, l]) => <div key={l} className="rounded-2xl p-4" style={{ background: "var(--ev-primary)", color: "var(--ev-on-primary)" }}><p className="text-xl font-extrabold leading-tight @md:text-2xl" style={{ overflowWrap: "anywhere" }}>{v}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-85">{l}</p></div>)}</section>;
    }
    case "compte": {
      const d = daysUntil(ev.date); if (d == null) return preview ? <Section title={title}><Empty what="Date de l'événement manquante" /></Section> : null;
      return <section aria-label={title} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6" style={{ background: "var(--ev-accent)", color: "var(--ev-on-accent)" }}>
        <div><p className="text-xs font-bold uppercase tracking-widest opacity-80">{title}</p><p className="mt-1 text-4xl font-extrabold @xl:text-5xl">{d > 1 ? `${d} jours` : d === 1 ? "Demain" : d === 0 ? "C'est aujourd'hui" : "Édition terminée"}</p></div>
        {d > 0 && <p className="text-sm font-semibold opacity-90">{d > 1 ? "avant le départ" : "Rendez-vous sur la ligne"}</p>}</section>;
    }
    case "inscription": return (
      <section aria-label={title} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-6" style={{ background: "var(--ev-primary)", color: "var(--ev-on-primary)" }}>
        <div className="min-w-0"><p className="text-xl font-bold">{title}</p><p className="mt-1 text-sm opacity-90">{b.text?.trim() || (url ? "Réservez votre dossard en ligne." : "Les inscriptions ouvriront prochainement.")}</p></div>
        {url && <A href={url} ext className="ev-cta inline-flex h-11 items-center gap-2 rounded-xl px-5 font-semibold"><ExternalLink className="size-4" />S&apos;inscrire</A>}
      </section>);
    case "courses": return ev.races.length ? <Section title={title}>
      {collectionId && <p className="-mt-1 mb-3"><A href={collectionHref(collectionId)} className="inline-flex items-center gap-1.5 text-sm font-semibold underline" style={{ color: "var(--ev-link)" }}><FolderOpen className="size-4" />Tous les parcours de l&apos;événement</A></p>}
      <ul className="grid gap-2">{ev.races.map((r) => { const v = routeOf(r.routeId); return (
        <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3" style={{ borderColor: "var(--ev-line)" }}>
          <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: "var(--ev-accent)" }} />
          <div className="min-w-[11rem] flex-1"><p className="font-semibold">{r.label}</p><p className="text-sm" style={{ color: "var(--ev-muted)" }}>{r.distanceKm} km · {r.gainM} m D+ · départ {r.startTime}</p></div>
          {v ? <><A href={`#course-${r.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold" style={{ background: "var(--ev-primary)", color: "var(--ev-on-primary)" }}><RouteIcon className="size-4" />Voir le tracé</A><button type="button" disabled={preview} onClick={() => dl(v, "gpx")} className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold" style={{ borderColor: "var(--ev-line)" }}><Download className="size-4" />GPX</button></> : <span className="text-xs" style={{ color: "var(--ev-muted)" }}>{loadingRoutes && r.routeId ? "Chargement du tracé…" : "Tracé non disponible"}</span>}
        </li>); })}</ul></Section> : preview ? <Section title={title}><Empty what="Aucune course" /></Section> : null;
    case "plan": return runner.image ? <Section title={title}><a href={preview ? undefined : runner.image} target="_blank" rel="noopener" data-runner-map-image><img src={runner.image} alt={runner.caption || "Carte de l'événement"} className="w-full rounded-xl" /></a>{runner.caption && <p className="mt-2 text-sm" style={{ color: "var(--ev-muted)" }}>{runner.caption}</p>}</Section> : preview ? <Section title={title}><Empty what="Aucune carte importée (Logistique › Carte des coureurs)" /></Section> : null;
    case "cartes": return ev.races.length ? <div className="grid gap-4">{ev.races.map((r) => <RaceCard key={r.id} race={r} route={routeOf(r.routeId)} canEdit={canEdit} eventId={ev.id} points={runner.points.filter((p) => p.raceId === r.id)} pois={poisOf(runner, r.id)} interactive={runner.interactive} dl={dl} preview={preview} loading={loadingRoutes} A={A} />)}</div> : null;
  }
}

function RaceCard({ race: r, route: v, canEdit, eventId, points, pois, interactive, dl, preview, loading, A }: { race: Race; route: RouteVM | null | undefined; canEdit: boolean; eventId: string; points: PublicPoint[]; pois: Poi[]; interactive: boolean; dl: (v: RouteVM, f: GpsFormat) => void; preview?: boolean; loading?: boolean; A: (p: LinkProps) => ReactNode }) {
  return (
    <article id={`course-${r.id}`} className="scroll-mt-24 rounded-2xl border p-5" style={card}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold">{r.label}</h3><span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "var(--ev-accent)", color: "var(--ev-on-accent)" }}>{SPORTS[r.sport].label}</span></div>
      <p className="mt-1 text-sm" style={{ color: "var(--ev-muted)" }}>{r.distanceKm} km · {r.gainM} m D+ · départ {r.startTime} · temps limite {r.maxHours} h{r.fee ? ` · ${r.fee}` : ""}</p>
      {v ? (
        <div className="mt-3">
          {!interactive ? null : preview ? <div className="grid h-40 place-items-center rounded-xl border border-dashed text-sm" style={{ borderColor: "var(--ev-line)", color: "var(--ev-muted)" }}>Carte du parcours « {v.name} » · {pois.length} point(s) pour les coureurs</div> : <RouteMap coords={v.coords} pois={pois} className="h-72" title={`${r.label} — ${v.name}`} />}
          <p className="mt-2 text-sm">Tracé mesuré : <b>{fmtKm(v.stats.distanceM)}</b> · D+ <b>{fmtM(v.stats.gainM)}</b> · D− <b>{fmtM(v.stats.lossM)}</b> · durée estimée {fmtDuration(v.durationMin)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><A href={routeHref(v.id)} className="text-sm font-semibold underline" style={{ color: "var(--ev-link)" }}>Fiche complète et profil altimétrique</A>
            {(Object.keys(FORMATS) as GpsFormat[]).map((f) => <button key={f} type="button" disabled={preview} onClick={() => dl(v, f)} className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold" style={{ borderColor: "var(--ev-line)" }}><Download className="size-3.5" />{FORMATS[f].label}</button>)}</div>
        </div>
      ) : (
        <p className="mt-3 flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: "var(--ev-bg)", color: "var(--ev-muted)" }}><TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {!r.routeId ? (canEdit ? <>Aucun tracé lié. <A href={manageHref(eventId)} className="font-semibold underline" style={{ color: "var(--ev-link)" }}>Liez un parcours</A>.</> : "Aucun tracé associé à cette course.") : loading ? "Chargement du tracé…" : canEdit ? "Parcours lié introuvable sur cet appareil." : "Tracé non publié par l'organisateur."}</p>
      )}
      {points.length > 0 && <ul className="mt-3 flex flex-wrap gap-2 text-xs" data-runner-points>{[...points].sort((a, b) => a.km - b.km).map((p) => <li key={p.id} className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--ev-line)" }}>{POST_KINDS[p.kind].label}{p.km ? ` · km ${p.km.toFixed(1)}` : ""}{p.cutoffH != null ? ` · barrière ${p.cutoffH} h` : ""}</li>)}</ul>}
    </article>
  );
}
