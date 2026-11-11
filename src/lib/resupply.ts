import type { LL, PoiType } from "./types";
import { cumulative, simplifyIndices } from "./geo";

/**
 * Ravitaillement en itinérance : commerces alimentaires, restauration et points d'eau proches d'un tracé.
 * Source : OpenStreetMap via l'API Overpass (ODbL — données réutilisables et stockables avec attribution).
 * Ces lieux sont « potentiellement disponibles » : ni leur ouverture ni la potabilité de l'eau ne sont garanties.
 */
export type ResupplyKind = "bakery" | "grocery" | "supermarket" | "food" | "restaurant" | "water" | "spring";
export const RESUPPLY: Record<ResupplyKind, { label: string; color: string; poi: PoiType; letter: string; filters: string[] }> = {
  bakery: { label: "Boulangeries", color: "#c9822b", poi: "ravito", letter: "B", filters: ['["shop"="bakery"]', '["shop"="pastry"]'] },
  grocery: { label: "Épiceries et supérettes", color: "#2f8f5b", poi: "ravito", letter: "É", filters: ['["shop"="convenience"]', '["shop"="greengrocer"]', '["shop"="general"]', '["shop"="farm"]'] },
  supermarket: { label: "Supermarchés", color: "#2b5fa8", poi: "ravito", letter: "S", filters: ['["shop"="supermarket"]'] },
  food: { label: "Autres commerces alimentaires", color: "#8a5bb8", poi: "ravito", letter: "A", filters: ['["shop"="butcher"]', '["shop"="cheese"]', '["shop"="deli"]', '["shop"="dairy"]', '["amenity"="marketplace"]', '["amenity"="vending_machine"]["vending"~"food|bread|drinks|milk"]'] },
  restaurant: { label: "Restauration", color: "#c8443a", poi: "ravito", letter: "R", filters: ['["amenity"="restaurant"]', '["amenity"="cafe"]', '["amenity"="fast_food"]', '["amenity"="bar"]["food"="yes"]', '["tourism"="alpine_hut"]'] },
  water: { label: "Fontaines et eau potable", color: "#1f8fbf", poi: "eau", letter: "E", filters: ['["amenity"="drinking_water"]', '["amenity"="water_point"]', '["amenity"="fountain"]["drinking_water"="yes"]', '["man_made"="water_tap"]["drinking_water"!="no"]'] },
  spring: { label: "Sources (eau non contrôlée)", color: "#4aa8a0", poi: "eau", letter: "~", filters: ['["natural"="spring"]', '["man_made"="water_well"]["drinking_water"="yes"]'] },
};
export const RESUPPLY_KINDS = Object.keys(RESUPPLY) as ResupplyKind[];

export interface ResupplyPlace {
  id: string; kind: ResupplyKind; name: string; lng: number; lat: number;
  address: string; hours: string; phone: string; website: string;
  /** Eau : « yes » potable déclarée, « no » non potable, « » inconnu. */
  drinkable: string;
  /** Distance au tracé (m) et position le long du tracé (m). */
  offM: number; atM: number;
  /** Détour aller-retour estimé à vol d'oiseau (m) ; `detour` si le lieu n'est pas directement sur le parcours. */
  detourM: number; detour: boolean;
  osmUrl: string;
}

export const OVERPASS_MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
export class ResupplyError extends Error { constructor(public kind: "rate" | "server" | "network" | "too-long", public status?: number) { super(`Recherche de lieux : ${kind}${status ? ` (${status})` : ""}`); } }

/** Tronçons du tracé simplifié (≤ `per` sommets, le dernier sommet ouvre le suivant) : Overpass accepte un rayon autour d'une ligne. */
export function routeChunks(line: LL[], per = 60, tolM = 25): LL[][] {
  const s = simplifyIndices(line, tolM, 100000).map((i) => line[i]);
  if (s.length <= per) return [s];
  const out: LL[][] = []; for (let i = 0; i < s.length - 1; i += per - 1) out.push(s.slice(i, Math.min(s.length, i + per)));
  return out;
}
/** Requête Overpass QL : objets des catégories demandées à moins de `radiusM` de la ligne. */
export function buildQuery(chunk: LL[], kinds: ResupplyKind[], radiusM: number): string {
  const around = `(around:${Math.round(radiusM)},${chunk.map((p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(",")})`;
  const parts = kinds.flatMap((k) => RESUPPLY[k].filters.map((f) => `nwr${f}${around};`));
  return `[out:json][timeout:40];(${parts.join("")});out tags center 400;`;
}

