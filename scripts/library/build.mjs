#!/usr/bin/env node
/**
 * Construit la bibliothèque d'itinéraires de référence (public/library/*).
 * Source : API OpenStreetMap (relations d'itinéraires, licence ODbL 1.0) ; altitudes : IGN Géoplateforme (RGE ALTI / modèle mondial).
 * Usage : node scripts/library/build.mjs [--only slug,slug] [--dry]
 * Les relations sont vérifiées (type de route, présence de géométrie) ; l'assemblage des tronçons signale les trous.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const OUT = path.join(ROOT, "public/library"), SPEC = path.join(ROOT, "scripts/library/routes.json");
const CACHE = process.env.LIB_CACHE || path.join(ROOT, ".library-cache");
const UA = "Crete-outdoor-library-builder/1.0 (+https://github.com/oray-04/outdoor-gpx)";
const args = process.argv.slice(2), only = (args.find((a) => a.startsWith("--only="))?.slice(7) ?? (args.includes("--only") ? args[args.indexOf("--only") + 1] : "")).split(",").filter(Boolean);
const R = 6371008.8, rad = (d) => (d * Math.PI) / 180;
const hav = (a, b) => { const dLa = rad(b[1] - a[1]), dLo = rad(b[0] - a[0]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true }); fs.mkdirSync(path.join(OUT, "routes"), { recursive: true });

async function getJson(url, tries = 4) {
  for (let a = 0; a < tries; a++) {
    try { const r = await fetch(url, { headers: { "User-Agent": UA } }); if (r.ok) return await r.json(); if (r.status === 404 || r.status === 410) throw new Error(`HTTP ${r.status}`); } catch (e) { if (/HTTP 40[04]|410/.test(String(e))) throw e; }
    await sleep(1500 * (a + 1));
  }
  throw new Error(`échec : ${url}`);
}
async function osmFull(id) {
  const f = path.join(CACHE, `rel-${id}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const j = await getJson(`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`); fs.writeFileSync(f, JSON.stringify(j)); await sleep(800); return j;
}

/** Assemble les tronçons d'une relation (dans l'ordre des membres) ; retourne la ligne et les trous constatés. */
function chain(ways) {
  const gaps = []; let line = [];
  for (const w of ways) {
    if (!line.length) { line = [...w]; continue; }
    const end = line[line.length - 1], s = w[0], e = w[w.length - 1];
    const ds = hav(end, s), de = hav(end, e);
    // le tronçon peut être « à l'envers » ; sinon on constate un trou (et on relie en ligne droite)
    const seg = de < ds ? [...w].reverse() : w, d = Math.min(ds, de);
    if (d > 15) gaps.push(d);
    line.push(...(d <= 1 ? seg.slice(1) : seg));
  }
  return { line, gaps };
}
/** Assemble des morceaux de ligne : dans l'ordre donné, ou en choisissant à chaque fois le morceau le plus proche de la fin courante (dans les deux orientations). */
function assemble(items, greedy) {
  if (!items.length) return { line: [], gaps: [], total: 0 };
  const rest = items.map((x) => x), first = rest.shift(); let line = [...first]; const gaps = [];
  while (rest.length) {
    const end = line[line.length - 1]; let bi = 0, bd = Infinity, brev = false;
    const lim = greedy ? rest.length : 1;
    for (let i = 0; i < lim; i++) { const ds = hav(end, rest[i][0]), de = hav(end, rest[i][rest[i].length - 1]); if (ds < bd) { bd = ds; bi = i; brev = false; } if (de < bd) { bd = de; bi = i; brev = true; } }
    const seg = brev ? [...rest[bi]].reverse() : rest[bi]; rest.splice(bi, 1);
    if (bd > 15) gaps.push(bd);
    line.push(...(bd <= 1 ? seg.slice(1) : seg));
  }
  return { line, gaps, total: gaps.reduce((x, y) => x + y, 0) };
}
const isMain = (m) => !/^(alternative|alternate|excursion|approach|connection|variant|spur|shortcut|ferry)/i.test(m.role || "");

