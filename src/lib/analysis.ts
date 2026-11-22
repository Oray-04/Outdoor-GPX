import type { LL } from "./types";
import { cumulative, haversine, simplifyIndices } from "./geo";
import { isTransient, readJson } from "./http";

/**
 * Analyse cadastrale et réglementaire d'un tracé (aide à la préparation d'un événement).
 * Sources officielles : IGN — API Carto et WFS de la Géoplateforme (cadastre Parcellaire Express, BD TOPO : chemins,
 * forêts publiques) ; INPN / PatriNat (OFB, MNHN) diffusé par la Géoplateforme (Natura 2000, parcs, réserves, arrêtés
 * de protection, ZNIEFF). Toutes sous Licence Ouverte Etalab 2.0. Les résultats NE valident AUCUN droit de passage, et
 * un zonage environnemental n'est jamais présenté comme une interdiction : seuls les textes officiels font foi.
 *
 * Distances : calcul EXACT, segment par segment (intersection du tracé avec chaque bord de polygone), et non plus par
 * échantillonnage — une parcelle étroite traversée compte sa vraie longueur, aucune n'est oubliée ni comptée deux fois.
 */
export interface Ring { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] }
export interface ParcelHit {
  id: string; ref: string; commune: string; insee: string; section: string; numero: string; areaM2: number; lengthM: number; geometry: Ring;
  /** commune absorbée (ancienne commune), feuille cadastrale */
  comAbs?: string; feuille?: number;
  /** première entrée sur la parcelle et nombre de passages distincts (m depuis le départ) */
  fromM?: number; passages?: number;
  /** zonages traversés SUR cette parcelle (identifiants de `ZoneHit`) */
  zoneIds?: string[];
}
export interface Portion { fromM: number; toM: number; nature: string; prive: boolean | null; itineraire: string; gr: boolean; matched: boolean }
/**
 * Zonages : statut juridique résumé, avec une formulation prudente.
 * - `reglementaire` : zone dotée d'un texte propre (décret, arrêté) ; ce texte peut encadrer ou soumettre à autorisation
 *   une manifestation — à lire, et gestionnaire à consulter. Jamais présenté comme une interdiction automatique.
 * - `procedure` : démarche possible (évaluation des incidences Natura 2000, accord du propriétaire en forêt publique).
 * - `vigilance` : inventaire ou territoire de projet, sans réglementation d'accès propre.
 */
