/**
 * Lecture sûre d'une réponse JSON d'un service externe.
 *
 * Un statut 200 ne garantit pas des données : certains serveurs (ex. un nœud de la Géoplateforme mal routé) renvoient
 * parfois une page de métriques (« # HELP jmx… »), une page HTML d'erreur ou un texte vide. `res.json()` lève alors
 * « Unexpected token … is not valid JSON ». Ici, le type de contenu et le début du texte sont vérifiés avant l'analyse,
 * et l'échec est typé (`ServiceFormatError`) pour être traité comme une panne passagère (nouvel essai, autre source).
 */
export class ServiceFormatError extends Error {
  constructor(public service: string, public sample: string) {
    super(`${service} a renvoyé une réponse inattendue (pas des données). Réessayez dans un instant.`);
    this.name = "ServiceFormatError";
  }
}

/** Analyse le corps d'une réponse comme du JSON, ou lève `ServiceFormatError` si ce n'en est pas. */
export async function readJson<T>(r: Response, service: string): Promise<T> {
  const text = await r.text();
  // le type annoncé n'est pas fiable (certains serveurs annoncent du JSON pour une page d'erreur) : on vérifie le contenu lui-même
  const head = text.trimStart().slice(0, 1);
  if (head !== "{" && head !== "[") throw new ServiceFormatError(service, text.slice(0, 60));
  try { return JSON.parse(text) as T; } catch { throw new ServiceFormatError(service, text.slice(0, 60)); }
}

/** Panne passagère (à réessayer) : surcharge, erreur serveur, ou réponse qui n'est pas des données. */
export const isTransient = (e: unknown, status?: number) => e instanceof ServiceFormatError || (status != null && (status === 429 || status >= 500));
