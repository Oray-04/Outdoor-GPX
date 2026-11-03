"use client";
import Link from "next/link";
import { CloudOff, RefreshCw, LogOut, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useSync } from "@/lib/sync";

const DOC = "https://github.com/Oray-04/Outdoor-GPX/blob/claude/etape-1-interface/docs/supabase.md";

export function CloudCard() {
  const auth = useAuth();
  const sync = useSync();
  if (!auth.enabled) return (
    <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-4 text-sm text-ink-700">
      <CloudOff className="mt-0.5 size-5 shrink-0" />
      <div><p className="font-semibold">Mode local : comptes non activés</p><p className="mt-1">Vos données restent sur cet appareil. Pour les retrouver partout et publier des parcours, connectez le site à une base Supabase : <a className="font-semibold text-pine-700 underline" href={DOC} target="_blank" rel="noopener noreferrer">guide pas à pas</a>.</p></div>
    </div>
  );
  if (!auth.ready) return <p className="flex items-center gap-2 text-sm text-ink-500"><Loader2 className="size-4 animate-spin" />Chargement…</p>;
  if (!auth.user) return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-50 p-4 text-sm"><p>Connectez-vous pour synchroniser vos données entre appareils et publier des parcours.</p><Link href="/connexion" className="inline-flex h-9 items-center rounded-xl bg-pine-600 px-4 font-semibold text-white hover:bg-pine-700">Se connecter</Link></div>
  );
  return (
    <div className="grid gap-3 text-sm">
      <p>Connecté : <b>{auth.user.email}</b>{auth.isAdmin && " · administrateur"}</p>
      <p className="flex flex-wrap items-center gap-2" aria-live="polite">
        {sync.status === "syncing" && <><Loader2 className="size-4 animate-spin" />Synchronisation…</>}
        {sync.status === "ok" && <><Check className="size-4 text-pine-600" />Synchronisé{sync.lastSync ? ` à ${new Date(sync.lastSync).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""} ({sync.pulled} reçu(s), {sync.pushed} envoyé(s))</>}
        {sync.status === "error" && <span className="inline-flex items-start gap-1.5 text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Échec : {sync.error}</span>}
        {sync.status === "idle" && "En attente de synchronisation…"}
      </p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => sync.syncNow()} disabled={sync.status === "syncing"}><RefreshCw className="size-4" />Synchroniser maintenant</Button><Button size="sm" variant="ghost" onClick={() => auth.signOut()}><LogOut className="size-4" />Se déconnecter</Button></div>
      <p className="text-xs text-ink-500">Synchronisés : parcours, activités, collections, événements, favoris, profil, calques. Non synchronisées : les photos (stockage local uniquement). Les parcours « Public » sont publiés pour tous les visiteurs.</p>
    </div>
  );
}
