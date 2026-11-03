import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Mode cloud (comptes + synchronisation) : actif seulement si les deux variables sont définies au build.
 * La clé « anon » est publique par conception ; la sécurité repose sur les règles d'accès (RLS) de la base.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const cloudEnabled = Boolean(URL && KEY);

let client: SupabaseClient | null = null;
/** À appeler côté navigateur uniquement (effets, gestionnaires d'événements). */
export function cloud(): SupabaseClient | null {
  if (client) return client;
  if (!cloudEnabled) return null;
  client ??= createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

/** Réservé aux tests : injecte un client préparé (API simulée). */
export function __setCloudClientForTests(c: SupabaseClient | null) { client = c; }
