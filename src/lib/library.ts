import type { Pt, SavedRoute } from "./types";
import type { Sport } from "./sports";
import { fromTrack } from "./editor-core";
import { haversine, trackStats } from "./geo";
import { BASE } from "./url";

/**
 * Bibliothèque d'itinéraires de référence (GR, grandes traversées, véloroutes…).
 * Les tracés sont des données OpenStreetMap (ODbL 1.0) intégrées au site (`public/library`), construites par
 * `scripts/library/build.mjs`. Chaque itinéraire garde sa source, sa licence et un contrôle de validité.
 */
export type LibCategory = "randonnee" | "gr" | "route" | "vtt" | "gravel" | "traversee" | "montagne" | "europe";
export const CATEGORIES: { id: LibCategory; label: string; hint: string }[] = [
  { id: "randonnee", label: "Randonnée pédestre", hint: "Itinéraires de randonnée à la journée ou itinérante" },
  { id: "gr", label: "GR et GRP", hint: "Sentiers de Grande Randonnée et de Grande Randonnée de Pays" },
  { id: "route", label: "Cyclisme sur route", hint: "Cols et circuits routiers" },
  { id: "vtt", label: "VTT", hint: "Grandes traversées et itinéraires VTT" },
  { id: "gravel", label: "Gravel", hint: "Itinéraires gravel" },
  { id: "traversee", label: "Grandes traversées", hint: "Traversées de régions ou de massifs" },
  { id: "montagne", label: "Parcours de montagne", hint: "Itinéraires de moyenne et haute montagne" },
  { id: "europe", label: "Itinéraires européens", hint: "EuroVelo et grands itinéraires internationaux" },
];

export interface LibSource { name: string; url: string; relation: number; license: string; attribution: string; elevation: string; retrieved: string }
export interface LibQuality { gaps: number; maxGapM: number; totalGapM: number; missingEle: number; osmDeclaredKm: number | null; rawKm: number; subRelations: number }
export interface LibEntry {
  id: string; name: string; osmName: string | null; ref: string | null; category: LibCategory; practice: string; region: string; country: string;
  from: string | null; to: string | null; operator: string | null;
  distanceM: number; gainM: number; lossM: number; minEle: number; maxEle: number;
  start: [number, number]; end: [number, number]; loop: boolean; bbox: [number, number, number, number]; points: number;
  source: LibSource; hash: string; quality: LibQuality;
}

export const PRACTICE_LABEL: Record<string, string> = { randonnee: "Randonnée", vtt: "VTT", route: "Route", gravel: "Gravel", "velo-route": "Véloroute (route / voie verte)" };
export const practiceSport = (p: string): Sport => (p === "vtt" ? "vtt" : p === "gravel" ? "gravel" : p === "route" || p === "velo-route" ? "velo" : "rando");

const url = (p: string) => `${BASE}/library/${p}`;
let indexP: Promise<LibEntry[]> | null = null;
/** Index des itinéraires (chargé une fois). */
export function loadIndex(): Promise<LibEntry[]> {
  indexP ??= fetch(url("index.json")).then((r) => { if (!r.ok) throw new Error(`Bibliothèque indisponible (${r.status})`); return r.json() as Promise<LibEntry[]>; }).catch((e) => { indexP = null; throw e; });
  return indexP;
}
const routeCache = new Map<string, Pt[]>();
export async function loadCoords(id: string): Promise<Pt[]> {
  const c = routeCache.get(id); if (c) return c;
  const r = await fetch(url(`routes/${encodeURIComponent(id)}.json`)); if (!r.ok) throw new Error(`Tracé indisponible (${r.status})`);
  const j = (await r.json()) as { coords: Pt[] }; routeCache.set(id, j.coords); return j.coords;
}

