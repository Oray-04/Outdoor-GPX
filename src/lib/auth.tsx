"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { cloud, cloudEnabled } from "./cloud";
import { BASE } from "./url";

interface AuthCtx {
  enabled: boolean;
  ready: boolean;
  user: User | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  magicLink: (email: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

const redirect = () => `${location.origin}${BASE}/connexion/`;
/** Messages d'erreur courants en français ; sinon message d'origine. */
const fr = (m: string) =>
  /invalid login/i.test(m) ? "E-mail ou mot de passe incorrect." :
  /already registered|already been registered/i.test(m) ? "Un compte existe déjà avec cet e-mail." :
  /password should be at least/i.test(m) ? "Mot de passe trop court (8 caractères minimum)." :
  /email not confirmed/i.test(m) ? "Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail." :
  /rate limit|too many/i.test(m) ? "Trop de tentatives : patientez quelques minutes." :
  /failed to fetch|network|fetch failed/i.test(m) ? "Service injoignable : vérifiez votre connexion internet et la configuration Supabase." : m;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!cloudEnabled);
  const [isAdmin, setAdmin] = useState(false);

  useEffect(() => {
    const c = cloud(); if (!c) return;
    c.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setReady(true); });
    const { data: sub } = c.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const c = cloud(); if (!c || !user) { setAdmin(false); return; }
    c.rpc("is_admin").then(({ data }) => setAdmin(data === true)); // statut de l'utilisateur connecté uniquement (la colonne n'est plus lisible publiquement)
  }, [user]);

  const wrap = useCallback(async (fn: () => Promise<{ error: { message: string } | null }>) => {
    try { const { error } = await fn(); return error ? fr(error.message) : null; } catch { return "Service indisponible. Vérifiez votre connexion."; }
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    enabled: cloudEnabled, ready, user, isAdmin,
    signIn: (email, password) => wrap(() => cloud()!.auth.signInWithPassword({ email, password })),
    signUp: (email, password) => wrap(() => cloud()!.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } })),
    magicLink: (email) => wrap(() => cloud()!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect() } })),
    resetPassword: (email) => wrap(() => cloud()!.auth.resetPasswordForEmail(email, { redirectTo: redirect() })),
    signOut: async () => { await cloud()?.auth.signOut(); },
  }), [ready, user, isAdmin, wrap]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return c;
}