export type ZoneStatus = "reglementaire" | "procedure" | "vigilance";
export type ZoneKind = "foret" | "parc" | "n2000-habitats" | "n2000-oiseaux" | "pn-coeur" | "pn-adhesion" | "pnr" | "rnn" | "rnr" | "apb" | "aphn" | "rb" | "znieff1" | "znieff2";
export const ZONE_KINDS: Record<ZoneKind, { label: string; status: ZoneStatus; note: string }> = {
  "pn-coeur": { label: "Parc national — cœur", status: "reglementaire", note: "Réglementation propre au cœur du parc (décret de création, charte) : les manifestations sportives y sont encadrées. Consulter l'établissement du parc." },
  rnn: { label: "Réserve naturelle nationale", status: "reglementaire", note: "Réglementation fixée par le décret de la réserve : lire le texte et consulter le gestionnaire." },
  rnr: { label: "Réserve naturelle régionale", status: "reglementaire", note: "Réglementation fixée par la délibération régionale : lire le texte et consulter le gestionnaire." },
  apb: { label: "Arrêté de protection de biotope", status: "reglementaire", note: "Mesures fixées par arrêté préfectoral : lire l'arrêté (activités parfois encadrées à certaines périodes)." },
  aphn: { label: "Arrêté de protection d'habitat naturel", status: "reglementaire", note: "Mesures fixées par arrêté préfectoral : lire l'arrêté." },
  rb: { label: "Réserve biologique (forêt publique)", status: "reglementaire", note: "Réserve en forêt publique, gérée par l'ONF : règles d'accès propres (réserve intégrale ou dirigée). Consulter l'ONF." },
  "n2000-habitats": { label: "Natura 2000 — directive Habitats (SIC/ZSC)", status: "procedure", note: "Une évaluation des incidences Natura 2000 peut être exigée pour la manifestation (code de l'environnement, art. L414-4 et R414-19) : à vérifier auprès de la DDT(M)." },
  "n2000-oiseaux": { label: "Natura 2000 — directive Oiseaux (ZPS)", status: "procedure", note: "Une évaluation des incidences Natura 2000 peut être exigée pour la manifestation (code de l'environnement, art. L414-4 et R414-19) : à vérifier auprès de la DDT(M)." },
  foret: { label: "Forêt publique (régime forestier)", status: "procedure", note: "Forêt domaniale ou communale : accord du propriétaire et de l'ONF à demander pour une manifestation." },
  parc: { label: "Parc ou réserve (BD TOPO)", status: "vigilance", note: "Zone recensée par l'IGN : vérifier son statut exact." },
  "pn-adhesion": { label: "Parc national — aire d'adhésion", status: "vigilance", note: "Aire d'adhésion : pas de réglementation d'accès propre ; informer l'établissement du parc reste recommandé." },
  pnr: { label: "Parc naturel régional", status: "vigilance", note: "Territoire de projet (charte), sans réglementation d'accès générale : zone de vigilance." },
  znieff1: { label: "ZNIEFF de type 1", status: "vigilance", note: "Inventaire scientifique, sans portée réglementaire directe : zone de vigilance (espèces ou milieux remarquables)." },
  znieff2: { label: "ZNIEFF de type 2", status: "vigilance", note: "Inventaire scientifique de grands ensembles naturels, sans portée réglementaire directe : zone de vigilance." },
};
export const ZONE_STATUS: Record<ZoneStatus, { label: string; short: string; color: string }> = {
  reglementaire: { label: "Réglementation spécifique à consulter", short: "Réglementé", color: "#b42318" },
  procedure: { label: "Démarche possible (évaluation, accord)", short: "Démarche", color: "#b7791f" },
  vigilance: { label: "Zone de vigilance (sans réglementation d'accès propre)", short: "Vigilance", color: "#2f6f4f" },
};
export interface ZoneHit { id: string; kind: ZoneKind; name: string; nature: string; lengthM: number; geometry: Ring; status?: ZoneStatus; url?: string; manager?: string; source?: string }
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

const ringsOf = (g: Ring): number[][][] => (g.type === "Polygon" ? (g.coordinates as number[][][]) : (g.coordinates as number[][][][]).flat());
/**
 * Portions du tracé situées dans une géométrie, en distance depuis le départ (m) : calcul exact.
 * Chaque segment est coupé à chaque bord de polygone qu'il franchit ; le milieu de chaque morceau dit s'il est dedans.
 * Les portions contiguës sont fusionnées. `cum` = distances cumulées du tracé (`cumulative`).
 */
