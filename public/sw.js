/* Crête — service worker : mode hors ligne.
 * - Tuiles de carte : servies depuis le cache (zones téléchargées par l'utilisateur) ; jamais mises en cache automatiquement.
 * - Application : pages et fichiers visités ou préparés sont disponibles sans connexion.
 */
const TILES = "crete-tiles-v1";
const APP = "crete-app-v1";
const BASE = new URL("./", self.location).pathname; // ex. /Outdoor-GPX/

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== TILES && k !== APP) await caches.delete(k);
  await self.clients.claim();
})()));

const isTile = (u) => u.hostname === "data.geopf.fr" && u.pathname.startsWith("/wmts");

async function networkFirst(req) {
  const cache = await caches.open(APP);
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(req, { signal: ctrl.signal }); clearTimeout(t);
    if (res.ok) cache.put(req.url, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(req.url)) || (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    const fallback = await cache.match(BASE + "hors-ligne/");
    return fallback || new Response("Hors ligne : cette page n'a pas été préparée.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(APP);
  const hit = await cache.match(req.url);
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req.url, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || new Response("", { status: 504 });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (isTile(url)) { e.respondWith(caches.open(TILES).then(async (c) => (await c.match(req.url)) || fetch(req))); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;
  e.respondWith(req.mode === "navigate" ? networkFirst(req) : staleWhileRevalidate(req));
});

/** Préparation hors ligne : met en cache des pages et les fichiers qu'elles utilisent (scripts, styles, polices). */
async function precache(urls, port) {
  const cache = await caches.open(APP);
  const seen = new Set(); let done = 0, total = urls.length;
  const put = async (u) => { if (seen.has(u)) return null; seen.add(u); try { const r = await fetch(u); if (r.ok) { await cache.put(u, r.clone()); return r; } } catch { /* ignoré */ } return null; };
  const assets = new Set();
  for (const u of urls) {
    const r = await put(new URL(u, self.location.origin).href);
    if (r) { const html = await r.text(); for (const m of html.matchAll(/["'(]([^"'()\s]*\/_next\/static\/[^"'()\s]+|[^"'()\s]*\/icon\.svg[^"'()\s]*|[^"'()\s]*\/maplibre\/[^"'()\s]+)/g)) assets.add(new URL(m[1].replace(/\\u0026/g, "&"), self.location.origin).href); }
    port.postMessage({ type: "progress", done: ++done, total: total + assets.size });
  }
  total += assets.size;
  for (const a of assets) {
    const r = await put(a);
    if (r && a.endsWith(".css")) { const css = await r.clone().text(); for (const m of css.matchAll(/url\(([^)]+)\)/g)) { const f = m[1].replace(/["']/g, ""); if (!f.startsWith("data:")) { total++; await put(new URL(f, a).href); } } }
    port.postMessage({ type: "progress", done: ++done, total });
  }
  port.postMessage({ type: "done", done, total });
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "precache" && e.ports[0]) e.waitUntil(precache(e.data.urls, e.ports[0]));
});
