import type { LL } from "./types";
import { cumulative, haversine, simplifyIndices } from "./geo";

/**
 * Analyse cadastrale et réglementaire d'un tracé (aide à la préparation d'un événement).
 * Sources publiques de l'IGN : API Carto (parcelles cadastrales) et Géoplateforme (BD TOPO : tronçons de chemins,
 * forêts publiques, parcs et réserves). Les résultats NE valident AUCUN droit de passage.
 */
export interface Ring { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] }
export interface ParcelHit { id: string; ref: string; commune: string; insee: string; section: string; numero: string; areaM2: number; lengthM: number; geometry: Ring }
export interface Portion { fromM: number; toM: number; nature: string; prive: boolean | null; itineraire: string; gr: boolean; matched: boolean }
export interface ZoneHit { id: string; kind: "foret" | "parc"; name: string; nature: string; lengthM: number; geometry: Ring }
export interface RouteLabel { ref: string; name: string; group: string }

// ── Géométrie ──
const kx = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180), KY = 110574;

/** Points du tracé espacés d'environ `stepM` mètres, avec leur distance cumulée. */
export function resample(line: LL[], stepM: number): { p: LL; d: number }[] {
  if (line.length < 2) return line.map((p) => ({ p, d: 0 }));
  const cum = cumulative(line), total = cum[cum.length - 1];
  const out: { p: LL; d: number }[] = []; let i = 0;
  for (let d = 0; d <= total; d += stepM) {
    while (i < line.length - 2 && cum[i + 1] < d) i++;
    const seg = cum[i + 1] - cum[i], t = seg > 0 ? (d - cum[i]) / seg : 0;
    out.push({ p: [line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t], d });
  }
  const last = line[line.length - 1]; if (out[out.length - 1].d < total - 0.5) out.push({ p: last, d: total });
  return out;
}

/** Point dans un anneau (lancer de rayon). */
const inRing = (p: LL, r: number[][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > p[1]) !== (r[j][1] > p[1]) && p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; } return c; };
export function inGeometry(p: LL, g: Ring): boolean {
  const polys = (g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]));
  return polys.some((rings) => inRing(p, rings[0]) && !rings.slice(1).some((h) => inRing(p, h)));
}
const bboxOfGeom = (g: Ring): [number, number, number, number] => { let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; const walk = (a: unknown): void => { if (typeof (a as number[])[0] === "number") { const c = a as number[]; w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else (a as unknown[]).forEach(walk); }; walk(g.coordinates); return [w, s, e, n]; };

/** Longueur du tracé (m) située dans chaque géométrie : échantillonnage tous les `stepM` mètres. */
export function lengthInside(samples: { p: LL; d: number }[], geoms: Ring[], stepM: number): number[] {
  const boxes = geoms.map(bboxOfGeom), out = geoms.map(() => 0);
  for (const s of samples) for (let i = 0; i < geoms.length; i++) {
    const b = boxes[i];
    if (s.p[0] < b[0] || s.p[0] > b[2] || s.p[1] < b[1] || s.p[1] > b[3]) continue;
    if (inGeometry(s.p, geoms[i])) { out[i] += stepM; break; } // les parcelles ne se chevauchent pas
  }
  return out;
}

/** Distance (m) d'un point à une polyligne (approximation plane locale). */
export function distToLine(p: LL, line: number[][]): number {
  const x = kx(p[1]), best = { d: Infinity };
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1][0] - p[0]) * x, ay = (line[i - 1][1] - p[1]) * KY, bx = (line[i][0] - p[0]) * x, by = (line[i][1] - p[1]) * KY;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    best.d = Math.min(best.d, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best.d;
}

/** Fenêtres de `size` sommets successifs (le dernier sommet d'une fenêtre ouvre la suivante). */
export function windows<T>(pts: T[], size: number): T[][] { if (pts.length <= size) return [pts]; const out: T[][] = []; for (let i = 0; i < pts.length - 1; i += size - 1) out.push(pts.slice(i, Math.min(pts.length, i + size))); return out; }
export const simplifyLine = (line: LL[], tolM: number): LL[] => simplifyIndices(line, tolM, 100000).map((i) => line[i]);