export function intervalsInside(line: LL[], cum: number[], g: Ring): [number, number][] {
  const [w, s, e, n] = bboxOfGeom(g), X = kx((s + n) / 2), rings = ringsOf(g), out: [number, number][] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    if (Math.max(a[0], b[0]) < w || Math.min(a[0], b[0]) > e || Math.max(a[1], b[1]) < s || Math.min(a[1], b[1]) > n) continue;
    const ax = a[0] * X, ay = a[1] * KY, dx = b[0] * X - ax, dy = b[1] * KY - ay, ts = [0, 1];
    const sw = Math.min(a[0], b[0]), se = Math.max(a[0], b[0]), ss = Math.min(a[1], b[1]), sn = Math.max(a[1], b[1]);
    for (const r of rings) for (let k = 1; k < r.length; k++) {
      const c = r[k - 1], d = r[k];
      if (Math.max(c[0], d[0]) < sw || Math.min(c[0], d[0]) > se || Math.max(c[1], d[1]) < ss || Math.min(c[1], d[1]) > sn) continue;
      const cx = c[0] * X, cy = c[1] * KY, ex = d[0] * X - cx, ey = d[1] * KY - cy, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue; // parallèles : les milieux des morceaux tranchent
      const t = ((cx - ax) * ey - (cy - ay) * ex) / den, u = ((cx - ax) * dy - (cy - ay) * dx) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    const L = cum[i + 1] - cum[i];
    for (let k = 1; k < ts.length; k++) {
      const t0 = ts[k - 1], t1 = ts[k]; if (t1 - t0 < 1e-9) continue;
      const tm = (t0 + t1) / 2;
      if (!inGeometry([a[0] + (b[0] - a[0]) * tm, a[1] + (b[1] - a[1]) * tm], g)) continue;
      const f = cum[i] + t0 * L, to = cum[i] + t1 * L, last = out[out.length - 1];
      if (last && f - last[1] < 1e-6) last[1] = to; else out.push([f, to]);
    }
  }
  return out;
}
export const intervalsLength = (iv: [number, number][]) => iv.reduce((t, [a, b]) => t + b - a, 0);
/** Longueur commune à deux listes de portions triées. */
export function overlapLength(a: [number, number][], b: [number, number][]): number {
  let i = 0, j = 0, t = 0;
  while (i < a.length && j < b.length) { const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]); if (hi > lo) t += hi - lo; if (a[i][1] < b[j][1]) i++; else j++; }
  return t;
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
export interface ParcelProps { idu?: string; numero: string; section: string; code_insee: string; com_abs?: string; nom_com: string; contenance?: number; feuille?: number }
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
    if (cur && cur.key === key) cur.to = s.d;
    else { // les portions sont jointives : la frontière est placée à mi-chemin entre deux échantillons (aucun trou, aucune longueur perdue)
      const edge: number = cur ? (cur.to + s.d) / 2 : s.d;
      if (cur) cur.to = edge;
      flush(); cur = { key, t: best, from: edge, to: s.d };
    }
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

/** Nom lisible du service interrogé, pour les messages. */
const serviceName = (url: string) => (url.includes("apicarto") ? "Le service du cadastre (API Carto)" : url.includes("geopf") ? "Le service de la Géoplateforme (IGN)" : url.includes("waymarked") ? "Le service des itinéraires balisés" : "Le service");

/**
 * Appel JSON avec trois essais. Une réponse qui n'est pas des données (page de métriques « # HELP jmx… », page HTML d'erreur…)
 * est traitée comme une panne passagère : nouvel essai, puis erreur claire (jamais « Unexpected token … is not valid JSON »).
 */
export const REQUEST_TIMEOUT_MS = 30000;
let RETRY_BASE_MS = 600;
/** Délai de base entre essais (tests : 0). */
export const setRetryBase = (ms: number) => { RETRY_BASE_MS = ms; };
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let last: Error | null = null;
  // nœud de serveur défaillant tiré au hasard par l'équilibreur : plusieurs essais espacés suffisent presque toujours
  for (let a = 0; a < 5; a++) {
    if (a) await new Promise((ok) => setTimeout(ok, RETRY_BASE_MS * 2 ** (a - 1)));
    // délai maximal par requête : un serveur qui ne répond plus ne bloque jamais l'analyse (nouvel essai, puis erreur claire)
    const t = new AbortController(), timer = setTimeout(() => t.abort(), REQUEST_TIMEOUT_MS), onAbort = () => t.abort();
    signal?.addEventListener("abort", onAbort);
    let r: Response;
    try { r = await fetch(url, { signal: t.signal }); }
    catch (e) { if (signal?.aborted) throw e; last = new Error(`${serviceName(url)} ne répond pas (délai dépassé).`); continue; }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
    if (r.ok) { try { return await readJson<T>(r, serviceName(url)); } catch (e) { last = e as Error; continue; } }
    if (isTransient(null, r.status)) { last = new Error(`${serviceName(url)} est momentanément indisponible (${r.status}).`); continue; }
    throw new Error(`${serviceName(url)} a refusé la requête (${r.status}).`);
  }
  throw last ?? new Error("Service indisponible : réessayez dans un instant.");
}

