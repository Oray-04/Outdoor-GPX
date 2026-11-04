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

/** Altitudes (m) via le service d'altimétrie de la Géoplateforme, par lots, avec cache. */
export async function fetchElevations(pts: LL[], signal?: AbortSignal): Promise<number[]> {
  const todo = pts.filter((p) => !elevCache.has(keyOf(p)));
  const uniq = [...new Map(todo.map((p) => [keyOf(p), p])).values()];
  const batches: LL[][] = [];
  for (let i = 0; i < uniq.length; i += 120) batches.push(uniq.slice(i, i + 120));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++];
      const url = `${BASE}/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${b.map((p) => p[0].toFixed(5)).join("|")}&lat=${b.map((p) => p[1].toFixed(5)).join("|")}&resource=ign_rge_alti_wld&delimiter=|&indent=false&measures=false&zonly=true`;
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error(`Altimétrie ${r.status}`);
      const j = (await r.json()) as { elevations: number[] };
      b.forEach((p, i) => elevCache.set(keyOf(p), j.elevations[i]));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, worker));
  let prev = 0;
  return pts.map((p) => {
    const v = elevCache.get(keyOf(p));
    if (v === undefined || v < -1000) return prev; // donnée absente : on garde la valeur précédente
    prev = v; return v;
  });
}

/** Associe une altitude à chaque point d'une trace (un point tous les ~25 m interrogé puis interpolé). */
export async function addElevation(line: LL[], signal?: AbortSignal): Promise<Pt[]> {
  if (!line.length) return [];
  const sample = thin(line, 25);
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
