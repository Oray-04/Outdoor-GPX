"use client";
import { Field, RequiredLegend } from "@/components/ui/field";
import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CloudCard } from "./cloud-card";
import { useAuth } from "@/lib/auth";

type Mode = "signin" | "signup" | "magic" | "reset";
const TITLES: Record<Mode, string> = { signin: "Connexion", signup: "Créer un compte", magic: "Lien de connexion par e-mail", reset: "Mot de passe oublié" };

export function AuthForm() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [cgu, setCgu] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inp = "h-11 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    let err: string | null = null, ok = "";
    if (mode === "signin") err = await auth.signIn(email.trim(), pw);
    else if (mode === "signup") { err = !cgu ? "Acceptez les conditions d'utilisation pour créer un compte." : pw.length < 8 ? "Mot de passe trop court (8 caractères minimum)." : await auth.signUp(email.trim(), pw); ok = "Compte créé. Si la confirmation par e-mail est activée, ouvrez le lien reçu pour finaliser."; }
    else if (mode === "magic") { err = await auth.magicLink(email.trim()); ok = "Lien envoyé : consultez votre boîte mail."; }
    else { err = await auth.resetPassword(email.trim()); ok = "Si un compte existe, un e-mail de réinitialisation a été envoyé."; }
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : ok ? { ok: true, text: ok } : null);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-extrabold">{auth.user ? "Mon compte" : TITLES[mode]}</h1>
      {!auth.enabled || auth.user ? <div className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-ink-100"><CloudCard /></div> : (
        <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-ink-100"><RequiredLegend />
          <Field l="Adresse e-mail" required><input required type="email" autoComplete="email" className={inp} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {(mode === "signin" || mode === "signup") && <Field l="Mot de passe" required hint={mode === "signup" ? "8 caractères minimum." : undefined}><input required type="password" minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} className={inp} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>}
          {mode === "signup" && <label className="flex items-start gap-2.5 text-sm" data-cgu>
            <input type="checkbox" required checked={cgu} onChange={(e) => setCgu(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-pine-600)]" aria-describedby="cgu-note" />
            <span>J&apos;ai lu et j&apos;accepte les <Link href="/cgu" target="_blank" className="font-semibold text-pine-700 underline">conditions d&apos;utilisation</Link>. <span className="text-ink-500">(obligatoire)</span></span>
          </label>}
          {mode === "magic" && <p className="text-xs text-ink-500">Réservé aux comptes déjà créés : pour un nouveau compte, utilisez « Créer un compte ».</p>}
          <Button type="submit" size="lg" disabled={busy || !auth.ready || (mode === "signup" && !cgu)}>{busy && <Loader2 className="size-4 animate-spin" />}{mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : "Envoyer"}</Button>
          {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-pine-700" : "text-sm text-danger"}>{msg.text}</p>}
          <div className="grid gap-1 text-sm">
            {mode !== "signin" && <button type="button" className="text-left font-semibold text-pine-700 underline" onClick={() => { setMode("signin"); setMsg(null); }}>J'ai déjà un compte</button>}
            {mode !== "signup" && <button type="button" className="text-left font-semibold text-pine-700 underline" onClick={() => { setMode("signup"); setMsg(null); }}>Créer un compte</button>}
            {mode !== "magic" && <button type="button" className="text-left font-semibold text-pine-700 underline" onClick={() => { setMode("magic"); setMsg(null); }}>Recevoir un lien de connexion</button>}
            {mode !== "reset" && <button type="button" className="text-left font-semibold text-pine-700 underline" onClick={() => { setMode("reset"); setMsg(null); }}>Mot de passe oublié</button>}
          </div>
        </form>
      )}
      {auth.enabled && !auth.user && <p id="cgu-note" className="mt-4 text-xs leading-relaxed text-ink-500">Votre adresse e-mail et votre mot de passe servent uniquement à créer et sécuriser votre compte et à vous envoyer les e-mails indispensables (confirmation, connexion, réinitialisation). Ils sont hébergés par Supabase, en France. Vous pouvez supprimer votre compte à tout moment. Détails : <Link href="/confidentialite" className="font-semibold text-pine-700 underline">politique de confidentialité</Link>.</p>}
      <p className="mt-6 text-sm text-ink-500">Sans compte, tout fonctionne en local. <Link href="/compte" className="font-semibold text-pine-700 underline">Retour à mon espace</Link></p>
    </div>
  );
}