/**
 * Géométrie envoyée à l'API Carto : le tracé d'origine (points espacés d'au moins 1 m), SANS simplification.
 * Une simplification, même à 1–3 m, écarte la requête de quelques mètres du tracé réel et fait manquer des parcelles
 * étroites (bandes le long d'un chemin) : constaté sur un tracé réel de 30 km sur 5 communes.
 */
export const queryLine = (line: LL[], minGapM = 1): LL[] => {
  if (line.length < 3) return line;
  const out: LL[] = [line[0]];
  for (let i = 1; i < line.length - 1; i++) if (haversine(out[out.length - 1], line[i]) >= minGapM) out.push(line[i]);
  out.push(line[line.length - 1]);
  return out;
};
/** Vrai dès que l'API Carto a échoué : on interroge alors directement le WFS (évite d'attendre un échec à chaque fenêtre). Remis à faux à chaque analyse. */
let parcelsViaWfs = false;
export const parcelSource = () => (parcelsViaWfs ? "wfs" : "apicarto");
const parcelsWfs = (w: LL[], signal?: AbortSignal) => getJson<{ features?: { properties: ParcelProps; geometry: Ring }[]; numberMatched?: number }>(
  wfsUrl("CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle", `INTERSECTS(geom,${wkt(w)})`, { PROPERTYNAME: "geom,idu,numero,section,feuille,code_insee,com_abs,nom_com,contenance" }), signal);

/** Nombre de sommets par requête (≈ 2 Ko d'URL) et requêtes simultanées (le serveur est public). */
export const PARCEL_WINDOW = 60, PARCEL_CONCURRENCY = 3;

export async function fetchParcels(line: LL[], samples: { p: LL; d: number }[], stepM: number, o: { signal?: AbortSignal; onProgress?: (d: number, t: number) => void } = {}): Promise<(ParcelHit & { intervals: [number, number][] })[]> {
  parcelsViaWfs = false;
  const ws = windows(queryLine(line), PARCEL_WINDOW); const found = new Map<string, { props: ParcelProps; geometry: Ring }>();
  let next = 0, done = 0;
  const worker = async () => {
    while (next < ws.length) {
      const i = next++;
      type Res = { features?: { properties: ParcelProps; geometry: Ring }[]; totalFeatures?: number; numberMatched?: number };
      let j: Res;
      // Source principale : API Carto. Si elle est indisponible, même donnée (Parcellaire Express) par le WFS de la Géoplateforme, pour toutes les fenêtres restantes.
      if (!parcelsViaWfs) {
        try { j = await getJson<Res>(`${CARTO}?geom=${encodeURIComponent(JSON.stringify({ type: "LineString", coordinates: ws[i] }))}&_limit=1000`, o.signal); }
        catch (e) { if ((e as Error).name === "AbortError") throw e; parcelsViaWfs = true; j = await parcelsWfs(ws[i], o.signal); }
      } else j = await parcelsWfs(ws[i], o.signal);
      if ((j.totalFeatures ?? j.numberMatched ?? 0) > (j.features?.length ?? 0)) throw new Error("Résultat tronqué par le service (trop de parcelles dans une requête).");
      for (const f of j.features ?? []) { const id = f.properties.idu ?? `${f.properties.code_insee}${f.properties.section}${f.properties.numero}`; if (!found.has(id)) found.set(id, { props: f.properties, geometry: f.geometry }); }
      o.onProgress?.(++done, ws.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARCEL_CONCURRENCY, ws.length) }, worker));
  void samples; void stepM; // conservés pour compatibilité : la longueur est désormais calculée exactement
  const cum = cumulative(line);
  return [...found].map(([id, v]) => {
    const iv = intervalsInside(line, cum, v.geometry);
    return { id, ref: parcelRef(v.props), commune: v.props.nom_com, insee: v.props.code_insee, section: v.props.section, numero: v.props.numero, areaM2: v.props.contenance ?? 0, lengthM: intervalsLength(iv), geometry: v.geometry,
      comAbs: v.props.com_abs && v.props.com_abs !== "000" ? v.props.com_abs : undefined, feuille: v.props.feuille, fromM: iv[0]?.[0], passages: iv.length, intervals: iv };
  }).sort((a, b) => a.commune.localeCompare(b.commune, "fr") || a.section.localeCompare(b.section) || a.numero.localeCompare(b.numero));
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

