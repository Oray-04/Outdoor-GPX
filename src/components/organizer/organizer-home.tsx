"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Settings, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eventsRepo } from "@/lib/repo";
import { ROLES, type EventModel } from "@/lib/events";
import { uid } from "@/lib/types";
import { eventHref, manageHref, withBase } from "@/lib/url";

export function OrganizerHome() {
  const events = eventsRepo.useAll();
  const [f, setF] = useState({ name: "", organizer: "", date: "", place: "", region: "" });
  const field = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";
  const create = (e: React.FormEvent) => {
    e.preventDefault();
    const ev: EventModel = { id: uid(), ...f, name: f.name.trim(), description: "", rules: "", practical: "", registrationUrl: "", races: [], posts: [], volunteers: [], team: [], origin: "mine", createdAt: Date.now() };
    eventsRepo.upsert(ev); location.assign(withBase(manageHref(ev.id)));
  };
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Espace organisateurs</h1>
      <p className="mt-2 max-w-2xl text-ink-600">Préparez votre événement : courses, parcours, ravitaillements, barrières horaires, bénévoles, secours et temps de passage, avec exports PDF.</p>
      <form onSubmit={create} className="mt-6 grid gap-3 rounded-2xl bg-white p-5 ring-1 ring-ink-100 sm:grid-cols-2">
        <h2 className="text-lg font-bold sm:col-span-2">Nouvel événement</h2>
        <label className="grid gap-1 text-sm font-medium">Nom<input required className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} /></label>
        <label className="grid gap-1 text-sm font-medium">Organisateur<input required className={field} value={f.organizer} onChange={(e) => setF({ ...f, organizer: e.target.value })} maxLength={120} /></label>
        <label className="grid gap-1 text-sm font-medium">Date<input required type="date" className={field} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Lieu<input required className={field} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></label>
        <label className="grid gap-1 text-sm font-medium">Région<input className={field} value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} /></label>
        <div className="flex items-end"><Button type="submit"><Plus className="size-4" />Créer l'événement</Button></div>
      </form>
      <section className="mt-8"><h2 className="text-xl font-bold">Mes événements ({events.length})</h2>
        {!events.length ? <p className="mt-3 rounded-xl border border-dashed border-ink-200 p-6 text-sm text-ink-500">Aucun événement pour l'instant.</p> : (
          <ul className="mt-3 grid gap-3">{events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-ink-100"><div className="min-w-0 flex-1"><Link href={eventHref(e.id)} className="font-semibold hover:text-pine-700">{e.name}</Link><p className="text-sm text-ink-500">{e.date} · {e.place} · {e.races.length} course(s) · {e.posts.length} poste(s) · {e.volunteers.length} bénévole(s)</p></div>
              <Link href={manageHref(e.id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-pine-600 px-3.5 text-sm font-semibold text-white hover:bg-pine-700"><Settings className="size-4" />Gérer</Link>
              <Button size="sm" variant="ghost" aria-label="Supprimer" onClick={() => confirm(`Supprimer « ${e.name} » ?`) && eventsRepo.remove(e.id)}><Trash2 className="size-4" /></Button></li>))}</ul>)}
      </section>
      <section className="mt-10 rounded-2xl bg-white p-5 ring-1 ring-ink-100"><h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="size-5 text-pine-600" />Rôles et permissions</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.values(ROLES).map((r) => <div key={r.label} className="rounded-xl bg-ink-50 p-3"><p className="font-semibold">{r.label}</p><ul className="mt-1 list-disc pl-5 text-sm text-ink-600">{r.can.map((c) => <li key={c}>{c}</li>)}</ul></div>)}</div>
        <p className="mt-3 text-xs text-ink-500">Les rôles sont définis et enregistrés dans chaque événement, mais ils ne sont pas appliqués tant que les comptes utilisateurs n'existent pas (étape 2 reportée) : aujourd'hui, toute personne utilisant cet appareil a tous les droits.</p></section>
    </div>
  );
}
