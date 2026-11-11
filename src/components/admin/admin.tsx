"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Trash2, BadgeCheck, Download, Upload, Plus, AlertTriangle, ShieldAlert } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { activitiesRepo, collectionsRepo, eventsRepo, reportsRepo, reviewsRepo, routesRepo, saveEditorial, saveTerrains, useEditorial, useTerrains } from "@/lib/repo";
import { useVerified } from "@/lib/route-vm";
import { writeStore } from "@/lib/store";
import { download } from "@/lib/formats";
import { fmtKm } from "@/lib/geo";
import { fromSaved } from "@/lib/route-model";
import { useAuth } from "@/lib/auth";
import { cloud } from "@/lib/cloud";
import { routeHref, manageHref } from "@/lib/url";

type Tab = "apercu" | "parcours" | "moderation" | "evenements" | "categories" | "editorial" | "donnees" | "membres";
const TABS: [Tab, string][] = [["apercu", "Aperçu"], ["parcours", "Parcours"], ["moderation", "Modération"], ["evenements", "Événements"], ["categories", "Catégories"], ["editorial", "Contenus"], ["donnees", "Données"], ["membres", "Parcours publics"]];
const PREFIX = "crete:";

function storageBytes() { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(PREFIX)) n += k.length + (localStorage.getItem(k)?.length ?? 0); } } catch { /* indisponible */ } return n * 2; }

export function Admin() {
  const [tab, setTab] = useState<Tab>("apercu");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Administration</h1>
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-warn" /><p>Cette console agit sur les données de <b>cet appareil</b>. Elle n'est protégée par aucun compte (étape 2 reportée) : ne la déployez pas publiquement en l'état.</p></div>
      <div className="mt-4 flex overflow-x-auto border-b border-ink-100" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx("shrink-0 px-4 py-2.5 text-sm font-semibold", tab === k ? "border-b-2 border-pine-600 text-pine-700" : "text-ink-500")}>{l}</button>)}</div>
      <div className="mt-6">{{ apercu: <Overview />, parcours: <RoutesAdmin />, moderation: <Moderation />, evenements: <EventsAdmin />, categories: <Categories />, editorial: <EditorialAdmin />, donnees: <DataAdmin />, membres: <Members /> }[tab]}</div>
    </div>
  );
}

function Overview() {
  const routes = routesRepo.useAll(), events = eventsRepo.useAll(), acts = activitiesRepo.useAll(), reports = reportsRepo.useAll(), reviews = reviewsRepo.useAll(), cols = collectionsRepo.useAll();
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => setBytes(storageBytes()), [routes, events, acts, reports, reviews, cols]);
  const km = routes.reduce((s, r) => s + fromSaved(r).stats.distanceM, 0);
  const items = [["Parcours", routes.length], ["Distance cumulée", fmtKm(km)], ["Événements", events.length], ["Activités", acts.length], ["Avis", reviews.length], ["Collections", cols.length], ["Signalements ouverts", reports.filter((r) => r.status === "ouvert").length], ["Stockage utilisé", bytes == null ? "—" : `${(bytes / 1024).toFixed(0)} Ko`]];
  return <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{items.map(([l, v]) => <div key={l} className="rounded-xl bg-white p-4 ring-1 ring-ink-100"><dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{l}</dt><dd className="font-display text-2xl font-bold">{v}</dd></div>)}</dl>;
}

function RoutesAdmin() {
  const routes = routesRepo.useAll();
  const verified = useVerified();
  const toggleV = (id: string) => writeStore("verified", verified.includes(id) ? verified.filter((x) => x !== id) : [...verified, id]);
  if (!routes.length) return <p className="rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Aucun parcours enregistré.</p>;
  return <ul className="grid gap-2">{routes.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-100">
    <div className="min-w-0 flex-1"><Link href={routeHref(r.id)} className="font-semibold hover:text-pine-700">{r.name}</Link><p className="text-xs text-ink-500">{fmtKm(fromSaved(r).stats.distanceM)} · {r.visibility === "prive" ? "privé" : "public"} · modifié le {new Date(r.updatedAt).toLocaleDateString("fr-FR")}</p></div>
    <Button size="sm" variant={verified.includes(r.id) ? "brand" : "secondary"} aria-pressed={verified.includes(r.id)} onClick={() => toggleV(r.id)}><BadgeCheck className="size-4" />{verified.includes(r.id) ? "Officiel vérifié" : "Marquer vérifié"}</Button>
    <Button size="sm" variant="secondary" onClick={() => routesRepo.upsert({ ...r, visibility: r.visibility === "prive" ? "public" : "prive", updatedAt: Date.now() })}>{r.visibility === "prive" ? "Rendre public" : "Rendre privé"}</Button>
    <Button size="sm" variant="ghost" aria-label="Supprimer" onClick={() => confirm(`Supprimer « ${r.name} » ?`) && routesRepo.remove(r.id)}><Trash2 className="size-4" /></Button></li>)}</ul>;
}