/** Couches officielles des espaces protégés et inventaires (INPN / PatriNat, WFS de la Géoplateforme). */
export const INPN_LAYERS: { type: string; kind: ZoneKind | ((p: Record<string, unknown>) => ZoneKind); zoneField?: boolean }[] = [
  { type: "patrinat_pn:parc_national", kind: (p) => (String(p.zone ?? "").toLowerCase().startsWith("adh") ? "pn-adhesion" : "pn-coeur"), zoneField: true },
  { type: "patrinat_rnn:rnn", kind: "rnn" }, { type: "patrinat_rnr:rnr", kind: "rnr" },
  { type: "patrinat_apb:apb", kind: "apb" }, { type: "patrinat_aphn:aphn", kind: "aphn" },
  { type: "patrinat_rb:rb", kind: "rb", zoneField: true },
  { type: "patrinat_sic:sic", kind: "n2000-habitats" }, { type: "patrinat_zps:zps", kind: "n2000-oiseaux" },
  { type: "patrinat_pnr:pnr", kind: "pnr" },
  { type: "patrinat_znieff1:znieff1", kind: "znieff1" }, { type: "patrinat_znieff2:znieff2", kind: "znieff2" },
];
/** Marge de recherche autour du tracé simplifié : rien ne peut échapper à la requête, le calcul exact se fait ensuite sur le tracé d'origine. */
const ZONE_TOL = 15, ZONE_MARGIN = 25;
export let RETRY_DELAY_MS = 1500;
export const setRetryDelay = (ms: number) => { RETRY_DELAY_MS = ms; };

/**
 * Zonages traversés : forêts publiques (BD TOPO) et espaces protégés / inventaires (INPN).
 * Requête large (tracé simplifié + marge), puis longueur exacte sur le tracé d'origine ; les zones seulement frôlées sont écartées.
 * Une couche indisponible n'arrête pas l'analyse : elle est signalée dans `failed`.
 */