// ── Références cadastrales ──
export interface ParcelProps { idu?: string; numero: string; section: string; code_insee: string; com_abs?: string; nom_com: string; contenance?: number }
/** Référence lisible : « 74056 0G 4352 » (commune INSEE, section, numéro) ; préfixe de commune absorbée ajouté si présent. */
export const parcelRef = (p: ParcelProps) => `${p.code_insee}${p.com_abs && p.com_abs !== "000" ? ` (${p.com_abs})` : ""} ${p.section} ${p.numero}`;

// ── Itinéraires de randonnée ──
export const GR_RE = /(^|[^A-Za-zÀ-ÿ])(GR|GRP)(\s?®)?\s?\d*([^A-Za-zÀ-ÿ]|$)|Grande Randonnée/i;
export const isGR = (s: string) => GR_RE.test(s);

export interface Troncon { id: string; nature: string; prive: boolean | null; accesPieton: string | null; itineraire: string; geometry: number[][] }

/** Rattache chaque point du tracé au tronçon le plus proche (≤ `maxM`), puis regroupe les points consécutifs de même nature. */
export function classify(samples: { p: LL; d: number }[], troncons: Troncon[], maxM = 15): Portion[] {
  const portions: Portion[] = [];
  const keyOf = (t: Troncon | null) => (t ? `${t.nature}|${t.prive}|${t.itineraire}` : "?");
  let cur: { key: string; t: Troncon | null; from: number; to: number } | null = null;
  const flush = () => { if (cur) portions.push({ fromM: cur.from, toM: cur.to, nature: cur.t?.nature ?? "Hors réseau recensé", prive: cur.t ? cur.t.prive : null, itineraire: cur.t?.itineraire ?? "", gr: !!cur.t && isGR(cur.t.itineraire), matched: !!cur.t }); };
  for (const s of samples) {
    let best: Troncon | null = null, bd = maxM;
    for (const t of troncons) { const d = distToLine(s.p, t.geometry); if (d <= bd) { bd = d; best = t; } }
    const key = keyOf(best);
    if (cur && cur.key === key) cur.to = s.d; else { flush(); cur = { key, t: best, from: s.d, to: s.d }; }
  }
  flush();
  return portions.map((x) => ({ ...x, toM: Math.max(x.toM, x.fromM) }));
}

export interface Summary { byNature: { nature: string; km: number }[]; priveKm: number; nonPriveKm: number; inconnuKm: number; itineraires: { name: string; km: number; gr: boolean }[]; grKm: number }
export function summarize(portions: Portion[]): Summary {
  const len = (p: Portion) => p.toM - p.fromM, km = (m: number) => m / 1000;
  const nat = new Map<string, number>(), it = new Map<string, { m: number; gr: boolean }>();
  let priv = 0, ok = 0, unk = 0, gr = 0;
  for (const p of portions) {
    const l = len(p); nat.set(p.nature, (nat.get(p.nature) ?? 0) + l);
    if (!p.matched || p.prive === null) unk += l; else if (p.prive) priv += l; else ok += l;
    if (p.gr) gr += l;
    if (p.itineraire) for (const n of p.itineraire.split("/").map((x) => x.trim()).filter(Boolean)) { const e = it.get(n) ?? { m: 0, gr: isGR(n) }; e.m += l; it.set(n, e); }
  }
  return { byNature: [...nat].sort((a, b) => b[1] - a[1]).map(([nature, m]) => ({ nature, km: km(m) })), priveKm: km(priv), nonPriveKm: km(ok), inconnuKm: km(unk), itineraires: [...it].sort((a, b) => b[1].m - a[1].m).map(([name, v]) => ({ name, km: km(v.m), gr: v.gr })), grKm: km(gr) };
}

// ── Accès aux services ──
const CARTO = "https://apicarto.ign.fr/api/cadastre/parcelle";
const WFS = "https://data.geopf.fr/wfs/ows";
const wkt = (l: LL[]) => `SRID=4326;LINESTRING(${l.map((p) => `${p[0].toFixed(6)} ${p[1].toFixed(6)}`).join(",")})`;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { signal });
    if (r.ok) return (await r.json()) as T;
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 700 * (a + 1))); continue; }
    throw new Error(`Service indisponible (${r.status})`);
  }
  throw new Error("Service indisponible : réessayez dans un instant.");
}

