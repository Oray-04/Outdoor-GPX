import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchElevations, ElevationError, lastElevationSource, resetElevationBreaker } from "../src/lib/ign";
import { generateLoops, GenerationError, type GenDeps } from "../src/lib/generator";
import { RoutingError } from "../src/lib/routing";
import type { LL, Pt } from "../src/lib/types";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); resetElevationBreaker(); });
const pts = (n: number, o = 0): LL[] => Array.from({ length: n }, (_, i) => [6 + o + i * 0.0001, 45 + o] as LL);
const ok = (elevations: number[]) => new Response(JSON.stringify({ elevations }), { status: 200 });

describe("service d'altitudes : reprises et secours", () => {
  it("429 puis succès : la requête est rejouée sans erreur", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => (++n < 3 ? new Response("", { status: 429 }) : ok(Array(5).fill(1200)))));
    const r = await fetchElevations(pts(5, 10));
    expect(r).toEqual([1200, 1200, 1200, 1200, 1200]); expect(n).toBe(3); expect(lastElevationSource).toBe("ign");
  }, 15000);
  it("erreur réseau / CORS (TypeError) : reprise puis succès", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { if (++n < 2) throw new TypeError("Failed to fetch"); return ok(Array(4).fill(800)); }));
    expect(await fetchElevations(pts(4, 11))).toEqual([800, 800, 800, 800]);
  }, 15000);
  it("IGN durablement indisponible : repli Open-Meteo, signalé", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (String(u).includes("open-meteo") ? new Response(JSON.stringify({ elevation: [500, 510, 520] }), { status: 200 }) : new Response("", { status: 503 }))));
    expect(await fetchElevations(pts(3, 12))).toEqual([500, 510, 520]); expect(lastElevationSource).toBe("open-meteo");
  }, 30000);
  it("les deux services en panne : erreur typée (pas de plantage opaque)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(fetchElevations(pts(3, 13))).rejects.toMatchObject({ kind: "rate", status: 429 });
  }, 30000);
  it("service coupé : après un échec, les lots suivants échouent vite (pas de reprises à chaque lot)", async () => {
    const f = vi.fn(async () => new Response("", { status: 503 })); vi.stubGlobal("fetch", f);
    await expect(fetchElevations(pts(300, 15))).rejects.toBeInstanceOf(ElevationError);
    const calls = f.mock.calls.length; const t0 = Date.now();
    await expect(fetchElevations(pts(300, 16))).rejects.toBeInstanceOf(ElevationError);
    expect(f.mock.calls.length).toBe(calls); expect(Date.now() - t0).toBeLessThan(500); // aucune nouvelle requête
  }, 40000);
  it("IGN coupé, secours disponible : les lots suivants passent directement par le secours", async () => {
    let ign = 0; vi.stubGlobal("fetch", vi.fn(async (u: string) => { if (String(u).includes("open-meteo")) { const n = new URL(String(u)).searchParams.get("latitude")!.split(",").length; return new Response(JSON.stringify({ elevation: Array(n).fill(700) }), { status: 200 }); } ign++; return new Response("", { status: 503 }); }));
    await fetchElevations(pts(130, 17)); const first = ign; await fetchElevations(pts(130, 18)); expect(ign).toBe(first); expect(lastElevationSource).toBe("open-meteo");
  }, 40000);
  it("lots de 120 points, plus de 2 requêtes simultanées jamais", async () => {
    let cur = 0, max = 0;
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { cur++; max = Math.max(max, cur); await new Promise((r) => setTimeout(r, 30)); cur--; const n = new URL(u).searchParams.get("lon")!.split("|").length; return ok(Array(n).fill(900)); }));
    const r = await fetchElevations(pts(500, 14)); expect(r).toHaveLength(500); expect(max).toBeLessThanOrEqual(2);
  }, 15000);
});

describe("génération : erreurs précises et résilience", () => {
  const start: LL = [6.87, 45.92];
  const line = (a: LL): LL[] => Array.from({ length: 30 }, (_, i) => [a[0] + i * 0.0013, a[1] + Math.sin(i / 5) * 0.001] as LL);
  const goodVia: GenDeps["via"] = async (p) => line(p[0]);
  const goodEle: GenDeps["elevate"] = async (l) => l.map((p, i) => [p[0], p[1], 1000 + i * 3] as Pt);
  it("routage en panne (429) sur toutes les directions → GenerationError « routing » avec cause", async () => {
    const via: GenDeps["via"] = async () => { throw new RoutingError("rate", 429); };
    await expect(generateLoops({ start, targetKm: 10, targetGain: 500, profile: "trail" }, { via, elevate: goodEle })).rejects.toMatchObject({ kind: "routing", detail: { reason: "rate", status: 429 } });
  });
  it("altitudes en panne → GenerationError « elevation »", async () => {
    const elevate: GenDeps["elevate"] = async () => { throw new ElevationError("server", 503); };
    const e = await generateLoops({ start, targetKm: 3, targetGain: 500, profile: "trail", directions: 4 }, { via: goodVia, elevate }).catch((x) => x);
    expect(e).toBeInstanceOf(GenerationError); expect(e).toMatchObject({ kind: "elevation", detail: { reason: "server", status: 503 } });
  });
  it("une seule direction en échec n'empêche pas les autres de produire des propositions", async () => {
    let n = 0; const via: GenDeps["via"] = async (p) => { if (++n === 1) throw new RoutingError("network"); return line(p[0]); };
    const r = await generateLoops({ start, targetKm: 3, targetGain: null, profile: "trail", directions: 6 }, { via, elevate: goodEle });
    expect(r.length).toBeGreaterThan(0);
  });
  it("aucun chemin (null, pas une panne) : aucune erreur, liste vide", async () => {
    const r = await generateLoops({ start, targetKm: 10, targetGain: 500, profile: "trail", directions: 4 }, { via: async () => null, elevate: goodEle });
    expect(r).toEqual([]);
  });
});
