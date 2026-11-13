import { describe, it, expect, vi, afterEach } from "vitest";
import { splitChunk, chunkLengthM, overpass, OVERPASS_MIRRORS, buildQuery, routeChunks, kindOf, parsePlaces, findResupply, locateOnRoute, ResupplyError, RESUPPLY, DETOUR_FROM_M } from "../src/lib/resupply";
import { cumulative } from "../src/lib/geo";
import type { LL } from "../src/lib/types";

afterEach(() => vi.unstubAllGlobals());
const line: LL[] = Array.from({ length: 200 }, (_, i) => [6 + i * 0.001, 45 + Math.sin(i / 12) * 0.002] as LL); // ~16 km
const node = (id: number, lon: number, lat: number, tags: Record<string, string>) => ({ type: "node", id, lon, lat, tags });

describe("ravitaillement le long d'un parcours (OpenStreetMap)", () => {
  it("requête : rayon autour de la ligne, une clause par filtre, lat avant lon", () => {
    const q = buildQuery([[6, 45], [6.01, 45.002]], ["bakery", "water"], 500);
    expect(q).toContain("(around:500,45.00000,6.00000,45.00200,6.01000)"); expect(q).toContain('nwr["shop"~"^(bakery|pastry)$"]'); expect(q).toContain('nwr["amenity"~"^(drinking_water|water_point)$"]'); expect(q).toContain('nwr["amenity"="fountain"]["drinking_water"="yes"]');
    expect(q.match(/nwr/g)!.length).toBeLessThanOrEqual(5); // une clause par clé, pas par valeur
    const all = buildQuery([[6, 45], [6.01, 45.002]], ["bakery", "grocery", "supermarket", "food", "restaurant", "water", "spring"], 500); expect(all.match(/nwr/g)!.length).toBeLessThanOrEqual(9); expect(all).toMatch(/^\[out:json\]\[timeout:25\];/);
    expect(q).not.toContain("supermarket"); expect(q).toMatch(/out tags center/);
  });
  it("découpage en tronçons qui se recouvrent d'un sommet (aucun trou)", () => {
    const zig: LL[] = Array.from({ length: 500 }, (_, i) => [6 + i * 0.001, 45 + (i % 2) * 0.01] as LL);
    const ch = routeChunks(zig, 60, 5); expect(ch.length).toBeGreaterThan(1);
    for (let i = 1; i < ch.length; i++) expect(ch[i][0]).toEqual(ch[i - 1].at(-1));
    expect(ch[0][0]).toEqual(zig[0]); expect(ch.at(-1)!.at(-1)).toEqual(zig.at(-1));
  });
  it("classement des lieux par catégorie", () => {
    expect(kindOf({ shop: "bakery" })).toBe("bakery"); expect(kindOf({ shop: "convenience" })).toBe("grocery"); expect(kindOf({ shop: "supermarket" })).toBe("supermarket");
    expect(kindOf({ amenity: "drinking_water" })).toBe("water"); expect(kindOf({ natural: "spring" })).toBe("spring"); expect(kindOf({ amenity: "restaurant" })).toBe("restaurant");
    expect(kindOf({ amenity: "fountain" })).toBeNull(); expect(kindOf({ amenity: "fountain", drinking_water: "yes" })).toBe("water"); expect(kindOf({ shop: "clothes" })).toBeNull();
    expect(RESUPPLY.water.poi).toBe("eau"); expect(RESUPPLY.bakery.poi).toBe("ravito");
  });
  it("distance au tracé, position le long du tracé, détour", () => {
    const straight: LL[] = [[6, 45], [6.1, 45]]; const cum = cumulative(straight);
    const on = locateOnRoute([6.05, 45.0005], straight, cum); expect(on.offM).toBeGreaterThan(40); expect(on.offM).toBeLessThan(70); expect(on.atM).toBeGreaterThan(3800); expect(on.atM).toBeLessThan(4050);
    const r = parsePlaces([node(1, 6.05, 45.0005, { shop: "bakery", name: "Au Bon Pain", opening_hours: "Tu-Su 06:30-19:00", "addr:street": "Grande Rue", "addr:housenumber": "12", "addr:postcode": "74000", "addr:city": "Annecy" }), node(2, 6.02, 45.01, { amenity: "drinking_water" }), { type: "way", id: 9, center: { lat: 45.0002, lon: 6.08 }, tags: { shop: "supermarket", brand: "Marché U" } }], straight);
    expect(r.map((p) => p.id)).toEqual(["node/2", "node/1", "way/9"]); // triés par position le long du parcours
    const b = r[1]; expect(b).toMatchObject({ kind: "bakery", name: "Au Bon Pain", hours: "Tu-Su 06:30-19:00", address: "12 Grande Rue, 74000 Annecy", detour: false });
    expect(r[0]).toMatchObject({ kind: "water", drinkable: "yes", detour: true, name: "" }); expect(r[0].offM).toBeGreaterThan(DETOUR_FROM_M); expect(Math.abs(r[0].detourM - r[0].offM * 2)).toBeLessThanOrEqual(1);
    expect(r[2].name).toBe("Marché U"); expect(r[2].osmUrl).toBe("https://www.openstreetmap.org/way/9");
  });
  it("écarte doublons, lieux privés, fermés définitivement ou sans coordonnées", () => {
    const r = parsePlaces([node(1, 6.05, 45, { shop: "bakery" }), node(1, 6.05, 45, { shop: "bakery" }), node(2, 6.05, 45, { amenity: "drinking_water", access: "private" }), node(3, 6.05, 45, { shop: "bakery", "disused:shop": "bakery" }), { type: "way", id: 4, tags: { shop: "bakery" } }, node(5, 6.05, 45, { amenity: "drinking_water", drinking_water: "no" })], [[6, 45], [6.1, 45]]);
    expect(r.map((p) => p.id)).toEqual(["node/1", "node/5"]); expect(r[1].drinkable).toBe("no");
  });
  it("recherche complète : un appel par tronçon, filtre du rayon, miroir de secours", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); if (String(u).includes("overpass-api.de")) return new Response("", { status: 504 }); return new Response(JSON.stringify({ elements: [node(1, 6.05, 45.0003, { shop: "bakery", name: "A" }), node(2, 6.05, 45.03, { shop: "bakery", name: "Trop loin" })] }), { status: 200 }); }));
    const prog: number[] = []; const r = await findResupply(line, ["bakery"], 400, { onProgress: (d) => prog.push(d), retryWaits: [], gapMs: 0 });
    expect(r.map((p) => p.name)).toEqual(["A"]); expect(urls.some((u) => u.includes("private.coffee"))).toBe(true); expect(prog.at(-1)).toBeGreaterThanOrEqual(1);
  });
  it("erreurs typées : limite de requêtes, parcours trop long ; rien à chercher = liste vide", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(findResupply(line, ["bakery"], 400, { retryWaits: [], gapMs: 0 })).rejects.toMatchObject({ kind: "rate" });
    const huge: LL[] = [[-5, 43], [10, 60]]; await expect(findResupply(huge, ["bakery"], 400)).rejects.toBeInstanceOf(ResupplyError);
    expect(await findResupply(line, [], 400)).toEqual([]);
  });
});