/** Contrôle de validité d'un tracé (bibliothèque comme GPX importé) : liste de problèmes, vide si le tracé est exploitable. */
export function validateCoords(coords: readonly (readonly number[])[], opts: { maxJumpM?: number } = {}): string[] {
  const out: string[] = [];
  if (coords.length < 2) return ["Moins de 2 points."];
  const maxJump = opts.maxJumpM ?? 5000;
  let bad = 0, worst = 0, dup = 0, d = 0;
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1]) || Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) { bad++; continue; }
    if (c.length > 2 && !Number.isFinite(c[2])) bad++;
    if (i > 0 && Number.isFinite(coords[i - 1][0])) { const s = haversine(coords[i - 1] as [number, number], c as [number, number]); d += s; worst = Math.max(worst, s); if (s < 0.01) dup++; }
  }
  if (bad) out.push(`${bad} point(s) aux coordonnées invalides.`);
  if (d < 100) out.push("Tracé de moins de 100 m.");
  if (worst > maxJump) out.push(`Saut de ${Math.round(worst / 100) / 10} km entre deux points consécutifs (trace interrompue ?).`);
  if (dup > coords.length * 0.5) out.push("Plus de la moitié des points sont en double.");
  return out;
}
/** Problèmes de qualité d'une entrée (trous d'assemblage, altitudes manquantes, écart de longueur avec la valeur déclarée dans la source). */
export function entryIssues(e: LibEntry): string[] {
  const out: string[] = [];
  if (e.quality.maxGapM > 2000) out.push(`Trou de ${(e.quality.maxGapM / 1000).toFixed(1).replace(".", ",")} km dans l'assemblage des tronçons.`);
  if (e.quality.missingEle > e.points * 0.1) out.push("Altitudes manquantes (interpolées) sur plus de 10 % du tracé.");
  if (e.quality.osmDeclaredKm && Math.abs(e.distanceM / 1000 - e.quality.osmDeclaredKm) / e.quality.osmDeclaredKm > 0.25) out.push(`Longueur mesurée (${Math.round(e.distanceM / 1000)} km) éloignée de celle déclarée par la source (${e.quality.osmDeclaredKm} km).`);
  return out;
}

/** Empreinte de comparaison : même nom normalisé ou même géométrie (début/fin/longueur) = doublon. */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function findDuplicates(entries: LibEntry[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i], b = entries[j];
    if (a.hash === b.hash || a.source.relation === b.source.relation || norm(a.name) === norm(b.name)) { out.push([a.id, b.id]); continue; }
    const near = haversine(a.start, b.start) < 300 && haversine(a.end, b.end) < 300, sameLen = Math.abs(a.distanceM - b.distanceM) / Math.max(a.distanceM, 1) < 0.02;
    if (near && sameLen) out.push([a.id, b.id]);
  }
  return out;
}

/** Texte de source/licence à joindre à tout fichier exporté. */
export const attributionText = (e: LibEntry) => `Tracé : ${e.source.attribution} (licence ${e.source.license}) — ${e.source.url}. Altitudes : ${e.source.elevation}. Itinéraire non officiel : vérifiez le balisage et la réglementation locale.`;

/** Copie dans « Mes parcours » (éditable, exportable, utilisable avec tous les outils du site). `layer` reste « mine ». */
export function toSavedRoute(e: LibEntry, coords: Pt[], id: string): SavedRoute {
  const st = fromTrack(coords, [], 25); const now = Date.now();
  return {
    id, name: e.name, description: `${PRACTICE_LABEL[e.practice] ?? e.practice} · ${e.from && e.to ? `${e.from} → ${e.to} · ` : ""}${attributionText(e)}`,
    sport: practiceSport(e.practice), segs: st.segs, waypoints: st.waypoints, coords, pois: [], terrain: [], visibility: "prive",
    region: e.region, country: e.country === "EU" ? "" : e.country, source: "import", fileName: `${e.id}.gpx`, sourceUrl: e.source.url, createdAt: now, updatedAt: now,
  };
}
/** Statistiques recalculées sur le tracé stocké (mêmes règles que partout sur le site). */
export const statsOf = (coords: Pt[]) => trackStats(coords, 3);