async function buildLine(rootId, depth = 0, seen = new Set()) {
  if (seen.has(rootId)) return { line: [], gaps: [], tags: {}, children: 0 }; seen.add(rootId);
  const j = await osmFull(rootId); const rel = j.elements.find((e) => e.type === "relation" && e.id === rootId);
  if (!rel) throw new Error(`relation ${rootId} introuvable`);
  const nodes = new Map(j.elements.filter((e) => e.type === "node").map((n) => [n.id, [n.lon, n.lat]]));
  const wayMap = new Map(j.elements.filter((e) => e.type === "way").map((w) => [w.id, w.nodes.map((n) => nodes.get(n)).filter(Boolean)]));
  const parts = []; let allGaps = [], children = 0;
  for (const m of rel.members) {
    if (!isMain(m)) continue;
    if (m.type === "way" && wayMap.has(m.ref)) { parts.push({ kind: "way", pts: wayMap.get(m.ref) }); }
    else if (m.type === "relation" && depth < 2 && children < 160) {
      const t = j.elements.find((e) => e.type === "relation" && e.id === m.ref);
      // sous-relations : on ne garde que celles qui sont des itinéraires (et pas des variantes)
      const tg = t?.tags || {}; if (/variante|alternati|liaison|boucle|connexion|d[ée]tour|branche|temporaire|provisoire|ancien|old/i.test(`${tg.name || ""} ${tg.note || ""} ${tg.description || ""}`) || /proposed|disused|abandoned/.test(tg.state || "")) continue;
      if (t && t.tags && /^(hiking|foot|bicycle|mtb|route)$/.test(t.tags.route || "route")) {
        const sub = await buildLine(m.ref, depth + 1, seen); children++;
        if (sub.line.length > 1) { parts.push({ kind: "rel", pts: sub.line }); allGaps = allGaps.concat(sub.gaps); }
      }
    }
  }
  // Assemblage : ordre des membres ; si des trous importants subsistent, repli « glouton » (plus proche extrémité) et on garde le meilleur
  const all = parts.map((p) => p.pts).filter((p) => p.length > 1);
  const a = assemble(all, false), b = a.gaps.some((g) => g > 2000) ? assemble(all, true) : null;
  const best = b && b.total < a.total ? b : a;
  const line = best.line; allGaps = allGaps.concat(best.gaps);
  return { line, gaps: allGaps, tags: rel.tags || {}, children };
}

/** Douglas-Peucker (m) — copie volontaire : le script ne dépend pas du code TypeScript du site. */
function simplify(pts, tol) {
  const n = pts.length; if (n < 3) return pts.slice();
  const kx = 111320 * Math.cos(rad(pts[0][1])), ky = 110574, X = pts.map((p) => p[0] * kx), Y = pts.map((p) => p[1] * ky), keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) { const [a, b] = st.pop(); let m = -1, md = 0; const dx = X[b] - X[a], dy = Y[b] - Y[a], l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { let t = l2 ? ((X[i] - X[a]) * dx + (Y[i] - Y[a]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(X[i] - X[a] - t * dx, Y[i] - Y[a] - t * dy); if (d > md) { md = d; m = i; } }
    if (m >= 0 && md > tol) { keep[m] = 1; st.push([a, m], [m, b]); } }
  return pts.filter((_, i) => keep[i]);
}
function densify(pts, maxM) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.ceil(hav(a, b) / maxM); for (let k = 1; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); out.push(b); } return out; }

