"use client";
import Link from "next/link";
import { useState } from "react";
import { CloudOff, RefreshCw, LogOut, Check, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { cloud } from "@/lib/cloud";
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
      <div><p className="font-semibold">Mode local : comptes non activés</p><p className="mt-1">Données sur cet appareil uniquement. Pour les retrouver partout et publier, connectez une base Supabase : <a className="font-semibold text-pine-700 underline" href={DOC} target="_blank" rel="noopener noreferrer">guide pas à pas</a>.</p></div>
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
      <DeleteAccount />
      <p className="text-xs text-ink-500">Synchronisés : parcours, activités, collections, événements, favoris, profil, calques. Photos : sur cet appareil uniquement. Un parcours « Public » est visible de tous.</p>
    </div>
  );
}

/** Suppression du compte par l'utilisateur (droit à l'effacement) : compte, données synchronisées et contenus publiés. */
function DeleteAccount() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState(""); const [wipe, setWipe] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false);
  const run = async () => {
    const c = cloud(); if (!c || word.trim().toUpperCase() !== "SUPPRIMER") return;
    setBusy(true); setErr(null);
    const { error } = await c.rpc("delete_my_account");
    if (error) { setBusy(false); setErr(`Suppression impossible : ${error.message}. Réessayez ou écrivez-nous (page Mentions légales).`); return; }
    await auth.signOut();
    if (wipe) {
      try { for (const k of Object.keys(localStorage)) if (k.startsWith("crete:") || k.startsWith("sb-")) localStorage.removeItem(k); sessionStorage.clear(); } catch { /* stockage indisponible */ }
      try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* pas de cache */ }
    }
    setBusy(false); setDone(true);
  };
  if (done) return <p role="status" className="rounded-lg bg-pine-50 p-3 text-pine-800" data-account-deleted>Votre compte et toutes ses données en ligne ont été supprimés.{wipe ? " Les données de cet appareil ont aussi été effacées." : " Les données de cet appareil sont conservées : vous pouvez les effacer dans les réglages du navigateur."}</p>;
  return (
    <div className="rounded-xl border border-danger/30 p-3" data-delete-account>
      {!open ? <button type="button" className="text-sm font-semibold text-danger underline" onClick={() => setOpen(true)}>Supprimer mon compte</button> : (
        <div className="grid gap-2">
          <p className="font-semibold text-danger">Supprimer définitivement mon compte</p>
          <p className="text-xs text-ink-600">Le compte, toutes vos données synchronisées et vos contenus publiés (parcours, événements, collections) sont effacés de la base. Action irréversible : exportez vos données avant si besoin (page Administration, « Exporter tout »).</p>
          <label className="grid gap-1 text-xs font-medium">Tapez SUPPRIMER pour confirmer<input value={word} onChange={(e) => setWord(e.target.value)} className="h-9 rounded-lg border border-ink-200 px-2 text-sm" autoComplete="off" /></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={wipe} onChange={(e) => setWipe(e.target.checked)} className="size-4 accent-[var(--color-danger)]" />Effacer aussi toutes les données de cet appareil</label>
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" className="!bg-danger !text-white disabled:!opacity-50" disabled={busy || word.trim().toUpperCase() !== "SUPPRIMER"} onClick={run} data-action="supprimer-compte">{busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}Supprimer mon compte</Button><Button size="sm" variant="ghost" onClick={() => { setOpen(false); setWord(""); setErr(null); }}>Annuler</Button></div>
        </div>)}
    </div>
  );
}
