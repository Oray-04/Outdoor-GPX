import type { LL, PoiType } from "./types";
import { cumulative, haversine, simplifyIndices } from "./geo";

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

/** Serveurs Overpass publics couvrant le monde entier, essayés dans l'ordre (celui qui a répondu en dernier passe en tête). */
export const OVERPASS_MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
export type ResupplyErrorKind = "rate" | "server" | "timeout" | "network" | "offline" | "too-long";
export class ResupplyError extends Error { constructor(public kind: ResupplyErrorKind, public status?: number, public tried: string[] = []) { super(`Recherche de lieux : ${kind}${status ? ` (${status})` : ""}`); } }

/**
 * Tronçons du tracé simplifié : au plus `per` sommets et `maxLenM` mètres chacun, le dernier sommet ouvrant le suivant (aucun trou).
 * La longueur est bornée parce que les serveurs publics interrompent une recherche trop étendue (mesuré en zone dense : 60 km échouent, 25 km souvent).
 */
export function routeChunks(line: LL[], per = 60, tolM = 25, maxLenM = Infinity): LL[][] {
  const raw = simplifyIndices(line, tolM, 100000).map((i) => line[i]), s: LL[] = [raw[0]];
  // un long segment droit est recoupé : sinon un seul tronçon pourrait couvrir des dizaines de kilomètres
  for (let i = 1; i < raw.length; i++) { const n = Number.isFinite(maxLenM) ? Math.ceil(haversine(raw[i - 1], raw[i]) / maxLenM) : 1; for (let k = 1; k <= n; k++) s.push(k === n ? raw[i] : [raw[i - 1][0] + ((raw[i][0] - raw[i - 1][0]) * k) / n, raw[i - 1][1] + ((raw[i][1] - raw[i - 1][1]) * k) / n]); }
  const out: LL[][] = []; let cur: LL[] = [s[0]], len = 0;
  for (let i = 1; i < s.length; i++) {
    cur.push(s[i]); len += haversine(s[i - 1], s[i]);
    if (i < s.length - 1 && (cur.length >= per || len >= maxLenM)) { out.push(cur); cur = [s[i]]; len = 0; }
  }
  out.push(cur);
  return out;
}
/** Longueur de tronçon selon le rayon (10 km jusqu'à 500 m, 5 km à 2 km, 4 km au-delà) : mesuré sur 300 km, des tronçons courts répondent en 2 s environ, alors que des tronçons de 25 km sont souvent interrompus au bout de 25 s. */
export const chunkLengthM = (radiusM: number) => Math.round(Math.min(10000, Math.max(4000, 10000 * Math.sqrt(500 / Math.max(1, radiusM)))));
/** Coupe un tronçon en deux moitiés qui partagent un sommet (un segment unique est coupé en son milieu). */
export function splitChunk(c: LL[]): [LL[], LL[]] {
  if (c.length === 2) { const m: LL = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2]; return [[c[0], m], [m, c[1]]]; }
  const k = Math.floor(c.length / 2); return [c.slice(0, k + 1), c.slice(k)];
}
/**
 * Requête Overpass QL : objets des catégories demandées à moins de `radiusM` de la ligne.
 * Les filtres simples d'une même clé sont réunis en une seule expression (une recherche par clé au lieu d'une par valeur) :
 * la requête est 4 à 5 fois plus légère, donc moins souvent refusée ou interrompue par les serveurs publics.
 */