async function elevations(pts) {
  const out = new Array(pts.length), BATCH = 100; const ck = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const f = path.join(CACHE, "elev.json"); const cache = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  const todo = pts.map((p, i) => ({ p, i })).filter(({ p }) => cache[ck(p)] === undefined);
  for (let i = 0; i < todo.length; i += BATCH) {
    const b = todo.slice(i, i + BATCH);
    const url = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=${b.map(({ p }) => p[0].toFixed(5)).join("|")}&lat=${b.map(({ p }) => p[1].toFixed(5)).join("|")}&resource=ign_rge_alti_wld&zonly=true`;
    const j = await getJson(url); b.forEach(({ p }, k) => { cache[ck(p)] = j.elevations[k]; });
    if ((i / BATCH) % 20 === 0) fs.writeFileSync(f, JSON.stringify(cache));
  }
  fs.writeFileSync(f, JSON.stringify(cache));
  // altitudes absentes : interpolation linéaire entre les voisins connus (jamais de plateau artificiel)
  let missing = 0; const val = pts.map((p) => { const v = cache[ck(p)]; return v === undefined || v === null || v < -1000 ? null : v; });
  const known = val.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  pts.forEach((p, i) => {
    if (val[i] !== null) { out[i] = Math.round(val[i]); return; }
    missing++;
    const a = [...known].reverse().find((k) => k < i), b = known.find((k) => k > i);
    out[i] = Math.round(a === undefined ? val[b] : b === undefined ? val[a] : val[a] + ((val[b] - val[a]) * (i - a)) / (b - a));
  });
  return { ele: out, missing };
}

function stats(c) {
  let d = 0, gain = 0, loss = 0, min = Infinity, max = -Infinity, ref = c[0][2];
  for (let i = 0; i < c.length; i++) { if (i) d += hav(c[i - 1], c[i]); min = Math.min(min, c[i][2]); max = Math.max(max, c[i][2]); const x = c[i][2] - ref; if (Math.abs(x) >= 3) { x > 0 ? (gain += x) : (loss -= x); ref = c[i][2]; } }
  return { distanceM: Math.round(d), gainM: Math.round(gain), lossM: Math.round(loss), minEle: min, maxEle: max };
}

const spec = JSON.parse(fs.readFileSync(SPEC, "utf8")).routes.filter((r) => !only.length || only.includes(r.slug));
const indexFile = path.join(OUT, "index.json"); const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : [];
for (const r of spec) {
  process.stdout.write(`• ${r.slug} (relation ${r.osm}) … `);
  try {
    const { line, gaps, tags, children } = await buildLine(r.osm);
    if (line.length < 20) throw new Error("géométrie vide ou trop courte");
    const coarse = simplify(line, 12); const rawKm = (() => { let d = 0; for (let i = 1; i < line.length; i++) d += hav(line[i - 1], line[i]); return d; })();
    // un point au moins tous les 150 m (profil d'altitude exploitable), formes conservées à 12 m près
    const pts = densify(coarse, 150);
    const { ele, missing } = await elevations(pts);
    const coords = pts.map((p, i) => [+p[0].toFixed(5), +p[1].toFixed(5), ele[i]]);
    const st = stats(coords);
    const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
    // Porte de qualité : longueur comparée à celle calculée indépendamment par Waymarked Trails, et aucun trou important
    const wmtHost = r.practice === "vtt" ? "mtb" : r.practice === "randonnee" ? "hiking" : "cycling";
    const wmt = await getJson(`https://${wmtHost}.waymarkedtrails.org/api/v1/details/relation/${r.osm}`).catch(() => null);
    const refKm = wmt?.route?.length ? wmt.route.length / 1000 : null;
    const maxGap = Math.max(0, ...gaps);
    if (refKm && Math.abs(st.distanceM / 1000 - refKm) / refKm > 0.15) throw new Error(`REJETÉ : longueur ${Math.round(st.distanceM / 1000)} km, référence ${Math.round(refKm)} km (assemblage non fiable)`);
    if (maxGap > 2000) throw new Error(`REJETÉ : trou de ${(maxGap / 1000).toFixed(1)} km dans l'assemblage`);
    const hash = crypto.createHash("sha1").update(coords.map((c) => `${c[0]},${c[1]}`).join(";")).digest("hex").slice(0, 12);
    const osmKm = parseFloat(String(tags.distance || "").replace(",", ".")) || null;
    const entry = {
      id: r.slug, name: r.name, osmName: tags.name || null, ref: tags.ref || null, category: r.category, practice: r.practice, region: r.region, country: r.country,
      from: tags.from || null, to: tags.to || null, operator: tags.operator || null, ...st,
      start: [coords[0][0], coords[0][1]], end: [coords.at(-1)[0], coords.at(-1)[1]], loop: hav(coords[0], coords.at(-1)) < 300,
      bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], points: coords.length,
      source: { name: "OpenStreetMap", url: `https://www.openstreetmap.org/relation/${r.osm}`, relation: r.osm, license: "ODbL 1.0", attribution: "© contributeurs OpenStreetMap", elevation: "IGN Géoplateforme (RGE ALTI / modèle mondial), Licence Ouverte Etalab 2.0", retrieved: new Date().toISOString().slice(0, 10) },
      hash,
      quality: { gaps: gaps.length, maxGapM: Math.round(Math.max(0, ...gaps)), totalGapM: Math.round(gaps.reduce((a, b) => a + b, 0)), missingEle: missing, osmDeclaredKm: refKm ? Math.round(refKm) : osmKm, rawKm: Math.round(rawKm / 100) / 10, subRelations: children },
    };
    fs.writeFileSync(path.join(OUT, "routes", `${r.slug}.json`), JSON.stringify({ id: r.slug, coords }));
    const k = index.findIndex((e) => e.id === r.slug); if (k >= 0) index[k] = entry; else index.push(entry);
    if (!args.includes("--dry")) fs.writeFileSync(indexFile, JSON.stringify([...index].sort((a, b) => a.name.localeCompare(b.name, "fr"))));
    console.log(`${(st.distanceM / 1000).toFixed(0)} km, D+ ${st.gainM}, ${coords.length} pts, trous ${gaps.length}${gaps.length ? ` (max ${Math.round(Math.max(...gaps))} m)` : ""}`);
  } catch (e) { console.log(`ÉCHEC : ${e.message}`); const k = index.findIndex((x) => x.id === r.slug); if (k >= 0) index.splice(k, 1); fs.rmSync(path.join(OUT, "routes", `${r.slug}.json`), { force: true }); }
}
if (!args.includes("--dry")) fs.writeFileSync(indexFile, JSON.stringify(index.sort((a, b) => a.name.localeCompare(b.name, "fr"))));