interface OsmEl { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
export function kindOf(t: Record<string, string>): ResupplyKind | null {
  if (t.amenity === "drinking_water" || t.amenity === "water_point" || t.man_made === "water_tap" || (t.amenity === "fountain" && t.drinking_water === "yes")) return "water";
  if (t.natural === "spring" || t.man_made === "water_well") return "spring";
  if (t.shop === "bakery" || t.shop === "pastry") return "bakery";
  if (t.shop === "supermarket") return "supermarket";
  if (["convenience", "greengrocer", "general", "farm"].includes(t.shop)) return "grocery";
  if (["butcher", "cheese", "deli", "dairy"].includes(t.shop) || t.amenity === "marketplace" || t.amenity === "vending_machine") return "food";
  if (["restaurant", "cafe", "fast_food", "bar"].includes(t.amenity) || t.tourism === "alpine_hut") return "restaurant";
  return null;
}
const addressOf = (t: Record<string, string>) => [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), [t["addr:postcode"], t["addr:city"] ?? t["addr:hamlet"] ?? t["addr:place"]].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Position le long du tracé et distance au tracé (projection sur le segment le plus proche). */
export function locateOnRoute(p: LL, line: LL[], cum: number[]): { offM: number; atM: number } {
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180), ky = 110574; let best = Infinity, at = 0;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p[0]) * kx, ay = (line[i - 1][1] - p[1]) * ky, bx = (line[i][0] - p[0]) * kx, by = (line[i][1] - p[1]) * ky, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0, d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) { best = d; at = cum[i - 1] + (cum[i] - cum[i - 1]) * t; }
  }
  return { offM: best, atM: at };
}
/** Au-delà de cette distance au tracé, le lieu demande un détour. */
export const DETOUR_FROM_M = 150;

export function parsePlaces(els: OsmEl[], line: LL[]): ResupplyPlace[] {
  const cum = cumulative(line), seen = new Set<string>(), out: ResupplyPlace[] = [];
  for (const el of els) {
    const t = el.tags ?? {}, kind = kindOf(t); if (!kind) continue;
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon; if (lat == null || lng == null) continue;
    const id = `${el.type}/${el.id}`; if (seen.has(id)) continue; seen.add(id);
    if (t.access === "private" || t.access === "no" || t.disused === "yes" || t["disused:shop"] || t["disused:amenity"] || t.abandoned === "yes") continue; // lieux fermés ou privés déclarés
    const { offM, atM } = locateOnRoute([lng, lat], line, cum);
    out.push({
      id, kind, name: t.name ?? t.brand ?? t.operator ?? "", lng, lat, address: addressOf(t), hours: t.opening_hours ?? "", phone: t.phone ?? t["contact:phone"] ?? "", website: t.website ?? t["contact:website"] ?? "",
      drinkable: kind === "water" || kind === "spring" ? (t.drinking_water === "no" ? "no" : t.drinking_water === "yes" || t.amenity === "drinking_water" ? "yes" : "") : "",
      offM: Math.round(offM), atM: Math.round(atM), detourM: Math.round(offM * 2), detour: offM > DETOUR_FROM_M, osmUrl: `https://www.openstreetmap.org/${id}`,
    });
  }
  return out.sort((a, b) => a.atM - b.atM || a.offM - b.offM);
}

async function overpass(q: string, signal?: AbortSignal): Promise<OsmEl[]> {
  let last: ResupplyError = new ResupplyError("network");
  for (const url of OVERPASS_MIRRORS) {
    try {
      const r = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), signal });
      if (r.ok) return ((await r.json()) as { elements: OsmEl[] }).elements ?? [];
      last = new ResupplyError(r.status === 429 ? "rate" : "server", r.status);
    } catch (e) { if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); last = new ResupplyError("network"); }
  }
  throw last;
}

/** Longueur maximale traitée en une recherche (au-delà, découper le parcours en étapes). */
export const MAX_ROUTE_KM = 1500;
/** Cherche les lieux des catégories choisies à moins de `radiusM` du tracé. Requêtes séquentielles (serveurs publics, usage raisonnable). */
export async function findResupply(line: LL[], kinds: ResupplyKind[], radiusM: number, o: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<ResupplyPlace[]> {
  if (line.length < 2 || !kinds.length) return [];
  const cum = cumulative(line); if (cum[cum.length - 1] > MAX_ROUTE_KM * 1000) throw new ResupplyError("too-long");
  const chunks = routeChunks(line), all: OsmEl[] = [];
  for (let i = 0; i < chunks.length; i++) { all.push(...await overpass(buildQuery(chunks[i], kinds, radiusM), o.signal)); o.onProgress?.(i + 1, chunks.length); }
  return parsePlaces(all, line).filter((p) => p.offM <= radiusM * 1.05);
}
/** Texte d'avertissement à afficher avec tout résultat. */
export const RESUPPLY_NOTICE = "Lieux recensés par OpenStreetMap, potentiellement disponibles : l'ouverture d'un commerce, le débit d'une fontaine et la potabilité de l'eau ne sont pas garantis. Vérifiez avant de compter dessus.";
