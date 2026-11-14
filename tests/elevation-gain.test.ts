import { describe, it, expect, vi, afterEach } from "vitest";
import { trackStats, smoothedElevations, gainLoss, resampleLine, rangeStats, haversine } from "../src/lib/geo";
import { fillGaps, addElevation } from "../src/lib/ign";
import type { LL, Pt } from "../src/lib/types";

const line = (n: number, f: (i: number) => number, stepDeg = 0.00025): Pt[] => Array.from({ length: n }, (_, i) => [6 + i * stepDeg, 45, f(i)] as Pt); // ≈ 20 m entre points

describe("dénivelé : lissage, seuil, portions", () => {
  it("montée régulière : D+ = différence d'altitude, D− nul", () => {
    const c = line(201, (i) => 1000 + i * 2); const s = trackStats(c); expect(Math.round(s.gainM)).toBe(400); expect(s.lossM).toBe(0);
  });
  it("bruit d'altitude (± 4 m, GPS ou pente latérale) : n'est plus compté comme du dénivelé", () => {
    const noisy = line(401, (i) => 1000 + (i % 2 ? 4 : -4)); const s = trackStats(noisy);
    const raw = (() => { let g = 0, ref = noisy[0][2]; for (const p of noisy) { const d = p[2] - ref; if (Math.abs(d) >= 3) { if (d > 0) g += d; ref = p[2]; } } return g; })();
    expect(raw).toBeGreaterThan(1500); expect(s.gainM).toBeLessThan(20); // 1 600 m « fantômes » avec l'ancien calcul
    const climb = line(401, (i) => 1000 + i * 1.5 + (i % 2 ? 4 : -4)); expect(Math.abs(trackStats(climb).gainM - 600)).toBeLessThan(30);
  });
  it("une vraie bosse de 30 m reste comptée", () => {
    const c = line(301, (i) => 1000 + (i > 100 && i < 200 ? 30 * Math.sin(((i - 100) / 100) * Math.PI) : 0)); const s = trackStats(c);
    expect(s.gainM).toBeGreaterThan(26); expect(s.lossM).toBeGreaterThan(26); expect(s.maxEle).toBeCloseTo(1030, 0);
  });
  it("fin de portion sous le seuil : comptée", () => { expect(gainLoss([0, 2], 0, 1, 3)).toEqual({ gainM: 2, lossM: 0 }); });
  it("lissage centré, sans décalage sur une pente régulière", () => { const c = line(50, (i) => i * 3); const e = smoothedElevations(c, 40); expect(e[25]).toBeCloseTo(75, 6); });
  it("portion sélectionnée : distance, D+ et D− de la zone", () => {
    const c = line(301, (i) => (i <= 150 ? 1000 + i * 2 : 1300 - (i - 150) * 2)); const total = trackStats(c).distanceM;
    const up = rangeStats(c, 0, total / 2), down = rangeStats(c, total / 2, total);
    expect(Math.round(up.gainM)).toBeGreaterThan(290); expect(up.lossM).toBeLessThan(5); expect(Math.round(down.lossM)).toBeGreaterThan(290);
    expect(rangeStats(c, total / 2, 0).distanceM).toBeCloseTo(total / 2, 6); // sens de sélection indifférent
  });
});

describe("altitudes : échantillonnage et données manquantes", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("densification : un point tous les 20 m, sommets conservés", () => {
    const l: LL[] = [[6, 45], [6.01, 45], [6.0101, 45.0001]]; const r = resampleLine(l, 20);
    const d = haversine(l[0], l[1]); expect(r.length).toBe(Math.floor(d / 20) + 1 + 1 + 1); expect(r[0]).toEqual([6, 45]); expect(r.at(-1)).toEqual([6.0101, 45.0001]);
    expect(r.some((p) => p[0] === 6.01 && p[1] === 45)).toBe(true);
  });
  it("trous comblés par interpolation, jamais par 0", () => {
    expect(fillGaps([undefined, -99999, 1000, undefined, 1040, -99999])).toEqual([1000, 1000, 1000, 1020, 1040, 1040]);
    expect(() => fillGaps([undefined, -99999])).toThrow();
  });
  it("ligne droite en mode libre : le relief entre les deux points est interrogé (vallée traversée)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { const lon = new URL(String(u)).searchParams.get("lon")!.split("|").map(Number); return new Response(JSON.stringify({ elevations: lon.map((x) => 2000 - 1000 * Math.sin(((x - 6) / 0.05) * Math.PI)) })); }));
    const c = await addElevation([[6, 45], [6.05, 45]]); const s = trackStats(c);
    expect(c.length).toBeGreaterThan(100); expect(s.minEle).toBeLessThan(1010); expect(s.lossM).toBeGreaterThan(950); expect(s.gainM).toBeGreaterThan(950);
  });
});
