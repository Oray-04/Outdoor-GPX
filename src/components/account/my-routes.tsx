"use client";
import { useState } from "react";
import { Trash2, CheckSquare, X } from "lucide-react";
import clsx from "clsx";
import { RouteCard } from "@/components/ui/route-card";
import { Button } from "@/components/ui/button";
import { eventsRepo, routesRepo } from "@/lib/repo";
import type { RouteVM } from "@/lib/route-model";
import { deleteMessage, racesUsing } from "@/lib/route-delete";

/** Mes parcours : suppression rapide sur chaque carte, ou sélection de plusieurs parcours supprimés en une fois, toujours après confirmation. */
export function MyRoutes({ routes, verified }: { routes: RouteVM[]; verified: string[] }) {
  const events = eventsRepo.useAll();
  const [mode, setMode] = useState(false); const [picked, setPicked] = useState<string[]>([]); const [msg, setMsg] = useState<string | null>(null);
  const sel = picked.filter((id) => routes.some((r) => r.id === id));
  const remove = (ids: string[]) => {
    const list = routes.filter((r) => ids.includes(r.id)); if (!list.length) return;
    if (!window.confirm(deleteMessage(list.map((r) => r.name), racesUsing(events, ids)))) return;
    let n = 0; for (const r of list) if (routesRepo.remove(r.id).ok) n++;
    setPicked((p) => p.filter((id) => !ids.includes(id))); if (n === list.length && list.length > 1) setMode(false);
    setMsg(n === list.length ? (n === 1 ? `« ${list[0].name} » supprimé.` : `${n} parcours supprimés.`) : `${n} parcours supprimé(s) sur ${list.length} : le stockage du navigateur a refusé les autres.`);
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!mode ? <Button size="sm" variant="secondary" onClick={() => { setMode(true); setMsg(null); }}><CheckSquare className="size-4" />Sélectionner plusieurs parcours</Button> : (<>
          <Button size="sm" variant="secondary" onClick={() => setPicked(sel.length === routes.length ? [] : routes.map((r) => r.id))}>{sel.length === routes.length ? "Tout désélectionner" : "Tout sélectionner"}</Button>
          <Button size="sm" disabled={!sel.length} onClick={() => remove(sel)} className="!bg-danger !bg-none !text-white !shadow-none hover:!brightness-110 disabled:!opacity-50"><Trash2 className="size-4" />Supprimer la sélection ({sel.length})</Button>
          <Button size="sm" variant="ghost" onClick={() => { setMode(false); setPicked([]); }}><X className="size-4" />Annuler</Button>
        </>)}
        {msg && <p role="status" className="text-sm text-pine-700">{msg}</p>}
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{routes.map((r) => { const on = sel.includes(r.id); return (
        <li key={r.id} className={clsx("relative rounded-[var(--radius-card)]", mode && on && "ring-2 ring-danger ring-offset-2")}>
          <RouteCard route={r} verified={verified.includes(r.id)} />
          {mode
            ? <label className="absolute inset-0 z-10 flex cursor-pointer items-start justify-end rounded-[var(--radius-card)] bg-white/10 p-3"><input type="checkbox" className="size-6 accent-[var(--color-danger)]" checked={on} onChange={() => toggle(r.id)} aria-label={`Sélectionner « ${r.name} »`} /></label>
            : <button type="button" onClick={() => remove([r.id])} aria-label={`Supprimer « ${r.name} »`} title="Supprimer ce parcours" className="absolute right-3 top-[5.75rem] z-10 grid size-10 place-items-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-sm transition hover:border-danger hover:bg-danger hover:text-white"><Trash2 className="size-4" /></button>}
        </li>); })}</ul>
    </div>
  );
}
