"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, FolderOpen, Globe, Lock, CalendarDays, User } from "lucide-react";
import { RouteCard } from "@/components/ui/route-card";
import { RoutesMap } from "@/components/library/routes-map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { collectionsRepo, eventsRepo } from "@/lib/repo";
import { useAllRoutes } from "@/lib/route-vm";
import { cloudEnabled } from "@/lib/cloud";
import { communityCollection, communityRoute, communityRoutesByIds, type CollectionData } from "@/lib/community";
import type { RouteVM } from "@/lib/route-model";
import { FORMATS, download, safeName, serialize } from "@/lib/formats";
import { makeZip } from "@/lib/zip";
import { eventHref, ownerHref } from "@/lib/url";
import { fmtKm, fmtM } from "@/lib/geo";

/** Tracé complet d'un parcours (les parcours publiés ne sont affichés qu'en version simplifiée dans les listes). */
async function fullRoute(v: RouteVM): Promise<RouteVM> { return v.origin === "community" ? (await communityRoute(v.id)) ?? v : v; }

export function CollectionPage({ id }: { id: string }) {
  const local = collectionsRepo.useAll().find((c) => c.id === id);
  const all = useAllRoutes();
  const [cloud, setCloud] = useState<CollectionData | null | undefined>(undefined);
  const [extra, setExtra] = useState<RouteVM[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!cloudEnabled || local || !id) return;
    let dead = false; communityCollection(id).then((d) => !dead && setCloud(d)).catch(() => !dead && setCloud(null));
    return () => { dead = true; };
  }, [id, local]);
  // parcours d'une collection locale absents de cet appareil (ex. publiés par d'autres) : récupérés dans la base
  useEffect(() => {
    if (!cloudEnabled || !local) return;
    const missing = local.routeIds.filter((rid) => !all.some((r) => r.id === rid));
    if (missing.length) communityRoutesByIds(missing).then(setExtra).catch(() => setExtra([]));
  }, [local, all]);

  const data = useMemo(() => {
    if (local) {
      const routes = local.routeIds.map((rid) => all.find((r) => r.id === rid) ?? extra.find((r) => r.id === rid)).filter((r): r is RouteVM => !!r);
      return { title: local.name, description: local.description, routes, eventId: local.eventId, ownerId: undefined as string | undefined, ownerName: "Vous", mine: true, vis: local.visibility ?? "prive" };
    }
    return cloud ? { title: cloud.title, description: cloud.description, routes: cloud.routes, eventId: cloud.eventId, ownerId: cloud.ownerId, ownerName: cloud.ownerName, mine: false, vis: "public" as const } : null;
  }, [local, all, extra, cloud]);

  if (!data) return <div className="mx-auto max-w-xl px-4 py-24 text-center">{cloudEnabled && !local && cloud === undefined && id ? <p className="text-ink-500">Chargement de la collection…</p> : <><h1 className="text-3xl font-bold">Collection introuvable</h1><p className="mt-2 text-ink-600">Elle n'existe pas sur cet appareil et n'a pas été publiée.</p><Link href="/communaute" className="mt-6 inline-block font-semibold text-pine-700 underline">Mes collections</Link></>}</div>;

  const ev = data.eventId ? eventsRepo.getAll().find((e) => e.id === data.eventId) : undefined;
  const km = data.routes.reduce((s, r) => s + r.stats.distanceM, 0);
  const zip = async () => {
    setBusy(true); setMsg(null);
    try {
      const full = await Promise.all(data.routes.map(fullRoute));
      download(`${safeName(data.title)}.zip`, await makeZip(full.map((r) => ({ name: `${safeName(r.name)}.gpx`, content: serialize("gpx", { name: r.name, description: r.description, coords: r.coords, pois: r.pois }) }))), "application/zip");
    } catch { setMsg("Téléchargement impossible pour le moment."); } finally { setBusy(false); }
  };
  const one = async (r: RouteVM) => { const f = await fullRoute(r); download(`${safeName(f.name)}.gpx`, serialize("gpx", { name: f.name, description: f.description, coords: f.coords, pois: f.pois }), FORMATS.gpx.mime); };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href={data.mine ? "/communaute#collections" : "/parcours"} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />{data.mine ? "Mes collections" : "Parcours"}</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex flex-wrap items-center gap-2"><Badge tone="pine"><FolderOpen className="size-3" />Collection</Badge>{data.mine && <Badge>{data.vis === "public" ? <><Globe className="size-3" />Publique</> : <><Lock className="size-3" />Privée</>}</Badge>}</div>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{data.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-ink-600"><span className="inline-flex items-center gap-1.5"><User className="size-4" />{data.ownerId ? <Link className="font-semibold text-pine-700 underline" href={ownerHref(data.ownerId)}>{data.ownerName}</Link> : data.ownerName}</span><span>{data.routes.length} parcours · {fmtKm(km)} cumulés · {fmtM(data.routes.reduce((s, r) => s + r.stats.gainM, 0))} D+</span>
            {ev && <Link href={eventHref(ev.id)} className="inline-flex items-center gap-1.5 font-semibold text-pine-700 underline"><CalendarDays className="size-4" />{ev.name}</Link>}</p></div>
        <Button variant="brand" disabled={busy || !data.routes.length} onClick={zip}><Download className="size-4" />{busy ? "Préparation…" : "Tout télécharger (ZIP de GPX)"}</Button>
      </header>
      {msg && <p role="alert" className="mt-3 text-sm text-danger">{msg}</p>}
      {data.description && <p className="mt-4 whitespace-pre-line text-ink-700">{data.description}</p>}
      {data.routes.length > 0 ? (<>
        <div className="mt-6"><RoutesMap routes={data.routes} /></div>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.routes.map((r) => (
          <li key={r.id} className="grid gap-2"><RouteCard route={r} /><Button size="sm" variant="secondary" onClick={() => one(r)}><Download className="size-4" />Télécharger le GPX</Button></li>))}</ul>
      </>) : <p className="mt-6 rounded-xl border border-dashed border-ink-200 p-8 text-center text-ink-500">Cette collection ne contient aucun parcours disponible{data.mine ? " pour l'instant." : " : l'organisateur ne les a pas encore publiés."}</p>}
    </div>
  );
}
