import type { LL, Pt } from "./types";
import { haversine, thin } from "./geo";

const BASE = "https://data.geopf.fr";
const elevCache = new Map<string, number>();
const keyOf = (p: readonly number[]) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;

/**
 * Mémorise des altitudes déjà connues (fichier importé, parcours enregistré) : elles sont conservées
 * lors des modifications, seules les nouveaux points sont interrogés auprès de l'IGN.
 */
export function seedElevations(coords: readonly (readonly number[])[]) {
  for (const c of coords) if (Number.isFinite(c[2])) elevCache.set(keyOf(c), c[2]);
}

/** Échec du service d'altitudes : `rate` (limite de requêtes), `server` (erreur du service), `network` (injoignable / hors ligne). */
export class ElevationError extends Error {
  constructor(public kind: "rate" | "server" | "network", public status?: number) { super(`Altimétrie ${kind}${status ? ` (${status})` : ""}`); }
}
/** Source des dernières altitudes obtenues (pour informer l'utilisateur d'un repli). */
export let lastElevationSource: "ign" | "open-meteo" = "ign";

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, ko) => { const t = setTimeout(ok, ms); signal?.addEventListener("abort", () => { clearTimeout(t); ko(new DOMException("Aborted", "AbortError")); }, { once: true }); });
/** Cadence : une requête d'altimétrie démarre au plus toutes les 220 ms (la Géoplateforme limite à ~5 requêtes/s par adresse). */
let gate = Promise.resolve();
const paced = () => { const mine = gate.then(() => new Promise<void>((ok) => setTimeout(ok, 220))); gate = mine; return mine; };

/** Disjoncteur : après un échec définitif, on n'insiste pas pendant un moment (évite des minutes de reprises par lot quand un service est coupé). */
let ignDownUntil = 0, allDown: { until: number; err: ElevationError } | null = null;
export const resetElevationBreaker = () => { ignDownUntil = 0; allDown = null; };

/** Requête JSON avec délai maximal, reprises espacées (429, 5xx, réseau) et erreur typée. */
async function getJsonRetry<T>(url: string, signal: AbortSignal | undefined, tries = 4): Promise<T> {
  let last: ElevationError = new ElevationError("network");
  for (let a = 0; a < tries; a++) {
    await paced();
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 20000);
    const onAbort = () => ctrl.abort(); signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (r.ok) return (await r.json()) as T;
      last = new ElevationError(r.status === 429 ? "rate" : r.status >= 500 ? "server" : "network", r.status);
      if (r.status !== 429 && r.status < 500) throw last; // 4xx hors limite : inutile de recommencer
    } catch (e) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (e instanceof ElevationError && e.status && e.status !== 429 && e.status < 500) throw e;
      if (!(e instanceof ElevationError)) last = new ElevationError("network"); // dont CORS : le service coupé par la limite de débit répond sans en-têtes
    } finally { clearTimeout(t); signal?.removeEventListener("abort", onAbort); }
    if (a < tries - 1) await sleep(700 * 2 ** a + Math.random() * 300, signal);
  }
  throw last;
}

