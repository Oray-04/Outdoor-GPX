"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, FolderOpen, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { collectionsRepo, eventsRepo, useProfile } from "@/lib/repo";
import { cloudEnabled } from "@/lib/cloud";
import { communityOwner, type OwnerPage as OwnerData } from "@/lib/community";
import { collectionHref, eventHref } from "@/lib/url";

/** Page publique d'un organisateur : ses collections de parcours et ses événements. `id="me"` : aperçu local de ma propre page. */
export function OwnerPageView({ id }: { id: string }) {
  const profile = useProfile();
  const myCols = collectionsRepo.useAll(), myEvents = eventsRepo.useAll();
  const [cloud, setCloud] = useState<OwnerData | null | undefined>(undefined);
  useEffect(() => {
    if (!cloudEnabled || id === "me" || !id) return;
    let dead = false; communityOwner(id).then((d) => !dead && setCloud(d)).catch(() => !dead && setCloud(null));
    return () => { dead = true; };
  }, [id]);
  const data = useMemo<OwnerData | null>(() => {
    if (id === "me") return { id: "me", name: profile.name || "Mon organisation", bio: profile.bio, collections: myCols.filter((c) => c.visibility === "public").map((c) => ({ id: c.id, title: c.name, description: c.description, count: c.routeIds.length })), events: myEvents.filter((e) => e.origin === "mine" && e.visibility === "public") };
    return cloud ?? null;
  }, [id, profile, myCols, myEvents, cloud]);

  if (!data) return <div className="mx-auto max-w-xl px-4 py-24 text-center">{cloudEnabled && id !== "me" && cloud === undefined ? <p className="text-ink-500">Chargement…</p> : <><h1 className="text-3xl font-bold">Page introuvable</h1><p className="mt-2 text-ink-600">Cet organisateur n'existe pas ou n'a rien publié.</p></>}</div>;
  const preview = id === "me";
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link href={preview ? "/organisateurs" : "/evenements"} className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft className="size-4" />{preview ? "Espace organisateurs" : "Calendrier"}</Link>
      <header className="mt-3"><div className="flex items-center gap-3"><span className="grid size-14 place-items-center rounded-full bg-pine-100 text-pine-700"><User className="size-7" /></span><div><h1 className="text-3xl font-extrabold">{data.name}</h1>{preview && <Badge tone="ember">Aperçu : {cloudEnabled ? "visible de tous une fois synchronisé" : "visible de tous quand les comptes seront activés"}</Badge>}</div></div>
        {data.bio && <p className="mt-3 whitespace-pre-line text-ink-700">{data.bio}</p>}</header>
      <section className="mt-8"><h2 className="flex items-center gap-2 text-xl font-bold"><FolderOpen className="size-5 text-pine-600" />Collections de parcours</h2>
        {data.collections.length ? <ul className="mt-3 grid gap-3 sm:grid-cols-2">{data.collections.map((c) => <li key={c.id}><Link href={collectionHref(c.id)} className="block rounded-2xl bg-white p-4 ring-1 ring-ink-100 transition hover:-translate-y-0.5 hover:shadow-card"><p className="font-semibold">{c.title}</p><p className="mt-0.5 line-clamp-2 text-sm text-ink-500">{c.description || "—"}</p><p className="mt-2 text-xs font-medium text-pine-700">{c.count} parcours</p></Link></li>)}</ul> : <p className="mt-2 text-sm text-ink-500">Aucune collection publique.</p>}</section>
      <section className="mt-8"><h2 className="flex items-center gap-2 text-xl font-bold"><CalendarDays className="size-5 text-pine-600" />Événements</h2>
        {data.events.length ? <ul className="mt-3 grid gap-3">{data.events.map((e) => <li key={e.id}><Link href={eventHref(e.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-4 ring-1 ring-ink-100 hover:shadow-card"><span><span className="font-semibold">{e.name}</span><span className="block text-sm text-ink-500">{[e.place, e.region].filter(Boolean).join(" · ")}</span></span><span className="text-sm font-medium">{new Date(e.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span></Link></li>)}</ul> : <p className="mt-2 text-sm text-ink-500">Aucun événement publié.</p>}</section>
    </div>
  );
}
