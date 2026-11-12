"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Trash2, Download, Footprints, FileText, Users } from "lucide-react";
import { RouteCard } from "@/components/ui/route-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProfileForm, MonthlyChart, activityTotals, fmtAct } from "./shared";
import { CloudCard } from "./cloud-card";
import { useAllRoutes, useVerified } from "@/lib/route-vm";
import { activitiesRepo, collectionsRepo, eventsRepo, useFavorites, useProfile } from "@/lib/repo";
import { SPORTS } from "@/lib/sports";
import { serialize, download, safeName } from "@/lib/formats";
import { fmtKm, fmtM } from "@/lib/geo";
import { manageHref } from "@/lib/url";

const Section = ({ id, title, children, action }: { id: string; title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section id={id} className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-ink-100"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-xl font-bold">{title}</h2>{action}</div>{children}</section>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl border border-dashed border-ink-200 p-5 text-sm text-ink-500">{children}</p>;
const fmtDur = (s: number) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;

export function Account() {
  const routes = useAllRoutes();
  const verified = useVerified();
  const favs = useFavorites();
  const acts = activitiesRepo.useAll();
  const cols = collectionsRepo.useAll();
  const events = eventsRepo.useAll();
  const profile = useProfile();
  const mine = routes.filter((r) => r.origin === "mine");
  const priv = mine.filter((r) => r.visibility === "prive");
  const favRoutes = routes.filter((r) => favs.includes(r.id));
  const tot = useMemo(() => activityTotals(acts), [acts]);
  const bySport = useMemo(() => { const m = new Map<string, number>(); acts.forEach((a) => m.set(a.sport, (m.get(a.sport) ?? 0) + a.distanceM)); return [...m].sort((a, b) => b[1] - a[1]); }, [acts]);

  const exportAct = (id: string) => { const a = acts.find((x) => x.id === id); if (a) download(`${safeName(a.name)}.gpx`, serialize("gpx", { name: a.name, coords: a.coords.map((c) => [c[0], c[1], c[2]]), pois: [] }), "application/gpx+xml"); };
  const nav = [["parcours", "Parcours"], ["favoris", "Favoris"], ["prives", "Privés"], ["activites", "Activités"], ["stats", "Statistiques"], ["fichiers", "Fichiers"], ["collections", "Collections"], ["evenements", "Événements"]];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">{profile.name ? `Bonjour ${profile.name}` : "Mon espace"}</h1>
      <p className="mt-2 text-ink-600">Vos données sont enregistrées sur cet appareil (navigateur). Pensez à exporter vos parcours importants.</p>
      <nav aria-label="Sections" className="sticky top-16 z-20 -mx-4 mt-4 flex gap-1 overflow-x-auto bg-paper/90 px-4 py-2 backdrop-blur">{nav.map(([id, l]) => <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium hover:border-pine-400">{l}</a>)}</nav>
      <div className="mt-4 grid gap-6">
        <Section id="compte" title="Compte et synchronisation"><CloudCard /></Section>
        <Section id="profil" title="Profil"><ProfileForm /></Section>
        <Section id="parcours" title={`Mes parcours (${mine.length})`} action={<Link href="/creer" className="inline-flex min-h-9 items-center rounded-lg px-2 text-sm font-semibold text-pine-700 underline hover:bg-pine-50">Créer</Link>}>
          {mine.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{mine.map((r) => <RouteCard key={r.id} route={r} verified={verified.includes(r.id)} />)}</div> : <Empty>Aucun parcours. <Link className="font-semibold text-pine-700 underline" href="/creer">Créez-en un</Link> ou <Link className="font-semibold text-pine-700 underline" href="/fichiers">importez un fichier</Link>.</Empty>}</Section>
        <Section id="favoris" title={`Mes favoris (${favRoutes.length})`}>{favRoutes.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{favRoutes.map((r) => <RouteCard key={r.id} route={r} />)}</div> : <Empty>Ajoutez un parcours en favori depuis sa fiche.</Empty>}</Section>
        <Section id="prives" title={`Mes itinéraires privés (${priv.length})`}>{priv.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{priv.map((r) => <RouteCard key={r.id} route={r} />)}</div> : <Empty>Aucun itinéraire privé.</Empty>}</Section>
        <Section id="activites" title={`Mes activités (${acts.length})`}>
          {acts.length ? <ul className="grid gap-2">{[...acts].sort((a, b) => b.startedAt - a.startedAt).map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-50 p-3"><div className="min-w-0 flex-1"><p className="font-semibold">{a.name}</p><p className="text-xs text-ink-500">{new Date(a.startedAt).toLocaleDateString("fr-FR")} · {SPORTS[a.sport as keyof typeof SPORTS]?.label ?? a.sport} · {fmtAct(a)} · {fmtDur(a.durationS)}</p></div><Button size="sm" variant="ghost" onClick={() => exportAct(a.id)} aria-label="Exporter en GPX"><Download className="size-4" />GPX</Button><Button size="sm" variant="ghost" aria-label="Supprimer l'activité" onClick={() => confirm("Supprimer cette activité ?") && activitiesRepo.remove(a.id)}><Trash2 className="size-4" /></Button></li>)}</ul> : <Empty>Aucune activité enregistrée. Utilisez le <Link className="font-semibold text-pine-700 underline" href="/suivi">suivi GPS</Link> pendant une sortie.</Empty>}</Section>
        <Section id="stats" title="Mes statistiques">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Sorties", String(tot.n)], ["Distance", fmtKm(tot.km)], ["Dénivelé +", fmtM(tot.gain)], ["Temps", fmtDur(tot.s)]].map(([l, v]) => <div key={l} className="rounded-xl bg-ink-50 p-3"><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{l}</dt><dd className="font-display text-xl font-bold">{v}</dd></div>)}</dl>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><div><p className="mb-1 text-sm font-semibold">Kilomètres par mois</p><MonthlyChart acts={acts} /></div>
            <div><p className="mb-2 text-sm font-semibold">Par discipline</p>{bySport.length ? <ul className="grid gap-1.5 text-sm">{bySport.map(([s, m]) => <li key={s} className="flex justify-between"><span>{SPORTS[s as keyof typeof SPORTS]?.label ?? s}</span><b>{fmtKm(m)}</b></li>)}</ul> : <p className="text-sm text-ink-500">Pas encore de données.</p>}</div></div></Section>
        <Section id="fichiers" title="Mes fichiers GPS" action={<Link href="/fichiers" className="text-sm font-semibold text-pine-700 underline">Gérer</Link>}><p className="flex items-center gap-2 text-sm text-ink-600"><FileText className="size-4" />{mine.length} parcours enregistré(s) ({mine.filter((r) => r.coords.length).length} avec tracé) : import, conversion et export GPX, KML, GeoJSON, TCX.</p></Section>
        <Section id="collections" title={`Mes collections (${cols.length})`} action={<Link href="/collections#collections" className="text-sm font-semibold text-pine-700 underline">Gérer</Link>}>{cols.length ? <ul className="grid gap-2 sm:grid-cols-2">{cols.map((c) => <li key={c.id} className="rounded-xl bg-ink-50 p-3"><p className="font-semibold">{c.name}</p><p className="text-xs text-ink-500">{c.routeIds.length} parcours</p></li>)}</ul> : <Empty>Aucune collection.</Empty>}</Section>
        <Section id="evenements" title={`Mes événements (${events.filter((e) => e.origin === "mine").length})`} action={<Link href="/organisateurs" className="text-sm font-semibold text-pine-700 underline">Espace organisateurs</Link>}>{events.some((e) => e.origin === "mine") ? <ul className="grid gap-2">{events.filter((e) => e.origin === "mine").map((e) => <li key={e.id}><Link href={manageHref(e.id)} className="block rounded-xl bg-ink-50 p-3 font-semibold hover:bg-ink-100">{e.name} <span className="text-sm font-normal text-ink-500">· {e.date}</span></Link></li>)}</ul> : <Empty>Aucun événement organisé.</Empty>}</Section>
      </div>
    </div>
  );
}
