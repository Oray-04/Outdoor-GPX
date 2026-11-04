"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Link2, Download, Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { collectionsRepo, eventsRepo, routesRepo, useFavorites, type Collection } from "@/lib/repo";
import { useAllRoutes } from "@/lib/route-vm";
import { cloudEnabled } from "@/lib/cloud";
import { collectionHref, routeHref, BASE } from "@/lib/url";
import { download, safeName, serialize } from "@/lib/formats";
import { makeZip } from "@/lib/zip";
import { uid } from "@/lib/types";

const field = "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";

export function CollectionsCard() {
  const routes = useAllRoutes();
  const cols = collectionsRepo.useAll();
  const events = eventsRepo.useAll().filter((e) => e.origin === "mine");
  const favs = useFavorites();
  const [name, setName] = useState("");
  const [vis, setVis] = useState<"prive" | "public">("prive");
  const [note, setNote] = useState<string | null>(null);

  const add = (e: React.FormEvent) => { e.preventDefault(); if (!name.trim()) return; collectionsRepo.upsert({ id: uid(), name: name.trim(), description: "", routeIds: [], visibility: vis }); setName(""); };
  const patch = (c: Collection, p: Partial<Collection>) => collectionsRepo.upsert({ ...c, ...p });
  const toggle = (c: Collection, rid: string) => patch(c, { routeIds: c.routeIds.includes(rid) ? c.routeIds.filter((x) => x !== rid) : [...c.routeIds, rid] });
  const copy = async (c: Collection) => { try { await navigator.clipboard.writeText(`${location.origin}${BASE}${collectionHref(c.id)}`); setNote("Lien copié."); } catch { setNote("Copie impossible : sélectionnez le lien manuellement."); } };
  const zip = async (c: Collection) => {
    const files = c.routeIds.map((id) => routes.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).map((r) => ({ name: `${safeName(r.name)}.gpx`, content: serialize("gpx", { name: r.name, description: r.description, coords: r.coords, pois: r.pois }) }));
    if (!files.length) { setNote("Cette collection ne contient aucun parcours disponible."); return; }
    download(`${safeName(c.name)}.zip`, await makeZip(files), "application/zip");
  };
  const makePublic = (c: Collection) => c.routeIds.forEach((id) => { const r = routesRepo.get(id); if (r && r.visibility !== "public") routesRepo.upsert({ ...r, visibility: "public", updatedAt: Date.now() }); });

  return (
    <div>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input aria-label="Nom de la collection" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Parcours du trail 2027" maxLength={80} className="h-10 min-w-0 flex-1 rounded-lg border border-ink-200 px-3 text-sm" />
        <select aria-label="Visibilité" value={vis} onChange={(e) => setVis(e.target.value as "prive" | "public")} className="h-10 rounded-lg border border-ink-200 bg-white px-2 text-sm"><option value="prive">Privée</option><option value="public">Publique</option></select>
        <Button type="submit" variant="brand"><Plus className="size-4" />Créer</Button>
      </form>
      {note && <p role="status" className="mt-2 text-sm text-pine-700">{note}</p>}
      <ul className="mt-4 grid gap-3">{cols.map((c) => {
        const inside = c.routeIds.map((id) => routes.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
        const blockers = c.visibility === "public" ? inside.filter((r) => r.origin !== "mine" || r.visibility !== "public") : [];
        const demo = blockers.filter((r) => r.origin === "demo");
        const priv = blockers.filter((r) => r.origin === "mine");
        return (
          <li key={c.id} className="rounded-xl bg-ink-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Nom" className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 font-semibold hover:border-ink-200 focus:bg-white" value={c.name} onChange={(e) => patch(c, { name: e.target.value })} />
              <Badge tone={c.visibility === "public" ? "pine" : "neutral"}>{c.visibility === "public" ? <><Globe className="size-3" />Publique</> : <><Lock className="size-3" />Privée</>}</Badge>
              <Button size="sm" variant="ghost" aria-label="Supprimer la collection" onClick={() => confirm(`Supprimer « ${c.name} » ?`) && collectionsRepo.remove(c.id)}><Trash2 className="size-4" /></Button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-xs font-medium">Visibilité<select className={field} value={c.visibility ?? "prive"} onChange={(e) => patch(c, { visibility: e.target.value as "prive" | "public" })}><option value="prive">Privée</option><option value="public">Publique</option></select></label>
              <label className="grid gap-1 text-xs font-medium">Événement associé<select className={field} value={c.eventId ?? ""} onChange={(e) => { const id = e.target.value || undefined; patch(c, { eventId: id }); if (id) { const ev = eventsRepo.get(id); if (ev) eventsRepo.upsert({ ...ev, collectionId: c.id }); } }}><option value="">Aucun</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
            </div>
            <textarea aria-label="Description" rows={2} maxLength={3000} placeholder="Description (facultative)" className="mt-2 w-full rounded-lg border border-ink-200 bg-white p-2 text-sm" value={c.description} onChange={(e) => patch(c, { description: e.target.value })} />
            <details className="mt-1"><summary className="cursor-pointer text-sm font-medium text-pine-700">Parcours de la collection ({c.routeIds.length})</summary>
              <ul className="mt-2 grid max-h-52 gap-1 overflow-y-auto">{routes.map((r) => <li key={r.id}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.routeIds.includes(r.id)} onChange={() => toggle(c, r.id)} className="accent-[var(--color-pine-600)]" />{r.name}{favs.includes(r.id) && " ♥"}{r.origin === "mine" && r.visibility === "public" && <Badge tone="pine" className="ml-1">public</Badge>}</label></li>)}</ul></details>
            {inside.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{inside.map((r) => <li key={r.id}><Link href={routeHref(r.id)} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium ring-1 ring-ink-200 hover:ring-pine-400">{r.name}</Link></li>)}</ul>}
            {priv.length > 0 && <div role="alert" className="mt-2 rounded-lg bg-warn/10 p-2 text-sm"><p>Collection publique, mais {priv.length} parcours {priv.length > 1 ? "sont" : "est"} encore privé{priv.length > 1 ? "s" : ""} (non visible{priv.length > 1 ? "s" : ""} du public).</p><Button size="sm" variant="brand" className="mt-1.5" onClick={() => makePublic(c)}>Rendre ces parcours publics</Button></div>}
            {demo.length > 0 && <p className="mt-2 text-xs text-ink-500">{demo.length} parcours de démonstration ne peuvent pas être publiés.</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link href={collectionHref(c.id)} className="inline-flex h-10 items-center rounded-xl border border-ink-200 bg-white px-3.5 text-sm font-semibold hover:bg-ink-50 lg:h-9">Ouvrir la page</Link>
              <Button size="sm" variant="secondary" onClick={() => zip(c)}><Download className="size-4" />Tout télécharger (ZIP)</Button>
              {c.visibility === "public" && cloudEnabled && <Button size="sm" variant="secondary" onClick={() => copy(c)}><Link2 className="size-4" />Copier le lien public</Button>}
            </div>
            {c.visibility === "public" && !cloudEnabled && <p className="mt-1 text-xs text-ink-500">Le lien public sera disponible quand les comptes seront activés.</p>}
          </li>);
      })}{!cols.length && <li className="text-sm text-ink-500">Aucune collection.</li>}</ul>
    </div>
  );
}
