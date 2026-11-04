import { BASEMAPS, type Basemap } from "./basemaps";
import { useStore, writeStore, readStore } from "./store";
import { BASE } from "./url";

/**
 * Cartes hors ligne : zones de tuiles téléchargées à l'avance (Cache Storage), servies par le service worker.
 * Seuls les fonds IGN sont proposés : ils sont sous licence ouverte ; les serveurs publics d'OpenStreetMap,
 * d'OpenTopoMap et de Thunderforest interdisent ou déconseillent le téléchargement en masse.
 */
export const TILE_CACHE = "crete-tiles-v1";
export const OFFLINE_BASEMAPS = ["ign-plan", "ign-photo"];
/** Plafond par zone : usage raisonnable des serveurs de tuiles et de l'espace de stockage. */
export const MAX_TILES = 3000;
export const MIN_ZOOM = 10;
const AVG_KB: Record<string, number> = { "ign-plan": 38, "ign-photo": 30 };

export type BBox = [west: number, south: number, east: number, north: number];
export interface OfflinePack { id: string; name: string; bbox: BBox; zmin: number; zmax: number; basemap: string; tiles: number; bytes: number; failed: number; createdAt: number; routeIds: string[] }

export const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
export const tileY = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };

/** Étendue en tuiles d'une emprise à un niveau de zoom. */
export function tileRange(b: BBox, z: number) {
  const max = 2 ** z - 1;
  return { x0: Math.max(0, tileX(b[0], z)), x1: Math.min(max, tileX(b[2], z)), y0: Math.max(0, tileY(b[3], z)), y1: Math.min(max, tileY(b[1], z)) };
}
export function countTiles(b: BBox, zmin: number, zmax: number): number {
  let n = 0;
  for (let z = zmin; z <= zmax; z++) { const r = tileRange(b, z); n += Math.max(0, r.x1 - r.x0 + 1) * Math.max(0, r.y1 - r.y0 + 1); }
  return n;
}
export function* tileList(b: BBox, zmin: number, zmax: number): Generator<[number, number, number]> {
  for (let z = zmin; z <= zmax; z++) { const r = tileRange(b, z); for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) yield [z, x, y]; }
}
export const tileUrl = (b: Basemap, z: number, x: number, y: number) => b.tiles.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
export const estimateMB = (tiles: number, basemap: string) => (tiles * (AVG_KB[basemap] ?? 40)) / 1024;

/** Emprise d'un tracé élargie de `bufferKm`. */
export function bboxAround(points: readonly (readonly number[])[], bufferKm: number): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of points) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
  const dLat = bufferKm / 110.574, dLng = bufferKm / (111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [w - dLng, s - dLat, e + dLng, n + dLat];
}
export const unionBBox = (a: BBox[]): BBox => [Math.min(...a.map((b) => b[0])), Math.min(...a.map((b) => b[1])), Math.max(...a.map((b) => b[2])), Math.max(...a.map((b) => b[3]))];
export const covers = (outer: BBox, inner: BBox) => outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
export const tileInPack = (p: OfflinePack, z: number, x: number, y: number) => { if (z < p.zmin || z > p.zmax) return false; const r = tileRange(p.bbox, z); return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1; };

/** Une zone suffit-elle à naviguer sur ce tracé ? (fond téléchargé, emprise couvrante, zooms de navigation inclus) */
export function packsCoverRoute(packs: OfflinePack[], routeBox: BBox): OfflinePack | undefined {
  return packs.find((p) => covers(p.bbox, routeBox) && p.zmax >= 14 && p.zmin <= 12);
}

export const usePacks = () => useStore<OfflinePack[]>("offline:packs", []);
export const readPacks = () => readStore<OfflinePack[]>("offline:packs", []);
export const savePacks = (p: OfflinePack[]) => writeStore("offline:packs", p);

export interface DownloadProgress { done: number; total: number; bytes: number; failed: number }

/** Télécharge les tuiles dans le cache (6 en parallèle). S'arrête après trop d'échecs consécutifs. */
export async function downloadTiles(urls: string[], o: { signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void; concurrency?: number }): Promise<DownloadProgress> {
  const cache = await caches.open(TILE_CACHE);
  const p: DownloadProgress = { done: 0, total: urls.length, bytes: 0, failed: 0 };
  let next = 0, streak = 0;
  const worker = async () => {
    while (next < urls.length && streak < 40) {
      if (o.signal?.aborted) return;
      const u = urls[next++];
      try {
        if (await cache.match(u)) { /* déjà téléchargée */ }
        else {
          const r = await fetch(u, { mode: "cors", signal: o.signal });
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.clone().blob(); p.bytes += blob.size;
          await cache.put(u, r);
        }
        streak = 0;
      } catch (e) { if ((e as Error).name === "AbortError") return; p.failed++; streak++; }
      p.done++; o.onProgress?.({ ...p });
    }
  };
  await Promise.all(Array.from({ length: o.concurrency ?? 6 }, worker));
  if (o.signal?.aborted) throw new DOMException("Annulé", "AbortError");
  if (streak >= 40) throw new Error("Trop d'échecs consécutifs : vérifiez votre connexion.");
  return p;
}

/** Supprime les tuiles d'une zone, sauf celles aussi utilisées par une autre zone du même fond. */
export async function deletePackTiles(pack: OfflinePack, others: OfflinePack[]): Promise<number> {
  const cache = await caches.open(TILE_CACHE); const b = BASEMAPS.find((x) => x.id === pack.basemap); if (!b) return 0;
  const shared = others.filter((o) => o.id !== pack.id && o.basemap === pack.basemap);
  let n = 0;
  for (const [z, x, y] of tileList(pack.bbox, pack.zmin, pack.zmax)) { if (shared.some((o) => tileInPack(o, z, x, y))) continue; if (await cache.delete(tileUrl(b, z, x, y))) n++; }
  return n;
}

export async function storageUsage(): Promise<{ usedMB: number; quotaMB: number } | null> {
  try { const e = await navigator.storage?.estimate?.(); return e?.usage != null ? { usedMB: e.usage / 1048576, quotaMB: (e.quota ?? 0) / 1048576 } : null; } catch { return null; }
}

export const PAGES_TO_PREPARE = ["/", "/explorer/", "/creer/", "/generer/", "/parcours/", "/parcours/voir/", "/suivi/", "/fichiers/", "/compte/", "/hors-ligne/", "/evenements/", "/evenements/voir/", "/organisateurs/", "/communaute/", "/collections/voir/"].map((p) => BASE + p);

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => { /* hors ligne indisponible sur ce navigateur */ });
}

/** Demande au service worker de mettre l'application en cache (pages + fichiers). */
export async function prepareApp(onProgress: (done: number, total: number) => void): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sw = reg.active; if (!sw) throw new Error("Le service worker n'est pas actif : rechargez la page.");
  await new Promise<void>((ok, ko) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => { if (e.data.type === "progress") onProgress(e.data.done, e.data.total); if (e.data.type === "done") ok(); };
    sw.postMessage({ type: "precache", urls: PAGES_TO_PREPARE }, [ch.port2]);
    setTimeout(() => ko(new Error("Délai dépassé")), 180000);
  });
  // Fichiers chargés à la demande (carte, PDF, ZIP) : absents des pages, on les « réchauffe » pour que le service worker les garde.
  await Promise.allSettled([import("maplibre-gl"), import("jspdf"), import("jszip"), fetch(`${BASE}/maplibre/maplibre-gl-worker.mjs`), fetch(`${BASE}/maplibre/maplibre-gl-shared.mjs`)]);
}