function Moderation() {
  const reports = reportsRepo.useAll(), reviews = reviewsRepo.useAll(), routes = routesRepo.useAll();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section><h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><AlertTriangle className="size-5 text-ember-500" />Signalements ({reports.length})</h2>
        <ul className="grid gap-2">{reports.sort((a, b) => b.at - a.at).map((r) => <li key={r.id} className="rounded-xl bg-white p-3 ring-1 ring-ink-100"><div className="flex items-center justify-between gap-2"><Link href={routeHref(r.routeId)} className="font-semibold hover:text-pine-700">{r.routeName}</Link><Badge tone={r.status === "ouvert" ? "ember" : "pine"}>{r.status === "ouvert" ? "Ouvert" : "Traité"}</Badge></div><p className="mt-1 text-sm">{r.message}</p><p className="text-xs text-ink-400">{new Date(r.at).toLocaleString("fr-FR")}</p>
          <div className="mt-2 flex gap-2"><Button size="sm" variant="secondary" onClick={() => reportsRepo.upsert({ ...r, status: r.status === "ouvert" ? "traite" : "ouvert" })}>{r.status === "ouvert" ? "Marquer traité" : "Rouvrir"}</Button><Button size="sm" variant="ghost" onClick={() => reportsRepo.remove(r.id)}>Supprimer</Button></div></li>)}{!reports.length && <li className="text-sm text-ink-500">Aucun signalement.</li>}</ul></section>
      <section><h2 className="mb-2 text-lg font-bold">Avis ({reviews.length})</h2>
        <ul className="grid gap-2">{reviews.sort((a, b) => b.at - a.at).map((r) => <li key={r.id} className="flex items-start gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-100"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{"★".repeat(r.rating)}<span className="ml-2 font-normal text-ink-500">{routes.find((x) => x.id === r.routeId)?.name ?? "Parcours supprimé"}</span></p>{r.comment && <p className="text-sm">{r.comment}</p>}</div><Button size="sm" variant="ghost" aria-label="Supprimer l'avis" onClick={() => reviewsRepo.remove(r.id)}><Trash2 className="size-4" /></Button></li>)}{!reviews.length && <li className="text-sm text-ink-500">Aucun avis.</li>}</ul></section>
    </div>
  );
}

function EventsAdmin() {
  const events = eventsRepo.useAll();
  return events.length ? <ul className="grid gap-2">{events.map((e) => <li key={e.id} className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-100"><div className="min-w-0 flex-1"><Link href={manageHref(e.id)} className="font-semibold hover:text-pine-700">{e.name}</Link><p className="text-xs text-ink-500">{e.date} · {e.organizer} · {e.races.length} course(s)</p></div><Button size="sm" variant="ghost" aria-label="Supprimer" onClick={() => confirm(`Supprimer « ${e.name} » ?`) && eventsRepo.remove(e.id)}><Trash2 className="size-4" /></Button></li>)}</ul> : <p className="rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Aucun événement créé.</p>;
}

function Categories() {
  const terrains = useTerrains();
  const [v, setV] = useState("");
  return (
    <div className="max-w-xl"><h2 className="text-lg font-bold">Types de terrain</h2><p className="text-sm text-ink-500">Proposés dans l'éditeur de parcours et dans les filtres de la bibliothèque.</p>
      <ul className="mt-3 flex flex-wrap gap-2">{terrains.map((t) => <li key={t} className="inline-flex items-center gap-1 rounded-full bg-ink-100 py-1 pl-3 pr-1 text-sm">{t}<button aria-label={`Retirer ${t}`} className="grid size-6 place-items-center rounded-full hover:bg-ink-200" onClick={() => saveTerrains(terrains.filter((x) => x !== t))}>×</button></li>)}</ul>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (t && !terrains.includes(t)) saveTerrains([...terrains, t]); setV(""); }}><input aria-label="Nouvelle catégorie" className="h-10 flex-1 rounded-lg border border-ink-200 px-3 text-sm" value={v} onChange={(e) => setV(e.target.value)} maxLength={40} /><Button type="submit" variant="brand"><Plus className="size-4" />Ajouter</Button></form></div>
  );
}

function EditorialAdmin() {
  const e = useEditorial();
  return (
    <div className="max-w-xl grid gap-3"><h2 className="text-lg font-bold">Bandeau d'annonce</h2><p className="text-sm text-ink-500">Affiché en haut de toutes les pages.</p>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={e.announcementOn} onChange={(x) => saveEditorial({ ...e, announcementOn: x.target.checked })} className="accent-[var(--color-pine-600)]" />Afficher le bandeau</label>
      <textarea aria-label="Texte du bandeau" rows={3} maxLength={240} className="rounded-lg border border-ink-200 p-3 text-sm" value={e.announcement} onChange={(x) => saveEditorial({ ...e, announcement: x.target.value })} /></div>
  );
}