/** Repli : altitudes mondiales Open-Meteo (modèle Copernicus 90 m), moins précises que le RGE ALTI de l'IGN. */
async function openMeteoElevations(b: LL[], signal?: AbortSignal): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < b.length; i += 100) {
    const c = b.slice(i, i + 100);
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${c.map((p) => p[1].toFixed(5)).join(",")}&longitude=${c.map((p) => p[0].toFixed(5)).join(",")}`, { signal });
    if (!r.ok) throw new ElevationError(r.status === 429 ? "rate" : "server", r.status);
    out.push(...((await r.json()) as { elevation: number[] }).elevation);
  }
  return out;
}

/** Altitudes (m) : Géoplateforme (RGE ALTI) par lots avec reprises ; repli Open-Meteo si le service reste indisponible. */
export async function fetchElevations(pts: LL[], signal?: AbortSignal): Promise<number[]> {
  const todo = pts.filter((p) => !elevCache.has(keyOf(p)));
  const uniq = [...new Map(todo.map((p) => [keyOf(p), p])).values()];
  const batches: LL[][] = [];
  for (let i = 0; i < uniq.length; i += 120) batches.push(uniq.slice(i, i + 120));
  let next = 0, fallback = false;
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++];
      const url = `${BASE}/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${b.map((p) => p[0].toFixed(5)).join("|")}&lat=${b.map((p) => p[1].toFixed(5)).join("|")}&resource=ign_rge_alti_wld&zonly=true`;
      if (allDown && Date.now() < allDown.until) throw allDown.err; // les deux services viennent d'échouer : échec immédiat, même erreur
      let ele: number[];
      try {
        if (Date.now() < ignDownUntil) throw new ElevationError("server"); // IGN récemment indisponible : directement le secours
        ele = (await getJsonRetry<{ elevations: number[] }>(url, signal, 3)).elevations;
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        ignDownUntil = Date.now() + 60000;
        try { ele = await openMeteoElevations(b, signal); fallback = true; }
        catch (e2) {
          if ((e2 as Error).name === "AbortError") throw e2;
          const err = e2 instanceof ElevationError ? e2 : e instanceof ElevationError ? e : new ElevationError("network");
          allDown = { until: Date.now() + 30000, err }; throw err; // le secours a échoué aussi : erreur typée
        }
      }
      b.forEach((p, i) => elevCache.set(keyOf(p), ele[i]));
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, batches.length) }, worker));
  if (batches.length) lastElevationSource = fallback ? "open-meteo" : "ign";
  let prev = 0;
  return pts.map((p) => {
    const v = elevCache.get(keyOf(p));
    if (v === undefined || v < -1000) return prev; // donnée absente : on garde la valeur précédente
    prev = v; return v;
  });
}

/** Associe une altitude à chaque point d'une trace (un point tous les ~25 m interrogé puis interpolé). */
export async function addElevation(line: LL[], signal?: AbortSignal, stepM = 25): Promise<Pt[]> {
  if (!line.length) return [];
  const sample = thin(line, stepM);
  const ele = await fetchElevations(sample, signal);
  // interpolation sur la distance cumulée
  const out: Pt[] = [];
  let si = 0, acc = 0;
  const sampleD: number[] = [0];
  for (let i = 1; i < sample.length; i++) sampleD.push(sampleD[i - 1] + haversine(sample[i - 1], sample[i]));
  for (let i = 0; i < line.length; i++) {
    if (i > 0) acc += haversine(line[i - 1], line[i]);
    while (si < sample.length - 2 && sampleD[si + 1] < acc) si++;
    const a = sampleD[si], b = sampleD[si + 1] ?? a;
    const t = b > a ? Math.min(1, Math.max(0, (acc - a) / (b - a))) : 0;
    const e = sample.length === 1 ? ele[0] : ele[si] + (ele[si + 1] - ele[si]) * t;
    out.push([line[i][0], line[i][1], Math.round(e * 10) / 10]);
  }
  return out;
}

const routeCache = new Map<string, LL[]>();

/** Tracé piéton sur chemins (BD TOPO). Renvoie null si le service ne peut pas router ce segment. */
export async function routeOnPaths(a: LL, b: LL, signal?: AbortSignal): Promise<LL[] | null> {
  const key = `${keyOf(a)}>${keyOf(b)}`;
  const c = routeCache.get(key); if (c) return c;
  const url = `${BASE}/navigation/itineraire?resource=bdtopo-valhalla&profile=pedestrian&optimization=shortest&start=${a[0]},${a[1]}&end=${b[0]},${b[1]}&geometryFormat=geojson&getSteps=false`;
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { geometry?: { coordinates: LL[] } };
    const line = j.geometry?.coordinates?.map((p) => [p[0], p[1]] as LL);
    if (!line || line.length < 2) return null;
    routeCache.set(key, line);
    return line;
  } catch (e) { if ((e as Error).name === "AbortError") throw e; return null; }
}
