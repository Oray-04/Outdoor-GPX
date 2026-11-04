import { describe, it, expect } from "vitest";
import { destination, loopWaypoints, overlapRatio, lineKm, fitLoop, scoreProposal, pickDistinct, generateLoops, type GenDeps } from "../src/lib/generator";
import { haversine } from "../src/lib/geo";
import type { LL, Pt } from "../src/lib/types";

const start: LL = [6.8694, 45.9237];

/** Faux routeur : relie les points par des lignes droites, rallongées d'un facteur de détour fixe. */
const fakeVia = (detour: number): GenDeps["via"] => async (pts) => {
  const out: LL[] = [];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const mid: LL = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * (detour - 1) * 0.5, (a[1] + b[1]) / 2 - (b[0] - a[0]) * (detour - 1) * 0.5]; out.push(...(i === 1 ? [a] : []), mid, b); }
  return out;
};
const elevate = (slope: number): GenDeps["elevate"] => async (l) => l.map((p, i) => [p[0], p[1], 1000 + Math.round(Math.sin(i / 15) * slope)] as Pt);

describe("générateur de boucles", () => {
  it("destination : 1 km au nord ≈ 0,009° de latitude", () => { const d = destination(start, 0, 1000); expect(d[1] - start[1]).toBeCloseTo(0.008993, 4); expect(d[0]).toBeCloseTo(start[0], 6); });
  it("points de passage : boucle fermée sur le départ, sur un cercle", () => {
    const w = loopWaypoints(start, 1000, 90); expect(w).toHaveLength(5); expect(w[0]).toEqual(start); expect(w.at(-1)).toEqual(start);
    const c = destination(start, 90, 1000); w.slice(1, -1).forEach((p) => expect(haversine(c, p)).toBeCloseTo(1000, -1));
  });
  it("repérage des allers-retours", () => {
    const aller: LL[] = Array.from({ length: 60 }, (_, i) => [6 + i * 0.0003, 45]);
    expect(overlapRatio([...aller, ...[...aller].reverse()])).toBeGreaterThan(0.4);
    const cercle: LL[] = Array.from({ length: 120 }, (_, i) => destination([6, 45], i * 3, 1500));
    expect(overlapRatio(cercle)).toBeLessThan(0.05);
  });
  it("ajuste le rayon pour atteindre la distance cible", async () => {
    for (const target of [8, 15, 30]) {
      const r = await fitLoop(start, 45, target, "trail", { via: fakeVia(1.8), elevate: elevate(0) });
      expect(r).not.toBeNull(); expect(Math.abs(r!.km - target) / target).toBeLessThan(0.1);
    }
  });
  it("si aucun chemin n'existe, renvoie null sans boucle infinie", async () => {
    let calls = 0; const r = await fitLoop(start, 0, 10, "mtb", { via: async () => { calls++; return null; }, elevate: elevate(0) });
    expect(r).toBeNull(); expect(calls).toBeLessThanOrEqual(4);
  });
  it("classement : la distance et le D+ proches des cibles passent devant, l'aller-retour est pénalisé", () => {
    const good = scoreProposal({ distanceM: 10000, gainM: 500, overlapPct: 0 }, 10, 500);
    expect(good).toBe(0);
    expect(scoreProposal({ distanceM: 13000, gainM: 500, overlapPct: 0 }, 10, 500)).toBeGreaterThan(good);
    expect(scoreProposal({ distanceM: 10000, gainM: 100, overlapPct: 0 }, 10, 500)).toBeGreaterThan(good);
    expect(scoreProposal({ distanceM: 10000, gainM: 500, overlapPct: 60 }, 10, 500)).toBeGreaterThan(good);
    expect(scoreProposal({ distanceM: 10000, gainM: 5, overlapPct: 0 }, 10, null)).toBe(0); // D+ indifférent
  });
  it("propositions variées : directions séparées d'au moins 50°", () => {
    const c = [0, 20, 45, 90, 135, 180, 225, 270].map((b, i) => ({ bearing: b, score: i * 0.1 }));
    const picked = pickDistinct(c, 4);
    expect(picked).toHaveLength(4);
    for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) expect(Math.abs(((picked[i].bearing - picked[j].bearing + 540) % 360) - 180)).toBeGreaterThanOrEqual(50);
  });
  it("génération complète : N propositions, classées, avec progression", async () => {
    const seen: string[] = [];
    const res = await generateLoops({ start, targetKm: 12, targetGain: 600, profile: "trail", count: 4 }, { via: fakeVia(1.6), elevate: elevate(300), surface: async () => ({ offRoadPct: 80, pathPct: 40 }) }, { onProgress: (p) => seen.push(p.phase) });
    expect(res).toHaveLength(4);
    for (let i = 1; i < res.length; i++) expect(res[i].score).toBeGreaterThanOrEqual(res[i - 1].score);
    res.forEach((p) => { expect(Math.abs(p.distanceM / 1000 - 12) / 12).toBeLessThan(0.25); expect(p.coords.length).toBe(p.line.length); expect(p.offRoadPct).toBe(80); });
    expect(new Set(seen)).toEqual(new Set(["tracé", "altitudes", "analyse"]));
  });
  it("annulation propagée au routeur", async () => {
    const ctrl = new AbortController(); let got: AbortSignal | undefined;
    await generateLoops({ start, targetKm: 5, targetGain: null, profile: "foot", count: 1, directions: 2 }, { via: async (_p, _pr, s) => { got = s; return fakeVia(1.5)(_p, _pr); }, elevate: elevate(0) }, { signal: ctrl.signal });
    expect(got).toBe(ctrl.signal);
  });
  it("longueur calculée cohérente", () => { expect(lineKm([[6, 45], [6, 45.009]])).toBeCloseTo(1, 1); });
});
