/**
 * Communes et régions : API Géo (geo.api.gouv.fr, données officielles Etalab / INSEE / La Poste).
 * Un code postal peut couvrir plusieurs communes : on renvoie toujours la liste, jamais un choix automatique.
 */
export interface Commune { code: string; nom: string; codesPostaux: string[]; lng: number; lat: number; departement: string; depCode: string; region: string }
export interface Region { code: string; nom: string }

const API = "https://geo.api.gouv.fr";
const FIELDS = "nom,code,codesPostaux,centre,departement,region";
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/[-–]/g, " ").replace(/\s+/g, " ").trim();
export const isPostal = (q: string) => /^\d{5}$/.test(q.trim());

interface RawCommune { nom: string; code: string; codesPostaux?: string[]; centre?: { coordinates: [number, number] }; departement?: { code: string; nom: string }; region?: { nom: string } }
const toCommune = (c: RawCommune): Commune | null => c.centre ? { code: c.code, nom: c.nom, codesPostaux: c.codesPostaux ?? [], lng: c.centre.coordinates[0], lat: c.centre.coordinates[1], departement: c.departement?.nom ?? "", depCode: c.departement?.code ?? "", region: c.region?.nom ?? "" } : null;

export class CommuneServiceError extends Error { constructor(public status?: number) { super(`Service des communes indisponible${status ? ` (${status})` : ""}`); } }

/** Cherche par code postal (5 chiffres, toutes les communes concernées) ou par nom (début de nom, communes les plus peuplées d'abord). */
export async function searchCommunes(query: string, signal?: AbortSignal, limit = 8): Promise<Commune[]> {
  const q = query.trim(); if (q.length < 2) return [];
  const url = isPostal(q) ? `${API}/communes?codePostal=${q}&fields=${FIELDS}&limit=60` : /^\d+$/.test(q) ? "" : `${API}/communes?nom=${encodeURIComponent(q)}&fields=${FIELDS}&boost=population&limit=${limit}`;
  if (!url) return []; // 2 à 4 chiffres : code postal incomplet
  let r: Response;
  try { r = await fetch(url, { signal }); } catch (e) { if ((e as Error).name === "AbortError") throw e; throw new CommuneServiceError(); }
  if (!r.ok) throw new CommuneServiceError(r.status);
  const list = ((await r.json()) as RawCommune[]).map(toCommune).filter((c): c is Commune => !!c);
  return isPostal(q) ? list.sort((a, b) => a.nom.localeCompare(b.nom, "fr")) : list;
}

let regionsP: Promise<Region[]> | null = null;
/** Régions (liste officielle, chargée une fois). */
export function loadRegions(signal?: AbortSignal): Promise<Region[]> {
  regionsP ??= fetch(`${API}/regions`, { signal }).then((r) => { if (!r.ok) throw new CommuneServiceError(r.status); return r.json() as Promise<Region[]>; }).catch((e) => { regionsP = null; throw e; });
  return regionsP;
}
/** Filtre local, sans accent ni casse ; les noms qui commencent par la saisie (ou dont un mot commence par elle) passent en premier. */
export function matchRegions(all: Region[], q: string, limit = 8): Region[] {
  const n = norm(q); if (!n) return [];
  const score = (r: Region) => { const x = norm(r.nom); return x.startsWith(n) ? 0 : x.split(" ").some((w) => w.startsWith(n)) ? 1 : x.includes(n) ? 2 : 9; };
  return all.map((r) => [r, score(r)] as const).filter(([, s]) => s < 9).sort((a, b) => a[1] - b[1] || a[0].nom.localeCompare(b[0].nom, "fr")).slice(0, limit).map(([r]) => r);
}
/** Libellé d'une commune pour les listes : « Digne-les-Bains (04000) · Alpes-de-Haute-Provence ». */
export const communeLabel = (c: Commune, postal?: string) => `${c.nom} (${postal && c.codesPostaux.includes(postal) ? postal : c.codesPostaux[0] ?? c.depCode})`;

export interface Suggestion { key: string; label: string; hint: string; communes: Commune[] }
/**
 * Suggestions de communes pour une saisie. Code postal (5 chiffres) : TOUTES les communes concernées, dans l'ordre alphabétique ;
 * `withGroup` ajoute en tête « Tout le code postal » (recherche de zone). Moins de 5 chiffres : aucune suggestion (`null`).
 */
export async function communeSuggestions(q: string, signal: AbortSignal, withGroup = false): Promise<Suggestion[] | null> {
  const t = q.trim(); if (/^\d{1,4}$/.test(t)) return null;
  const list = await searchCommunes(t, signal); const postal = isPostal(t) ? t : undefined;
  const out: Suggestion[] = list.map((c) => ({ key: c.code, label: communeLabel(c, postal), hint: [c.departement, c.region].filter(Boolean).join(" · "), communes: [c] }));
  if (withGroup && postal && list.length > 1) out.unshift({ key: `cp-${postal}`, label: `Tout le code postal ${postal}`, hint: `${list.length} communes : ${list.slice(0, 4).map((c) => c.nom).join(", ")}${list.length > 4 ? "…" : ""}`, communes: list });
  return out;
}