export async function fetchParcels(line: LL[], samples: { p: LL; d: number }[], stepM: number, o: { signal?: AbortSignal; onProgress?: (d: number, t: number) => void } = {}): Promise<ParcelHit[]> {
  const ws = windows(simplifyLine(line, 3), 30); const found = new Map<string, { props: ParcelProps; geometry: Ring }>();
  for (let i = 0; i < ws.length; i++) {
    const g = encodeURIComponent(JSON.stringify({ type: "LineString", coordinates: ws[i] }));
    const j = await getJson<{ features?: { properties: ParcelProps; geometry: Ring }[] }>(`${CARTO}?geom=${g}&_limit=1000`, o.signal);
    for (const f of j.features ?? []) { const id = f.properties.idu ?? `${f.properties.code_insee}${f.properties.section}${f.properties.numero}`; if (!found.has(id)) found.set(id, { props: f.properties, geometry: f.geometry }); }
    o.onProgress?.(i + 1, ws.length);
  }
  const hits = [...found].map(([id, v]) => ({ id, v }));
  const lens = lengthInside(samples, hits.map((h) => h.v.geometry), stepM);
  return hits.map((h, i) => ({ id: h.id, ref: parcelRef(h.v.props), commune: h.v.props.nom_com, insee: h.v.props.code_insee, section: h.v.props.section, numero: h.v.props.numero, areaM2: h.v.props.contenance ?? 0, lengthM: lens[i], geometry: h.v.geometry }))
    .sort((a, b) => a.commune.localeCompare(b.commune, "fr") || a.section.localeCompare(b.section) || a.numero.localeCompare(b.numero));
}

/** Adresse WFS : espaces encodés en %20 (et non « + »), comme l'attend le serveur. */
const wfsUrl = (type: string, cql: string, extra: Record<string, string> = {}) =>
  `${WFS}?${Object.entries({ SERVICE: "WFS", VERSION: "2.0.0", REQUEST: "GetFeature", OUTPUTFORMAT: "application/json", SRSNAME: "EPSG:4326", COUNT: "1500", TYPENAMES: type, CQL_FILTER: cql, ...extra }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
interface WfsFeature<P> { properties: P; geometry: { type: string; coordinates: unknown } }

export async function fetchTroncons(line: LL[], o: { signal?: AbortSignal; onProgress?: (d: number, t: number) => void } = {}): Promise<Troncon[]> {
  const ws = windows(simplifyLine(line, 4), 22); const out = new Map<string, Troncon>();
  for (let i = 0; i < ws.length; i++) {
    const j = await getJson<{ features?: WfsFeature<{ cleabs: string; nature: string; prive: boolean | null; acces_pieton: string | null; cpx_toponyme_itineraire_autre: string | null }>[] }>(
      wfsUrl("BDTOPO_V3:troncon_de_route", `DWITHIN(geometrie,${wkt(ws[i])},15,meters)`, { PROPERTYNAME: "geometrie,cleabs,nature,prive,acces_pieton,cpx_toponyme_itineraire_autre" }), o.signal);
    for (const f of j.features ?? []) {
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates as number[][]] : f.geometry.type === "MultiLineString" ? (f.geometry.coordinates as number[][][]) : [];
      lines.forEach((g, k) => out.set(`${f.properties.cleabs}#${k}`, { id: f.properties.cleabs, nature: f.properties.nature ?? "Inconnu", prive: f.properties.prive ?? null, accesPieton: f.properties.acces_pieton, itineraire: f.properties.cpx_toponyme_itineraire_autre ?? "", geometry: g }));
    }
    o.onProgress?.(i + 1, ws.length);
  }
  return [...out.values()];
}