export async function fetchZones(line: LL[], samples: { p: LL; d: number }[], stepM: number, o: { signal?: AbortSignal; onProgress?: (d: number, t: number) => void; failed?: string[] } = {}): Promise<(ZoneHit & { intervals: [number, number][] })[]> {
  void samples; void stepM;
  const ws = windows(simplifyLine(line, ZONE_TOL), PARCEL_WINDOW), found = new Map<string, ZoneHit>();
  const jobs: { layer: string; run: (w: LL[]) => Promise<void> }[] = [];
  jobs.push({ layer: "Forêts publiques (BD TOPO)", run: async (w) => {
    const j = await getJson<{ features?: WfsFeature<{ cleabs: string; toponyme: string | null; nature: string | null }>[] }>(wfsUrl("BDTOPO_V3:foret_publique", `DWITHIN(geometrie,${wkt(w)},${ZONE_MARGIN},meters)`, { COUNT: "200", PROPERTYNAME: "geometrie,cleabs,toponyme,nature" }), o.signal);
    for (const f of j.features ?? []) { const id = `foret:${f.properties.cleabs}`; if (!found.has(id)) found.set(id, { id, kind: "foret", name: f.properties.toponyme ?? "Forêt publique (sans nom)", nature: f.properties.nature ?? "", lengthM: 0, geometry: f.geometry as unknown as Ring, status: ZONE_KINDS.foret.status, source: "IGN – BD TOPO" }); }
  } });
  for (const L of INPN_LAYERS) jobs.push({ layer: L.type, run: async (w) => {
    const j = await getJson<{ features?: WfsFeature<{ id_local: string | null; nom_site: string | null; url_fiche: string | null; gest_site: string | null; operateur: string | null; zone?: string | null }>[] }>(wfsUrl(L.type, `DWITHIN(geom,${wkt(w)},${ZONE_MARGIN},meters)`, { COUNT: "200", PROPERTYNAME: `geom,id_local,nom_site,url_fiche,gest_site,operateur${L.zoneField ? ",zone" : ""}` }), o.signal);
    for (const f of j.features ?? []) {
      const kind = typeof L.kind === "function" ? L.kind(f.properties as Record<string, unknown>) : L.kind, id = `${kind}:${f.properties.id_local ?? f.properties.nom_site}`;
      if (!found.has(id)) found.set(id, { id, kind, name: (f.properties.nom_site ?? "(sans nom)").replace(/\s*\[Aire D'Adhésion\]\s*$/i, ""), nature: ZONE_KINDS[kind].label, lengthM: 0, geometry: f.geometry as unknown as Ring, status: ZONE_KINDS[kind].status, url: f.properties.url_fiche ?? undefined, manager: f.properties.gest_site ?? f.properties.operateur ?? undefined, source: "INPN / PatriNat (OFB, MNHN)" });
    }
  } });
  const tasks = jobs.flatMap((j) => ws.map((w) => ({ j, w }))); let next = 0, done = 0; const failed = new Set<string>();
  const retry: typeof tasks = [];
  const worker = async () => { while (next < tasks.length) { const t = tasks[next++]; try { await t.j.run(t.w); } catch (e) { if ((e as Error).name === "AbortError") throw e; retry.push(t); } o.onProgress?.(++done, tasks.length); } };
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, worker));
  // serveur public parfois momentanément indisponible : seconde tentative différée, une requête à la fois, avant de déclarer la couche non vérifiée
  for (const t of retry) { await new Promise((ok) => setTimeout(ok, RETRY_DELAY_MS)); try { await t.j.run(t.w); } catch (e) { if ((e as Error).name === "AbortError") throw e; failed.add(t.j.layer); } }
  if (failed.size) o.failed?.push(...[...failed].map((l) => (l.startsWith("patrinat_") ? ZONE_KINDS[(INPN_LAYERS.find((x) => x.type === l)!.kind as ZoneKind)]?.label ?? l : l)));
  const cum = cumulative(line);
  return [...found.values()].map((z) => { const iv = intervalsInside(line, cum, z.geometry); return { ...z, lengthM: intervalsLength(iv), intervals: iv }; })
    .filter((z) => z.lengthM > 0.5).sort((a, b) => b.lengthM - a.lengthM);
}

const merc = (lng: number, lat: number): [number, number] => [(lng * 20037508.34) / 180, (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180) * 20037508.34) / 180];
/** Itinéraires de randonnée balisés recensés dans l'emprise (OpenStreetMap via Waymarked Trails) : information de contexte, sans géométrie. */
export async function fetchWaymarked(bbox: [number, number, number, number], signal?: AbortSignal): Promise<RouteLabel[]> {
  const [x1, y1] = merc(bbox[0], bbox[1]), [x2, y2] = merc(bbox[2], bbox[3]);
  const j = await getJson<{ results?: { ref?: string | null; name?: string | null; group?: string }[] }>(`https://hiking.waymarkedtrails.org/api/v1/list/by_area?bbox=${[x1, y1, x2, y2].map(Math.round).join(",")}&limit=60`, signal);
  return (j.results ?? []).map((r) => ({ ref: r.ref ?? "", name: r.name ?? "", group: r.group ?? "" })).filter((r) => r.ref || r.name);
}
export const GROUP_LABEL: Record<string, string> = { INT: "International", NAT: "National", REG: "Régional", LOC: "Local" };

export interface Analysis {
  routeM: number; parcels: ParcelHit[]; portions: Portion[]; summary: Summary; zones: ZoneHit[]; waymarked: RouteLabel[]; warnings: string[]; at: number;
  /** longueur hors parcelles : domaine public non cadastré (voirie, cours d'eau…) ou parcelle manquante dans la source */
  nonCadastralM?: number; parcelSource?: "apicarto" | "wfs";
}

export async function analyzeRoute(line: LL[], o: { signal?: AbortSignal; onStep?: (s: string, done: number, total: number) => void } = {}): Promise<Analysis> {
  const STEP = 5, samples = resample(line, STEP), routeM = samples.at(-1)?.d ?? 0, warnings: string[] = [];
  const bbox: [number, number, number, number] = [Math.min(...line.map((p) => p[0])), Math.min(...line.map((p) => p[1])), Math.max(...line.map((p) => p[0])), Math.max(...line.map((p) => p[1]))];
  const parcels = await fetchParcels(line, samples, STEP, { signal: o.signal, onProgress: (d, t) => o.onStep?.("Parcelles cadastrales", d, t) });
  let tronconsOk = true;
  const troncons = await fetchTroncons(line, { signal: o.signal, onProgress: (d, t) => o.onStep?.("Chemins (BD TOPO)", d, t) })
    .catch((e) => { if ((e as Error).name === "AbortError") throw e; tronconsOk = false; warnings.push("Nature et statut des chemins non vérifiés (service BD TOPO indisponible) : parcelles et zonages sont complets ; relancez plus tard pour les chemins."); return [] as Troncon[]; });
  const failed: string[] = [];
  const zonesRaw = await fetchZones(line, samples, STEP, { signal: o.signal, failed, onProgress: (d, t) => o.onStep?.("Zonages environnementaux et réglementaires", d, t) });
  if (failed.length) warnings.push(`Zonages non vérifiés (service indisponible) : ${failed.join(", ")}. Relancez l'analyse plus tard pour les compléter.`);
  o.onStep?.("Itinéraires de randonnée", 0, 1);
  const waymarked = await fetchWaymarked(bbox, o.signal).catch(() => { warnings.push("Liste des itinéraires de randonnée (OpenStreetMap) indisponible."); return [] as RouteLabel[]; });
  const portions = classify(samples, troncons);
  if (tronconsOk && !troncons.length) warnings.push("Aucun chemin recensé par l'IGN le long de ce tracé : hors de France, ou tracé éloigné de tout chemin connu.");
  if (!parcels.length) warnings.push("Aucune parcelle cadastrale trouvée : le cadastre couvre la France ; vérifiez la position du tracé.");
  // zonages traversés sur chaque parcelle (portions communes du tracé)
  const parcelsOut: ParcelHit[] = parcels.map(({ intervals, ...p }) => ({ ...p, zoneIds: zonesRaw.filter((z) => overlapLength(intervals, z.intervals) > 0.5).map((z) => z.id) }));
  const zones: ZoneHit[] = zonesRaw.map(({ intervals: _iv, ...z }) => { void _iv; return z; });
  const onParcels = parcelsOut.reduce((t, p) => t + p.lengthM, 0);
  if (onParcels > routeM * 1.01 + 5) warnings.push("Des parcelles se chevauchent dans la source cadastrale : certaines longueurs sont comptées deux fois.");
  return { routeM, parcels: parcelsOut, portions, summary: summarize(portions), zones, waymarked, warnings, at: Date.now(), nonCadastralM: Math.max(0, routeM - onParcels), parcelSource: parcelSource() as "apicarto" | "wfs" };
}

// ── Export ──
const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
export function parcelsCsv(a: Analysis): string {
  return ["Commune;Code INSEE;Section;Numéro;Référence;Surface parcelle (m²);Longueur du tracé (m)", ...a.parcels.map((p) => [q(p.commune), p.insee, p.section, p.numero, q(p.ref), p.areaM2, Math.round(p.lengthM)].join(";"))].join("\r\n");
}

/** Sous-ligne du tracé entre deux distances cumulées, avec points de coupe interpolés (portions jointives sans trou). */
export function sliceByDistance(coords: LL[], cum: number[], fromM: number, toM: number): LL[] {
  if (coords.length < 2 || toM <= fromM) return [];
  const at = (d: number): LL => {
    if (d <= 0) return coords[0]; if (d >= cum[cum.length - 1]) return coords[coords.length - 1];
    let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const t = cum[hi] > cum[lo] ? (d - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t];
  };
  const out: LL[] = [at(fromM)];
  for (let i = 0; i < coords.length; i++) if (cum[i] > fromM && cum[i] < toM) out.push(coords[i]);
  out.push(at(toM));
  return out;
}
