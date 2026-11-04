import { describe, it, expect, vi, afterEach } from "vitest";
import { tileX, tileY, tileRange, countTiles, tileList, tileUrl, estimateMB, bboxAround, covers, tileInPack, packsCoverRoute, downloadTiles, deletePackTiles, MAX_TILES, OFFLINE_BASEMAPS, type OfflinePack, type BBox } from "../src/lib/offline";
import { BASEMAPS } from "../src/lib/basemaps";

const plan = BASEMAPS.find((b) => b.id === "ign-plan")!;
const chamonix: [number, number] = [6.8694, 45.9237];
afterEach(() => vi.unstubAllGlobals());

/** Faux Cache Storage en mémoire. */
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = { match: async (u: string) => store.get(u)?.clone(), put: async (u: string, r: Response) => { store.set(u, r); }, delete: async (u: string) => store.delete(u) };
  vi.stubGlobal("caches", { open: async () => cache });
  return store;
}

describe("cartes hors ligne : calcul des tuiles", () => {
  it("coordonnées de tuile connues (Chamonix)", () => {
    expect([tileX(chamonix[0], 12), tileY(chamonix[1], 12)]).toEqual([2126, 1458]);
    expect([tileX(chamonix[0], 17), tileY(chamonix[1], 17)]).toEqual([68037, 46670]);
  });
  it("le nombre de tuiles croît ~×4 par niveau de zoom", () => {
    const b = bboxAround([chamonix], 5);
    const n14 = countTiles(b, 14, 14), n15 = countTiles(b, 15, 15);
    expect(n15 / n14).toBeGreaterThan(3); expect(n15 / n14).toBeLessThan(5);
  });
  it("la liste énumère exactement le nombre annoncé, toutes dans l'emprise", () => {
    const b = bboxAround([chamonix, [6.9, 45.95]], 1);
    const list = [...tileList(b, 11, 15)];
    expect(list.length).toBe(countTiles(b, 11, 15));
    for (const [z, x, y] of list) { const r = tileRange(b, z); expect(x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1).toBe(true); }
  });
  it("adresse de tuile IGN complète", () => {
    const u = tileUrl(plan, 12, 2126, 1458);
    expect(u).toContain("data.geopf.fr/wmts"); expect(u).toContain("TILEMATRIX=12"); expect(u).toContain("TILECOL=2126"); expect(u).toContain("TILEROW=1458");
  });
  it("seuls les fonds IGN sont téléchargeables", () => { expect(OFFLINE_BASEMAPS).toEqual(["ign-plan", "ign-photo"]); expect(OFFLINE_BASEMAPS.every((id) => BASEMAPS.find((b) => b.id === id)!.tiles.includes("data.geopf.fr"))).toBe(true); });
  it("un parcours de 10 km avec 1,5 km de marge tient sous le plafond aux zooms de navigation (10–16)", () => {
    const route = Array.from({ length: 50 }, (_, i) => [6.87 + i * 0.0018, 45.92 + Math.sin(i / 6) * 0.01]);
    const n = countTiles(bboxAround(route, 1.5), 10, 16);
    expect(n).toBeLessThan(MAX_TILES); expect(n).toBeGreaterThan(100);
    expect(estimateMB(n, "ign-plan")).toBeGreaterThan(1);
  });
  it("couverture : une zone couvre un tracé si elle le contient et descend assez en zoom", () => {
    const route: BBox = [6.87, 45.92, 6.9, 45.94];
    const pack = (bbox: BBox, zmin = 10, zmax = 16): OfflinePack => ({ id: "p", name: "p", bbox, zmin, zmax, basemap: "ign-plan", tiles: 1, bytes: 1, failed: 0, createdAt: 0, routeIds: [] });
    expect(covers(pack([6.8, 45.9, 6.95, 45.99]).bbox, route)).toBe(true);
    expect(packsCoverRoute([pack([6.8, 45.9, 6.95, 45.99])], route)).toBeDefined();
    expect(packsCoverRoute([pack([6.88, 45.9, 6.95, 45.99])], route)).toBeUndefined();          // ne contient pas tout le tracé
    expect(packsCoverRoute([pack([6.8, 45.9, 6.95, 45.99], 10, 12)], route)).toBeUndefined();   // pas assez détaillée pour naviguer
    expect(tileInPack(pack([6.8, 45.9, 6.95, 45.99]), 12, tileX(6.87, 12), tileY(45.92, 12))).toBe(true);
    expect(tileInPack(pack([6.8, 45.9, 6.95, 45.99]), 18, 1, 1)).toBe(false);
  });
});

describe("téléchargement et suppression", () => {
  it("télécharge, saute les tuiles déjà présentes, compte les octets", async () => {
    const store = fakeCaches(); store.set("u1", new Response("deja"));
    const f = vi.fn(async () => new Response("x".repeat(100), { status: 200 })); vi.stubGlobal("fetch", f);
    const seen: number[] = [];
    const r = await downloadTiles(["u1", "u2", "u3", "u4"], { onProgress: (p) => seen.push(p.done), concurrency: 2 });
    expect(r).toMatchObject({ done: 4, total: 4, failed: 0, bytes: 300 }); expect(f).toHaveBeenCalledTimes(3);
    expect(store.size).toBe(4); expect(seen.at(-1)).toBe(4);
  });
  it("les échecs isolés sont comptés mais n'interrompent pas", async () => {
    fakeCaches(); let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n % 3 === 0 ? new Response("", { status: 500 }) : new Response("ok"))));
    const r = await downloadTiles(Array.from({ length: 12 }, (_, i) => `t${i}`), { concurrency: 1 });
    expect(r.failed).toBe(4); expect(r.done).toBe(12);
  });
  it("arrêt après trop d'échecs consécutifs (connexion coupée)", async () => {
    fakeCaches(); vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("réseau"); }));
    await expect(downloadTiles(Array.from({ length: 200 }, (_, i) => `t${i}`), { concurrency: 1 })).rejects.toThrow(/échecs consécutifs/);
  });
  it("annulation", async () => {
    fakeCaches(); const c = new AbortController(); let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { if (++n === 3) c.abort(); return new Response("ok"); }));
    await expect(downloadTiles(Array.from({ length: 50 }, (_, i) => `t${i}`), { concurrency: 1, signal: c.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("supprimer une zone garde les tuiles partagées avec une autre zone", async () => {
    const store = fakeCaches();
    const A: OfflinePack = { id: "A", name: "A", bbox: [6.85, 45.9, 6.93, 45.96], zmin: 12, zmax: 13, basemap: "ign-plan", tiles: 0, bytes: 0, failed: 0, createdAt: 0, routeIds: [] };
    const B: OfflinePack = { ...A, id: "B", bbox: [6.9, 45.9, 6.98, 45.96] };   // chevauche A à l'est
    for (const p of [A, B]) for (const [z, x, y] of tileList(p.bbox, p.zmin, p.zmax)) store.set(tileUrl(plan, z, x, y), new Response("t"));
    const before = store.size;
    const removed = await deletePackTiles(A, [A, B]);
    expect(removed).toBeGreaterThan(0); expect(store.size).toBe(before - removed);
    for (const [z, x, y] of tileList(B.bbox, B.zmin, B.zmax)) expect(store.has(tileUrl(plan, z, x, y))).toBe(true); // B reste intacte
  });
});