export async function fetchZones(line: LL[], samples: { p: LL; d: number }[], stepM: number, o: { signal?: AbortSignal } = {}): Promise<ZoneHit[]> {
  const ws = windows(simplifyLine(line, 10), 22); const found = new Map<string, ZoneHit>();
  for (const [type, kind] of [["BDTOPO_V3:foret_publique", "foret"], ["BDTOPO_V3:parc_ou_reserve", "parc"]] as const) {
    for (const w of ws) {
      const j = await getJson<{ features?: WfsFeature<{ cleabs: string; toponyme: string | null; nature: string | null }>[] }>(wfsUrl(type, `INTERSECTS(geometrie,${wkt(w)})`, { COUNT: "200" }), o.signal);
      for (const f of j.features ?? []) { const g = f.geometry as unknown as Ring; if (!found.has(f.properties.cleabs)) found.set(f.properties.cleabs, { id: f.properties.cleabs, kind, name: f.properties.toponyme ?? "(sans nom)", nature: f.properties.nature ?? "", lengthM: 0, geometry: g }); }
    }
  }
  const zs = [...found.values()];
  // un point peut appartenir à plusieurs zones (ex. forêt ET Natura 2000) : on compte chaque zone séparément
  const lens = zs.map((z) => lengthInside(samples, [z.geometry], stepM)[0]);
  return zs.map((z, i) => ({ ...z, lengthM: lens[i] })).filter((z) => z.lengthM > 0).sort((a, b) => b.lengthM - a.lengthM);
}

const merc = (lng: number, lat: number): [number, number] => [(lng * 20037508.34) / 180, (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180) * 20037508.34) / 180];
/** Itinéraires de randonnée balisés recensés dans l'emprise (OpenStreetMap via Waymarked Trails) : information de contexte, sans géométrie. */
export async function fetchWaymarked(bbox: [number, number, number, number], signal?: AbortSignal): Promise<RouteLabel[]> {
  const [x1, y1] = merc(bbox[0], bbox[1]), [x2, y2] = merc(bbox[2], bbox[3]);
  const j = await getJson<{ results?: { ref?: string | null; name?: string | null; group?: string }[] }>(`https://hiking.waymarkedtrails.org/api/v1/list/by_area?bbox=${[x1, y1, x2, y2].map(Math.round).join(",")}&limit=60`, signal);
  return (j.results ?? []).map((r) => ({ ref: r.ref ?? "", name: r.name ?? "", group: r.group ?? "" })).filter((r) => r.ref || r.name);
}
export const GROUP_LABEL: Record<string, string> = { INT: "International", NAT: "National", REG: "Régional", LOC: "Local" };

export interface Analysis { routeM: number; parcels: ParcelHit[]; portions: Portion[]; summary: Summary; zones: ZoneHit[]; waymarked: RouteLabel[]; warnings: string[]; at: number }

export async function analyzeRoute(line: LL[], o: { signal?: AbortSignal; onStep?: (s: string, done: number, total: number) => void } = {}): Promise<Analysis> {
  const STEP = 5, samples = resample(line, STEP), routeM = samples.at(-1)?.d ?? 0, warnings: string[] = [];
  const bbox: [number, number, number, number] = [Math.min(...line.map((p) => p[0])), Math.min(...line.map((p) => p[1])), Math.max(...line.map((p) => p[0])), Math.max(...line.map((p) => p[1]))];
  const parcels = await fetchParcels(line, samples, STEP, { signal: o.signal, onProgress: (d, t) => o.onStep?.("Parcelles cadastrales", d, t) });
  const troncons = await fetchTroncons(line, { signal: o.signal, onProgress: (d, t) => o.onStep?.("Chemins (BD TOPO)", d, t) });
  o.onStep?.("Zones réglementées", 0, 1);
  const zones = await fetchZones(line, samples, STEP, { signal: o.signal });
  o.onStep?.("Itinéraires de randonnée", 0, 1);
  const waymarked = await fetchWaymarked(bbox, o.signal).catch(() => { warnings.push("Liste des itinéraires de randonnée (OpenStreetMap) indisponible."); return [] as RouteLabel[]; });
  const portions = classify(samples, troncons);
  if (!troncons.length) warnings.push("Aucun chemin recensé par l'IGN le long de ce tracé : hors de France, ou tracé éloigné de tout chemin connu.");
  if (!parcels.length) warnings.push("Aucune parcelle cadastrale trouvée : le cadastre couvre la France ; vérifiez la position du tracé.");
  return { routeM, parcels, portions, summary: summarize(portions), zones, waymarked, warnings, at: Date.now() };
}

// ── Export ──
const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
export function parcelsCsv(a: Analysis): string {
  return ["Commune;Code INSEE;Section;Numéro;Référence;Surface parcelle (m²);Longueur du tracé (m)", ...a.parcels.map((p) => [q(p.commune), p.insee, p.section, p.numero, q(p.ref), p.areaM2, Math.round(p.lengthM)].join(";"))].join("\r\n");
}
