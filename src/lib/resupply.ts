import type { LL, PoiType } from "./types";
import { cumulative, simplifyIndices } from "./geo";

/**
 * Ravitaillement en itinérance : commerces alimentaires, restauration et points d'eau proches d'un tracé.
 * Source : OpenStreetMap via l'API Overpass (ODbL — données réutilisables et stockables avec attribution).
 * Ces lieux sont « potentiellement disponibles » : ni leur ouverture ni la potabilité de l'eau ne sont garanties.
 */
export type ResupplyKind = "bakery" | "grocery" | "supermarket" | "food" | "restaurant" | "water" | "spring";
export const RESUPPLY: Record<ResupplyKind, { label: string; one: string; color: string; poi: PoiType; letter: string; filters: string[] }> = {
  bakery: { label: "Boulangeries", one: "Boulangerie", color: "#c9822b", poi: "ravito", letter: "B", filters: ['["shop"="bakery"]', '["shop"="pastry"]'] },
  grocery: { label: "Épiceries et supérettes", one: "Épicerie", color: "#2f8f5b", poi: "ravito", letter: "É", filters: ['["shop"="convenience"]', '["shop"="greengrocer"]', '["shop"="general"]', '["shop"="farm"]'] },
  supermarket: { label: "Supermarchés", one: "Supermarché", color: "#2b5fa8", poi: "ravito", letter: "S", filters: ['["shop"="supermarket"]'] },
  food: { label: "Autres commerces alimentaires", one: "Commerce alimentaire", color: "#8a5bb8", poi: "ravito", letter: "A", filters: ['["shop"="butcher"]', '["shop"="cheese"]', '["shop"="deli"]', '["shop"="dairy"]', '["amenity"="marketplace"]', '["amenity"="vending_machine"]["vending"~"food|bread|drinks|milk"]'] },
  restaurant: { label: "Restauration", one: "Restaurant", color: "#c8443a", poi: "ravito", letter: "R", filters: ['["amenity"="restaurant"]', '["amenity"="cafe"]', '["amenity"="fast_food"]', '["amenity"="bar"]["food"="yes"]', '["tourism"="alpine_hut"]'] },
  water: { label: "Fontaines et eau potable", one: "Point d'eau potable", color: "#1f8fbf", poi: "eau", letter: "E", filters: ['["amenity"="drinking_water"]', '["amenity"="water_point"]', '["amenity"="fountain"]["drinking_water"="yes"]', '["man_made"="water_tap"]["drinking_water"!="no"]'] },
  spring: { label: "Sources (eau non contrôlée)", one: "Source", color: "#4aa8a0", poi: "eau", letter: "~", filters: ['["natural"="spring"]', '["man_made"="water_well"]["drinking_water"="yes"]'] },
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

// ── Préparation d'une itinérance : familles, tronçons sans ravitaillement, étapes ──
export type ResupplyFamily = "water" | "food" | "meal";
export const FAMILY: Record<ResupplyFamily, { label: string; kinds: ResupplyKind[] }> = {
  water: { label: "Eau", kinds: ["water", "spring"] },
  food: { label: "Courses", kinds: ["bakery", "grocery", "supermarket", "food"] },
  meal: { label: "Repas", kinds: ["restaurant"] },
};
export const familyOf = (k: ResupplyKind): ResupplyFamily => (k === "water" || k === "spring" ? "water" : k === "restaurant" ? "meal" : "food");
/** Raccourcis de recherche. */
export const PRESETS: { id: string; label: string; kinds: ResupplyKind[] }[] = [
  { id: "essentiel", label: "Essentiel", kinds: ["bakery", "grocery", "supermarket", "water"] },
  { id: "eau", label: "Eau seulement", kinds: ["water", "spring"] },
  { id: "courses", label: "Courses", kinds: ["bakery", "grocery", "supermarket", "food"] },
  { id: "repas", label: "Repas", kinds: ["restaurant"] },
  { id: "tout", label: "Tout", kinds: RESUPPLY_KINDS },
];

export interface Gap { fromM: number; toM: number; lengthM: number }
/**
 * Tronçons du parcours sans lieu d'une famille : écarts entre lieux consécutifs (départ et arrivée compris), du plus long au plus court.
 * Sert à repérer « 38 km sans point d'eau » avant de partir. Les sources (eau non contrôlée) ne comptent pas comme point d'eau sûr si `strict`.
 */
export function gaps(places: ResupplyPlace[], totalM: number, family: ResupplyFamily, o: { strict?: boolean; maxOffM?: number } = {}): Gap[] {
  const at = places.filter((p) => familyOf(p.kind) === family && (!o.strict || p.kind !== "spring") && (o.maxOffM == null || p.offM <= o.maxOffM)).map((p) => p.atM).sort((a, b) => a - b);
  const marks = [0, ...at, totalM], out: Gap[] = [];
  for (let i = 1; i < marks.length; i++) { const l = marks[i] - marks[i - 1]; if (l > 0) out.push({ fromM: marks[i - 1], toM: marks[i], lengthM: l }); }
  return out.sort((a, b) => b.lengthM - a.lengthM);
}
export interface Section { index: number; fromM: number; toM: number; places: ResupplyPlace[]; counts: Record<ResupplyFamily, number> }
/** Découpe le parcours en tronçons de `sectionKm` (étapes indicatives) et y range les lieux, dans l'ordre de marche. */
export function sections(places: ResupplyPlace[], totalM: number, sectionKm: number): Section[] {
  const step = Math.max(1, sectionKm) * 1000, n = Math.max(1, Math.ceil(totalM / step)), out: Section[] = [];
  for (let i = 0; i < n; i++) out.push({ index: i, fromM: i * step, toM: Math.min(totalM, (i + 1) * step), places: [], counts: { water: 0, food: 0, meal: 0 } });
  for (const p of [...places].sort((a, b) => a.atM - b.atM || a.offM - b.offM)) { const s = out[Math.min(n - 1, Math.floor(p.atM / step))]; s.places.push(p); s.counts[familyOf(p.kind)]++; }
  return out;
}
/** Tableau CSV des lieux (pour l'imprimer ou l'emporter). */
export function placesCsv(places: ResupplyPlace[]): string {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  return ["Km;Catégorie;Nom;Distance au tracé (m);Détour aller-retour à vol d'oiseau (m);Adresse;Horaires déclarés;Téléphone;Latitude;Longitude", ...[...places].sort((a, b) => a.atM - b.atM).map((p) => [(p.atM / 1000).toFixed(1).replace(".", ","), q(RESUPPLY[p.kind].label), q(p.name || "Sans nom"), p.offM, p.detour ? p.detourM : 0, q(p.address), q(p.hours), q(p.phone), p.lat.toFixed(5), p.lng.toFixed(5)].join(";"))].join("\r\n");
}

/** Pictogrammes des catégories (grille 24×24, mêmes conventions que les POI : `f` forme pleine, `s` trait). */
export const RESUPPLY_GLYPHS: Record<ResupplyKind, { d: string; kind: "f" | "s" }[]> = {
  bakery: [{ kind: "f", d: "M4.2 15.8c-1.6-1.6-.6-4.6 2.300-7.500s6.200-4.100 7.800-2.500l5.500 5.500c1.600 1.600.6 4.300-1.500 6.400s-4.800 3.100-6.400 1.500z" }, { kind: "s", d: "M9 9.500l2 2M12 7.500l2 2" }],
  grocery: [{ kind: "s", d: "M3.500 9.500h17l-1.700 9.300a1.600 1.600 0 0 1-1.600 1.300H6.800a1.600 1.600 0 0 1-1.600-1.300zM8 9.500l3-6M16 9.500l-3-6" }],
  supermarket: [{ kind: "s", d: "M2.500 3.500h3l2.300 11.200a1.500 1.500 0 0 0 1.500 1.200h8.200a1.500 1.500 0 0 0 1.500-1.200L20.500 7.500H6.300" }, { kind: "f", d: "M9.500 18.300a1.600 1.600 0 1 1 0 3.200 1.600 1.600 0 0 1 0-3.200zM17.500 18.300a1.600 1.600 0 1 1 0 3.200 1.600 1.600 0 0 1 0-3.200z" }],
  food: [{ kind: "f", d: "M12 7.200c1.600-1.600 4.200-1.700 5.900-.3 2 1.600 2.300 4.900.9 7.900-1.300 2.900-3.300 5.200-5.200 5.200-.6 0-1.100-.2-1.600-.5-.5.3-1 .5-1.600.5-1.900 0-3.900-2.300-5.200-5.200-1.400-3-1.100-6.300.9-7.900 1.700-1.400 4.300-1.300 5.900.3z" }, { kind: "s", d: "M12 7c0-1.800.8-3.200 2.300-4" }],
  restaurant: [{ kind: "s", d: "M6 3v5.500a2.500 2.500 0 0 0 5 0V3M8.500 3v18" }, { kind: "f", d: "M14.600 3c2.600.9 4.400 4 4.400 7.600 0 1.500-.7 2.600-2.100 2.600h-.5V21h-1.800z" }],
  water: [{ kind: "f", d: "M12 2.600c3.100 3.900 5.200 6.800 5.200 9.300a5.200 5.200 0 0 1-10.400 0c0-2.500 2.100-5.400 5.200-9.300z" }, { kind: "s", d: "M4.500 20.600c1.900-1.500 3.600-1.500 5 0s3.400 1.500 5 0 3.100-1.500 5 0" }],
  spring: [{ kind: "s", d: "M3.500 8.500c2-1.600 3.700-1.600 5.700 0s3.700 1.600 5.700 0 3.700-1.600 5.600 0M3.500 13.500c2-1.600 3.700-1.600 5.700 0s3.700 1.600 5.700 0 3.700-1.600 5.600 0M3.500 18.500c2-1.600 3.700-1.600 5.700 0s3.700 1.600 5.700 0 3.700-1.600 5.600 0" }],
};
const cleanD = (d: string) => d.replace(/(\.\d*?)0+(?=\D|$)/g, "$1").replace(/\.(?=\D|$)/g, "");
export const resupplyGlyph = (k: ResupplyKind) => RESUPPLY_GLYPHS[k].map((g) => ({ ...g, d: cleanD(g.d) }));
/** SVG du pictogramme (blanc par défaut) : marqueurs de carte et listes. */
export const resupplyIconSvg = (k: ResupplyKind, px = 16, color = "#fff") => `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true">${resupplyGlyph(k).map((g) => g.kind === "f" ? `<path d="${g.d}" fill="${color}"/>` : `<path d="${g.d}" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}</svg>`;
