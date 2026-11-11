import { describe, it, expect, vi, afterEach } from "vitest";
import { buildQuery, routeChunks, kindOf, parsePlaces, findResupply, locateOnRoute, ResupplyError, RESUPPLY, DETOUR_FROM_M } from "../src/lib/resupply";
import { cumulative } from "../src/lib/geo";
import type { LL } from "../src/lib/types";

afterEach(() => vi.unstubAllGlobals());
const line: LL[] = Array.from({ length: 200 }, (_, i) => [6 + i * 0.001, 45 + Math.sin(i / 12) * 0.002] as LL); // ~16 km
const node = (id: number, lon: number, lat: number, tags: Record<string, string>) => ({ type: "node", id, lon, lat, tags });

describe("ravitaillement le long d'un parcours (OpenStreetMap)", () => {
  it("requête : rayon autour de la ligne, une clause par filtre, lat avant lon", () => {
    const q = buildQuery([[6, 45], [6.01, 45.002]], ["bakery", "water"], 500);
    expect(q).toContain("(around:500,45.00000,6.00000,45.00200,6.01000)"); expect(q).toContain('nwr["shop"="bakery"]'); expect(q).toContain('nwr["amenity"="drinking_water"]');
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
    const prog: number[] = []; const r = await findResupply(line, ["bakery"], 400, { onProgress: (d) => prog.push(d) });
    expect(r.map((p) => p.name)).toEqual(["A"]); expect(urls.some((u) => u.includes("private.coffee"))).toBe(true); expect(prog.at(-1)).toBeGreaterThanOrEqual(1);
  });
  it("erreurs typées : limite de requêtes, parcours trop long ; rien à chercher = liste vide", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(findResupply(line, ["bakery"], 400)).rejects.toMatchObject({ kind: "rate" });
    const huge: LL[] = [[-5, 43], [10, 60]]; await expect(findResupply(huge, ["bakery"], 400)).rejects.toBeInstanceOf(ResupplyError);
    expect(await findResupply(line, [], 400)).toEqual([]);
  });
});