import { gaps, sections, placesCsv, familyOf, PRESETS, RESUPPLY_KINDS, RESUPPLY_GLYPHS, resupplyIconSvg, type ResupplyPlace, type ResupplyKind } from "../src/lib/resupply";
describe("préparation d'itinérance : autonomie, étapes, export", () => {
  const pl = (id: string, kind: ResupplyKind, atKm: number, offM = 20): ResupplyPlace => ({ id, kind, name: `Lieu "${id}"`, lng: 6, lat: 45, address: "1 rue; du Test", hours: "", phone: "", website: "", drinkable: "", offM, atM: atKm * 1000, detour: offM > DETOUR_FROM_M, detourM: offM * 2, osmUrl: "" } as ResupplyPlace);
  const list = [pl("w1", "water", 5), pl("s1", "spring", 12), pl("w2", "water", 30), pl("b1", "bakery", 8), pl("r1", "restaurant", 41, 600)];
  it("familles et préréglages couvrent toutes les catégories", () => {
    expect(familyOf("water")).toBe("water"); expect(familyOf("spring")).toBe("water"); expect(familyOf("bakery")).toBe("food"); expect(familyOf("restaurant")).toBe("meal");
    for (const p of PRESETS) { expect(p.kinds.length).toBeGreaterThan(0); for (const k of p.kinds) expect(RESUPPLY_KINDS).toContain(k); }
    expect(PRESETS.find((p) => p.id === "tout")!.kinds).toEqual(RESUPPLY_KINDS);
  });
  it("tronçons sans ravitaillement, du plus long au plus court", () => {
    const g = gaps(list, 42000, "water"); expect(g[0]).toEqual({ fromM: 12000, toM: 30000, lengthM: 18000 }); expect(g.reduce((s, x) => s + x.lengthM, 0)).toBe(42000);
    expect(gaps(list, 42000, "water", { strict: true })[0]).toEqual({ fromM: 5000, toM: 30000, lengthM: 25000 }); // les sources ne comptent pas
    expect(gaps(list, 42000, "meal", { maxOffM: 300 })).toEqual([{ fromM: 0, toM: 42000, lengthM: 42000 }]); // restaurant trop loin
    expect(gaps([], 42000, "food")).toEqual([{ fromM: 0, toM: 42000, lengthM: 42000 }]);
  });
  it("étapes : chaque lieu dans un seul tronçon, compteurs par famille", () => {
    const s = sections(list, 42000, 20); expect(s.map((x) => [x.fromM, x.toM])).toEqual([[0, 20000], [20000, 40000], [40000, 42000]]);
    expect(s[0].places.map((p) => p.id)).toEqual(["w1", "b1", "s1"]); expect(s[0].counts).toEqual({ water: 2, food: 1, meal: 0 }); expect(s[2].counts.meal).toBe(1);
    expect(s.reduce((n, x) => n + x.places.length, 0)).toBe(list.length);
    expect(sections([pl("x", "water", 42)], 42000, 20)[2].places).toHaveLength(1); // lieu à l'arrivée : dernier tronçon
    expect(sections([], 0, 20)).toHaveLength(1);
  });
  it("CSV : une ligne par lieu, triée par km, guillemets échappés", () => {
    const rows = placesCsv(list).split("\n"); expect(rows).toHaveLength(list.length + 1); expect(rows[0].startsWith("Km;Catégorie;Nom")).toBe(true);
    expect(rows[1]).toContain('"Lieu ""w1"""'); expect(rows[1]).toContain('"1 rue; du Test"'); expect(rows[5]).toContain("1200"); expect(rows[1].split('";"').length).toBeGreaterThanOrEqual(1);
  });
  it("un pictogramme par catégorie", () => { for (const k of RESUPPLY_KINDS) { expect(RESUPPLY_GLYPHS[k].length).toBeGreaterThan(0); expect(resupplyIconSvg(k, 16)).toMatch(/^<svg[^>]*width="16"/); } });
});