function DataAdmin() {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const exportAll = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(PREFIX)) data[k] = localStorage.getItem(k)!; }
    download(`crete-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "crete", version: 1, data }), "application/json");
  };
  const importAll = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as { app?: string; data?: Record<string, string> };
      if (j.app !== "crete" || !j.data) throw new Error();
      if (!confirm("Remplacer toutes les données de cet appareil par cette sauvegarde ?")) return;
      Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
      Object.entries(j.data).forEach(([k, v]) => { if (k.startsWith(PREFIX) && typeof v === "string") localStorage.setItem(k, v); });
      location.reload();
    } catch { setMsg("Fichier de sauvegarde invalide."); }
  };
  return (
    <div className="max-w-xl grid gap-3"><h2 className="text-lg font-bold">Sauvegarde</h2>
      <p className="text-sm text-ink-600">Les données vivent dans le navigateur : vider ses données de site les efface. Sauvegardez régulièrement.</p>
      <div className="flex flex-wrap gap-2"><Button variant="brand" onClick={exportAll}><Download className="size-4" />Exporter tout (JSON)</Button>
        <input ref={input} hidden type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importAll(f); e.target.value = ""; }} />
        <Button variant="secondary" onClick={() => input.current?.click()}><Upload className="size-4" />Restaurer une sauvegarde</Button>
        <Button variant="ghost" className="text-danger" onClick={() => { if (confirm("Effacer TOUTES les données de Crête sur cet appareil ?")) { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); location.reload(); } }}><Trash2 className="size-4" />Tout effacer</Button></div>
      {msg && <p role="alert" className="text-sm text-danger">{msg}</p>}</div>
  );
}

function Members() {
  const auth = useAuth();
  const [routes, setRoutes] = useState<{ id: string; name: string; owner_id: string; distance_m: number; updated_at: string }[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    const c = cloud(); if (!c) return;
    const [r, p] = await Promise.all([c.from("public_routes").select("id,name,owner_id,distance_m,updated_at").order("updated_at", { ascending: false }).limit(200), c.from("profiles").select("id,display_name")]);
    if (r.error || p.error) { setErr((r.error ?? p.error)!.message); return; }
    setRoutes(r.data); setNames(Object.fromEntries((p.data ?? []).map((x) => [x.id, x.display_name])));
  };
  useEffect(() => { if (auth.isAdmin) load(); }, [auth.isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (id: string) => { if (!confirm("Retirer ce parcours public ?")) return; const { error } = await cloud()!.from("public_routes").delete().eq("id", id); if (error) setErr(error.message); else load(); };

  if (!auth.enabled) return <div className="max-w-2xl rounded-xl bg-white p-5 ring-1 ring-ink-100 text-sm text-ink-700"><h2 className="text-lg font-bold">Membres et parcours publics</h2><p className="mt-2">Disponible une fois les comptes activés (base Supabase connectée). Les abonnements et paiements sont volontairement hors périmètre pour l'instant.</p><Badge tone="ember" className="mt-3">Comptes non activés</Badge></div>;
  if (!auth.user || !auth.isAdmin) return <div className="max-w-2xl rounded-xl bg-white p-5 ring-1 ring-ink-100 text-sm text-ink-700"><h2 className="text-lg font-bold">Modération des parcours publics</h2><p className="mt-2">Réservé aux administrateurs : {auth.user ? "votre compte n'a pas ce droit (colonne is_admin du profil, à activer dans la base)." : "connectez-vous avec un compte administrateur."}</p>{!auth.user && <Link href="/connexion" className="mt-3 inline-block font-semibold text-pine-700 underline">Se connecter</Link>}</div>;
  return (
    <div><h2 className="text-lg font-bold">Parcours publics ({routes?.length ?? "…"})</h2>{err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
      <ul className="mt-3 grid gap-2">{routes?.map((r) => <li key={r.id} className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-ink-100"><div className="min-w-0 flex-1"><Link href={routeHref(r.id)} className="font-semibold hover:text-pine-700">{r.name}</Link><p className="text-xs text-ink-500">par {names[r.owner_id] || "membre"} · {fmtKm(r.distance_m)} · {new Date(r.updated_at).toLocaleDateString("fr-FR")}</p></div><Button size="sm" variant="ghost" aria-label="Retirer" onClick={() => remove(r.id)}><Trash2 className="size-4" /></Button></li>)}{routes && !routes.length && <li className="text-sm text-ink-500">Aucun parcours public.</li>}</ul></div>
  );
}
