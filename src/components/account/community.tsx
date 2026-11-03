"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Trophy, Target, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProfileForm, Progress, monthKey } from "./shared";
import { useAllRoutes } from "@/lib/route-vm";
import { activitiesRepo, collectionsRepo, reviewsRepo, useFavorites, useProfile } from "@/lib/repo";
import { SPORTS } from "@/lib/sports";
import { fmtKm, fmtM } from "@/lib/geo";
import { uid } from "@/lib/types";

export function Community() {
  const routes = useAllRoutes();
  const acts = activitiesRepo.useAll();
  const cols = collectionsRepo.useAll();
  const reviews = reviewsRepo.useAll();
  const favs = useFavorites();
  const profile = useProfile();
  const [name, setName] = useState("");
  const mine = routes.filter((r) => r.origin === "mine");
  const thisMonth = monthKey(Date.now());
  const month = useMemo(() => acts.filter((a) => monthKey(a.startedAt) === thisMonth), [acts, thisMonth]);
  const km = month.reduce((s, a) => s + a.distanceM, 0) / 1000;
  const gain = month.reduce((s, a) => s + a.gainM, 0);

  const challenges = [
    { l: "Objectif kilométrique du mois", v: km, g: profile.goalKmMonth || 100, u: "km" },
    { l: "1 000 m de dénivelé positif ce mois", v: gain, g: 1000, u: "m" },
    { l: "8 sorties ce mois", v: month.length, g: 8, u: "sorties" },
    { l: "Créer 5 parcours", v: mine.length, g: 5, u: "parcours" },
    { l: "Noter 3 parcours", v: reviews.length, g: 3, u: "avis" },
  ];
  const longest = [...acts].sort((a, b) => b.distanceM - a.distanceM)[0];
  const climb = [...acts].sort((a, b) => b.gainM - a.gainM)[0];
  const speeds = Object.keys(SPORTS).map((s) => { const best = acts.filter((a) => a.sport === s && a.durationS > 300).map((a) => ({ a, v: a.distanceM / 1000 / (a.durationS / 3600) })).sort((x, y) => y.v - x.v)[0]; return best ? { s, ...best } : null; }).filter(Boolean) as { s: string; a: (typeof acts)[number]; v: number }[];

  const add = (e: React.FormEvent) => { e.preventDefault(); if (!name.trim()) return; collectionsRepo.upsert({ id: uid(), name: name.trim(), description: "", routeIds: [] }); setName(""); };
  const toggle = (cid: string, rid: string) => { const c = collectionsRepo.get(cid); if (c) collectionsRepo.upsert({ ...c, routeIds: c.routeIds.includes(rid) ? c.routeIds.filter((x) => x !== rid) : [...c.routeIds, rid] }); };
  const Card = ({ id, title, icon, children }: { id?: string; title: string; icon: React.ReactNode; children: React.ReactNode }) => <section id={id} className="scroll-mt-24 rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="mb-3 flex items-center gap-2 text-xl font-bold">{icon}{title}</h2>{children}</section>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Communauté</h1>
      <p className="mt-2 max-w-2xl text-ink-600">Votre profil sportif, vos collections, vos défis et vos records personnels.</p>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-ink-700"><Users className="mt-0.5 size-5 shrink-0 text-warn" /><p><b>Fonctions multi-membres pas encore disponibles :</b> abonnements entre membres, publication visible par les autres, classements entre membres et commentaires partagés exigent des comptes et un serveur (étape 2, reportée). Ce qui suit fonctionne pour vous, sur cet appareil.</p></div>
      <div className="mt-6 grid gap-6">
        <Card title="Profil sportif" icon={<Users className="size-5 text-pine-600" />}><ProfileForm /></Card>
        <Card title="Défis" icon={<Target className="size-5 text-pine-600" />}><div className="grid gap-4">{challenges.map((c) => <Progress key={c.l} label={c.l} value={c.v} goal={c.g} unit={c.u} />)}</div></Card>
        <Card title="Records personnels" icon={<Trophy className="size-5 text-ember-500" />}>
          {acts.length ? <ul className="grid gap-2 text-sm"><li className="flex justify-between rounded-lg bg-ink-50 p-3"><span>Sortie la plus longue</span><b>{longest.name} · {fmtKm(longest.distanceM)}</b></li><li className="flex justify-between rounded-lg bg-ink-50 p-3"><span>Plus gros dénivelé</span><b>{climb.name} · {fmtM(climb.gainM)}</b></li>{speeds.map((s) => <li key={s.s} className="flex justify-between rounded-lg bg-ink-50 p-3"><span>Meilleure vitesse moyenne · {SPORTS[s.s as keyof typeof SPORTS].label}</span><b>{s.v.toFixed(1).replace(".", ",")} km/h</b></li>)}</ul> : <p className="text-sm text-ink-500">Enregistrez des sorties avec le <Link className="font-semibold text-pine-700 underline" href="/suivi">suivi GPS</Link> pour établir vos records.</p>}
          <p className="mt-3 text-xs text-ink-400">Historique complet dans <Link className="underline" href="/compte#activites">Mon espace</Link>.</p></Card>
        <Card id="collections" title="Collections" icon={<Plus className="size-5 text-pine-600" />}>
          <form onSubmit={add} className="flex gap-2"><input aria-label="Nom de la collection" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Sorties du week-end" maxLength={80} className="h-10 flex-1 rounded-lg border border-ink-200 px-3 text-sm" /><Button type="submit" variant="brand"><Plus className="size-4" />Créer</Button></form>
          <ul className="mt-4 grid gap-3">{cols.map((c) => (
            <li key={c.id} className="rounded-xl bg-ink-50 p-3"><div className="flex items-center justify-between"><p className="font-semibold">{c.name} <Badge>{c.routeIds.length}</Badge></p><Button size="sm" variant="ghost" aria-label="Supprimer la collection" onClick={() => confirm(`Supprimer « ${c.name} » ?`) && collectionsRepo.remove(c.id)}><Trash2 className="size-4" /></Button></div>
              <details className="mt-1"><summary className="cursor-pointer text-sm font-medium text-pine-700">Choisir les parcours</summary><ul className="mt-2 grid max-h-52 gap-1 overflow-y-auto">{routes.map((r) => <li key={r.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.routeIds.includes(r.id)} onChange={() => toggle(c.id, r.id)} className="accent-[var(--color-pine-600)]" />{r.name}{favs.includes(r.id) && " ♥"}</label></li>)}</ul></details>
              {c.routeIds.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{c.routeIds.map((id) => { const r = routes.find((x) => x.id === id); return r ? <li key={id}><Link href={`/parcours/${id}`} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium ring-1 ring-ink-200 hover:ring-pine-400">{r.name}</Link></li> : null; })}</ul>}
            </li>))}{!cols.length && <li className="text-sm text-ink-500">Aucune collection.</li>}</ul></Card>
      </div>
    </div>
  );
}