describe("robustesse de la recherche Overpass", () => {
  afterEach(() => vi.unstubAllGlobals());
  const el = (id: number, lon: number) => ({ type: "node", id, lat: 45.0003, lon, tags: { shop: "bakery", name: `B${id}` } });
  const ok = (els: unknown[], extra: object = {}) => new Response(JSON.stringify({ elements: els, ...extra }));
  it("nouvelle série d'essais après un refus momentané (429 puis succès)", async () => {
    let n = 0; vi.stubGlobal("fetch", vi.fn(async () => (++n <= OVERPASS_MIRRORS.length ? new Response("", { status: 429 }) : ok([el(1, 6.05)]))));
    const r = await overpass("q", { retryWaits: [1] }); expect(r.elements).toHaveLength(1); expect(n).toBe(OVERPASS_MIRRORS.length + 1);
  });
  it("serveur muet : délai dépassé puis serveur suivant ; l'erreur la plus parlante est remontée", async () => {
    vi.stubGlobal("fetch", vi.fn((u: string, init: RequestInit) => String(u).includes("a.test") ? new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("x", "AbortError")))) : Promise.resolve(ok([el(2, 6.05)]))));
    expect((await overpass("q", { mirrors: ["https://a.test/i", "https://b.test/i"], timeoutMs: 30, retryWaits: [] })).elements).toHaveLength(1);
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { if (String(u).includes("a.test")) return new Response("", { status: 429 }); throw new TypeError("Failed to fetch"); }));
    const e = await overpass("q", { mirrors: ["https://a.test/i", "https://b.test/i"], retryWaits: [] }).catch((x) => x);
    expect(e).toBeInstanceOf(ResupplyError); expect(e.kind).toBe("rate"); expect(e.tried).toEqual(["a.test : 429", "b.test : injoignable"]); // et non « injoignable » parce que le dernier serveur l'était
  });
  it("réponse 200 inutilisable (remarque d'erreur, corps illisible) : traitée comme une erreur du serveur, pas comme un succès vide", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok([], { remark: "runtime error: Query timed out in \"query\" at line 1 after 26 seconds." })));
    await expect(overpass("q", { mirrors: ["https://a.test/i"], retryWaits: [] })).rejects.toMatchObject({ kind: "timeout" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>")));
    await expect(overpass("q", { mirrors: ["https://a.test/i"], retryWaits: [] })).rejects.toMatchObject({ kind: "server" });
  });
  it("annulation par l'utilisateur : arrêt immédiat, sans autre essai", async () => {
    const c = new AbortController(); const f = vi.fn((_: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("x", "AbortError"))))); vi.stubGlobal("fetch", f);
    const p = overpass("q", { signal: c.signal, mirrors: ["https://a.test/i", "https://b.test/i"] }); c.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" }); expect(f).toHaveBeenCalledTimes(1);
  });
  it("long parcours : un tronçon en échec n'annule pas les autres ; résultat partiel signalé avec les kilomètres manquants", async () => {
    const long: LL[] = Array.from({ length: 900 }, (_, i) => [6 + i * 0.002, 45 + (i % 2) * 0.004] as LL); let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (_: string, init: RequestInit) => { const k = call++; if (k === 2) return new Response("", { status: 429 }); const m = /around:\d+,[\d.]+,([\d.]+)/.exec(decodeURIComponent(String(init.body)))!; return ok([el(k + 10, +m[1] + 0.001)]); }));
    let rep: import("../src/lib/resupply").ResupplyReport | null = null; const prog: number[] = [];
    const r = await findResupply(long, ["bakery"], 500, { mirrors: ["https://a.test/i"], retryWaits: [], gapMs: 0, onReport: (x) => { rep = x; }, onProgress: (d) => prog.push(d) });
    expect(rep!.chunks).toBeGreaterThan(5); expect(rep!.failed).toBe(1); expect(rep!.failedRanges).toHaveLength(1); expect(rep!.failedRanges[0][1]).toBeGreaterThan(rep!.failedRanges[0][0]);
    expect(r.length).toBe(rep!.chunks - 1); expect(prog.at(-1)).toBe(rep!.chunks);
  });
  it("tous les tronçons en échec : erreur levée rapidement, sans parcourir tout le tracé", async () => {
    const long: LL[] = Array.from({ length: 900 }, (_, i) => [6 + i * 0.002, 45 + (i % 2) * 0.004] as LL); const f = vi.fn(async () => { throw new TypeError("Failed to fetch"); }); vi.stubGlobal("fetch", f);
    await expect(findResupply(long, ["bakery"], 500, { mirrors: ["https://a.test/i"], retryWaits: [], gapMs: 0 })).rejects.toMatchObject({ kind: "network" }); expect(f).toHaveBeenCalledTimes(2);
  });
  it("rayon large : tracé davantage simplifié, donc moins de tronçons", () => {
    const wiggly: LL[] = Array.from({ length: 4000 }, (_, i) => [6 + i * 0.0005, 45 + Math.sin(i / 3) * 0.0006] as LL);
    expect(routeChunks(wiggly, 80, 200).length).toBeLessThan(routeChunks(wiggly, 80, 25).length);
  });
  it("tronçons bornés en longueur, et coupés en deux quand le serveur les juge trop lourds", async () => {
    const straight: LL[] = Array.from({ length: 300 }, (_, i) => [6 + i * 0.005, 45] as LL); // ~117 km en ligne droite
    const ch = routeChunks(straight, 80, 1, 25000); expect(ch.length).toBeGreaterThanOrEqual(3); expect(routeChunks(straight, 80, 1).length).toBe(1); for (let i = 1; i < ch.length; i++) expect(ch[i][0]).toEqual(ch[i - 1][ch[i - 1].length - 1]);
    expect(chunkLengthM(500)).toBe(10000); expect(chunkLengthM(2000)).toBe(5000); expect(chunkLengthM(5000)).toBe(4000); expect(chunkLengthM(100)).toBe(10000);
    const [a, b] = splitChunk([[6, 45], [6.1, 45], [6.2, 45], [6.3, 45]]); expect(a[a.length - 1]).toEqual(b[0]); expect(a.length + b.length).toBe(5); expect(splitChunk([[6, 45], [6.2, 45]])[0][1]).toEqual([6.1, 45]);
    // le serveur interrompt toute recherche de plus de 3 sommets : la recherche aboutit quand même, par moitiés
    const sizes: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_: string, init: RequestInit) => { const n = decodeURIComponent(String(init.body)).match(/around:\d+,([\d.,]+)\)/)![1].split(",").length / 2; sizes.push(n); return n > 3 ? ok([], { remark: "runtime error: Query timed out" }) : ok([el(sizes.length, 6.01)]); }));
    let rep: import("../src/lib/resupply").ResupplyReport | null = null;
    const r = await findResupply([[6, 45.0003], [6.01, 45.0003], [6.02, 45.0003], [6.03, 45.0003], [6.04, 45.0003], [6.05, 45.0003]], ["bakery"], 400, { mirrors: ["https://a.test/i"], retryWaits: [], gapMs: 0, onReport: (x) => { rep = x; } });
    expect(sizes[0]).toBe(6); expect(sizes.slice(1).every((n) => n <= 4)).toBe(true); expect(r.length).toBeGreaterThanOrEqual(2); expect(rep!.failed).toBe(0);
  });
});