export function buildQuery(chunk: LL[], kinds: ResupplyKind[], radiusM: number): string {
  const around = `(around:${Math.round(radiusM)},${chunk.map((p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(",")})`;
  const byKey = new Map<string, Set<string>>(), complex = new Set<string>();
  for (const f of kinds.flatMap((k) => RESUPPLY[k].filters)) { const m = /^\["([\w:]+)"="([\w:]+)"\]$/.exec(f); if (m) (byKey.get(m[1]) ?? byKey.set(m[1], new Set()).get(m[1])!).add(m[2]); else complex.add(f); }
  const parts = [...[...byKey].map(([k, v]) => (v.size === 1 ? `nwr["${k}"="${[...v][0]}"]${around};` : `nwr["${k}"~"^(${[...v].join("|")})$"]${around};`)), ...[...complex].map((f) => `nwr${f}${around};`)];
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];(${parts.join("")});out tags center ${MAX_PER_QUERY};`;
}
/** Durée accordée au serveur pour une requête, et nombre maximal d'objets par tronçon (au-delà, le tronçon est signalé comme tronqué). */
export const QUERY_TIMEOUT_S = 25, MAX_PER_QUERY = 3000;

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

const RANK: Record<ResupplyErrorKind, number> = { rate: 5, server: 4, timeout: 3, network: 2, offline: 1, "too-long": 0 };
let preferred = 0;
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Aborted", "AbortError")); }, { once: true }); });
export interface OverpassOptions { signal?: AbortSignal; mirrors?: string[]; /** délai par serveur (ms) */ timeoutMs?: number; /** attentes avant chaque nouvelle série d'essais (ms) */ retryWaits?: number[] }

/**
 * Interroge les serveurs Overpass : délai d'attente par serveur, passage au serveur suivant, puis nouvelles séries d'essais espacées
 * (les serveurs publics refusent souvent une requête pendant quelques secondes). L'erreur remontée est la plus parlante rencontrée
 * (limite de requêtes > erreur du serveur > délai dépassé > injoignable), et non celle du dernier serveur essayé.
 */
export async function overpass(q: string, o: OverpassOptions = {}): Promise<{ elements: OsmEl[]; truncated: boolean }> {
  const mirrors = o.mirrors ?? OVERPASS_MIRRORS, waits = o.retryWaits ?? [3000, 8000], tried: string[] = [];
  let best: ResupplyError | null = null;
  const keep = (e: ResupplyError) => { if (!best || RANK[e.kind] > RANK[best.kind]) best = e; };
  for (let round = 0; round <= waits.length; round++) {
    if (round > 0) await pause(waits[round - 1], o.signal);
    for (let k = 0; k < mirrors.length; k++) {
      const idx = ((o.mirrors ? 0 : preferred) + k) % mirrors.length, url = mirrors[idx], host = new URL(url).host;
      const c = new AbortController(); let timedOut = false;
      const onAbort = () => c.abort(); o.signal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; c.abort(); }, o.timeoutMs ?? (QUERY_TIMEOUT_S + 10) * 1000);
      try {
        const r = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), signal: c.signal });
        if (!r.ok) { tried.push(`${host} : ${r.status}`); keep(new ResupplyError(r.status === 429 ? "rate" : "server", r.status)); continue; }
        let j: { elements?: OsmEl[]; remark?: string };
        try { j = await r.json(); } catch { tried.push(`${host} : réponse illisible`); keep(new ResupplyError("server", r.status)); continue; }
        // Overpass répond parfois 200 avec une remarque d'erreur (requête interrompue, mémoire) et un résultat vide ou partiel
        if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) { tried.push(`${host} : ${j.remark.slice(0, 60)}`); keep(new ResupplyError(/timed out/i.test(j.remark) ? "timeout" : "server", r.status)); continue; }
        if (!o.mirrors) preferred = idx;
        const elements = j.elements ?? [];
        return { elements, truncated: elements.length >= MAX_PER_QUERY };
      } catch {
        if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        tried.push(`${host} : ${timedOut ? "délai dépassé" : "injoignable"}`); keep(new ResupplyError(timedOut ? "timeout" : "network"));
      } finally { clearTimeout(timer); o.signal?.removeEventListener("abort", onAbort); }
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { best = new ResupplyError("offline"); break; }
  }
  const e = best ?? new ResupplyError("network"); e.tried = tried; throw e;
}

/** Longueur maximale traitée en une recherche (au-delà, découper le parcours en étapes). */
export const MAX_ROUTE_KM = 1500;
export interface ResupplyReport { chunks: number; failed: number; truncated: number; /** bornes (m) des tronçons non interrogés */ failedRanges: [number, number][]; error?: ResupplyError }
export interface FindOptions extends OverpassOptions { onProgress?: (done: number, total: number) => void; /** bilan : tronçons en échec ou tronqués (résultat partiel) */ onReport?: (r: ResupplyReport) => void; /** pause entre deux tronçons (ms) */ gapMs?: number }
/**
 * Cherche les lieux des catégories choisies à moins de `radiusM` du tracé. Requêtes l'une après l'autre, avec une courte pause
 * (serveurs publics, usage raisonnable). Un tronçon en échec n'annule pas les autres : le résultat partiel est rendu et signalé par
 * `onReport` ; l'erreur n'est levée que si aucun tronçon n'a répondu.
 */
export async function findResupply(line: LL[], kinds: ResupplyKind[], radiusM: number, o: FindOptions = {}): Promise<ResupplyPlace[]> {
  if (line.length < 2 || !kinds.length) return [];
  const cum = cumulative(line); if (cum[cum.length - 1] > MAX_ROUTE_KM * 1000) throw new ResupplyError("too-long");
  // plus le rayon est large, moins le détail du tracé compte : moins de sommets, donc moins de tronçons et des requêtes plus légères
  const chunks = routeChunks(line, 80, Math.min(200, Math.max(25, radiusM * 0.2)), chunkLengthM(radiusM)), all: OsmEl[] = [];
  // tronçon refusé pour cause de recherche trop lourde (interrompue ou tronquée) : on le coupe en deux et on recommence, jusqu'à 3 fois
  const ask = async (c: LL[], depth: number): Promise<{ elements: OsmEl[]; truncated: boolean }> => {
    const splittable = depth < 3 && (c.length > 2 || haversine(c[0], c[c.length - 1]) > 1000);
    let r: { elements: OsmEl[]; truncated: boolean } | null = null;
    try { r = await overpass(buildQuery(c, kinds, radiusM), o); if (!r.truncated || !splittable) return r; }
    catch (e) { const k = (e as ResupplyError).kind; if ((e as Error).name === "AbortError" || !splittable || (k !== "timeout" && k !== "server")) throw e; }
    const [a, b] = splitChunk(c), ra = await ask(a, depth + 1); await pause(o.gapMs ?? 400, o.signal); const rb = await ask(b, depth + 1);
    return { elements: [...ra.elements, ...rb.elements], truncated: ra.truncated || rb.truncated };
  };
  const rep: ResupplyReport = { chunks: chunks.length, failed: 0, truncated: 0, failedRanges: [] };
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await pause(o.gapMs ?? 400, o.signal);
    try { const r = await ask(chunks[i], 0); all.push(...r.elements); if (r.truncated) rep.truncated++; }
    catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      rep.failed++; rep.error = e as ResupplyError;
      const a = locateOnRoute(chunks[i][0], line, cum).atM, b = locateOnRoute(chunks[i][chunks[i].length - 1], line, cum).atM; rep.failedRanges.push([Math.min(a, b), Math.max(a, b)]);
      if (rep.failed === i + 1 && i >= 1) break; // les deux premiers tronçons ont échoué malgré les reprises : inutile d'insister sur tout le parcours
    }
    o.onProgress?.(i + 1, chunks.length);
  }
  if (rep.failed && all.length === 0 && rep.failed >= Math.min(chunks.length, 2)) throw rep.error!;
  if (rep.failed === chunks.length) throw rep.error!;
  o.onReport?.(rep);
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
