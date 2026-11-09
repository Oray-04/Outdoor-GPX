import { describe, it, expect } from "vitest";
import { destination, loopWaypoints, overlapRatio, lineKm, fitLoop, scoreProposal, pickDistinct, generateLoops, type GenDeps } from "../src/lib/generator";
import { haversine, densify } from "../src/lib/geo";
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
    expect(new Set(seen)).toEqual(new Set(["relief", "tracé", "altitudes", "analyse"]));
  });
  it("annulation propagée au routeur", async () => {
    const ctrl = new AbortController(); let got: AbortSignal | undefined;
    await generateLoops({ start, targetKm: 5, targetGain: null, profile: "foot", count: 1, directions: 2 }, { via: async (_p, _pr, s) => { got = s; return fakeVia(1.5)(_p, _pr); }, elevate: elevate(0) }, { signal: ctrl.signal });
    expect(got).toBe(ctrl.signal);
  });
  it("longueur calculée cohérente", () => { expect(lineKm([[6, 45], [6, 45.009]])).toBeCloseTo(1, 1); });
});

describe("génération avec D+ cible (terrain simulé)", () => {
  // MNT synthétique : altitude = f(position). Le routeur factice relie les points en ligne brisée.
  const dem = (amp: number, wavelengthM: number, tilt = 0): GenDeps["elevate"] => async (l) => l.map((p) => {
    const x = (p[0] - start[0]) * 78000, y = (p[1] - start[1]) * 111000;
    return [p[0], p[1], 1000 + amp * (Math.sin(x / wavelengthM) + Math.cos(y / wavelengthM)) + tilt * x / 1000] as Pt;
  });
  const deps = (el: GenDeps["elevate"]): GenDeps => ({ via: async (pts, pr) => { const l = await fakeVia(1.5)(pts, pr); return l && densify(l, 40); }, elevate: el }); // routeur factice dense, comme un vrai tracé
  it("marge ±20 % : bornes correctes", async () => {
    const { gainWithinTolerance } = await import("../src/lib/generator");
    expect(gainWithinTolerance(800, 1000)).toBe(true); expect(gainWithinTolerance(1200, 1000)).toBe(true);
    expect(gainWithinTolerance(799, 1000)).toBe(false); expect(gainWithinTolerance(1201, 1000)).toBe(false);
    expect(gainWithinTolerance(500, null)).toBeNull();
  });
  it("le D+ affiché est exactement celui du tracé généré", async () => {
    const { trackStats } = await import("../src/lib/geo");
    const res = await generateLoops({ start, targetKm: 12, targetGain: 400, profile: "trail", count: 3 }, deps(dem(150, 1500)));
    expect(res.length).toBeGreaterThan(0);
    for (const p of res) { const st = trackStats(p.coords, 3); expect(p.gainM).toBe(st.gainM); expect(p.lossM).toBe(st.lossM); expect(p.distanceM).toBeCloseTo(st.distanceM, 3); }
  });
  it("terrain plat : D+ faible, 1000 m demandés → aucune boucle dans la marge, signalé honnêtement", async () => {
    const res = await generateLoops({ start, targetKm: 15, targetGain: 1000, profile: "trail", count: 3 }, deps(dem(3, 2000)));
    expect(res.every((p) => p.gainM < 300)).toBe(true); expect(res.some((p) => p.gainOk)).toBe(false);
  });
  for (const [name, amp, wl, target] of [["vallonné", 60, 900, 400], ["montagneux", 400, 1800, 1000]] as const) {
    it(`terrain ${name} : trouve des boucles continues dans la marge ±20 % de ${target} m`, async () => {
      const res = await generateLoops({ start, targetKm: 15, targetGain: target, profile: "trail", count: 4 }, deps(dem(amp, wl)));
      expect(res.length).toBeGreaterThan(0);
      expect(res.some((p) => p.gainOk), `D+ obtenus : ${res.map((p) => Math.round(p.gainM)).join(", ")}`).toBe(true);
      expect(res[0].gainOk).toBe(true); // les boucles dans la marge sont classées en premier
      for (const p of res) { // continuité : pas de saut > 60 m, boucle fermée sur le départ
        for (let i = 1; i < p.line.length; i++) expect(haversine(p.line[i - 1], p.line[i])).toBeLessThan(60);
        expect(haversine(p.line[0], p.line.at(-1)!)).toBeLessThan(30);
      }
    });
  }
});

describe("nettoyage des tracés générés (removeSpurs)", () => {
  // boucle carrée d'environ 4 km, sommets tous les ~100 m
  const side = (a: LL, b: LL, n = 10): LL[] => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as LL);
  const A: LL = [6, 45], B: LL = [6.0127, 45], C: LL = [6.0127, 45.009], D: LL = [6, 45.009];
  const square = (): LL[] => [...side(A, B), ...side(B, C), ...side(C, D), ...side(D, A), A];
  const withSpur = (len: number): LL[] => { // antenne en cul-de-sac greffée au coin B : aller puis retour par les mêmes sommets
    const sq = square(); const out: LL[] = Array.from({ length: len }, (_, i) => [B[0] + (i + 1) * 0.0006, B[1] - (i + 1) * 0.0003] as LL);
    return [...sq.slice(0, 11), ...out, ...out.slice(0, -1).reverse(), B, ...sq.slice(11)];
  };
  it("retire une antenne aller-retour, garde la boucle, les extrémités et la continuité", async () => {
    const { removeSpurs, maxStepM } = await import("../src/lib/generator");
    const dirty = withSpur(4), clean = square();
    const r = removeSpurs(dirty);
    expect(r.spurs).toBe(1); expect(r.removedM).toBeGreaterThan(300);
    expect(r.line[0]).toEqual(A); expect(r.line.at(-1)).toEqual(A);
    expect(lineKm(r.line)).toBeCloseTo(lineKm(clean), 2);                 // la boucle d'origine est retrouvée, rien de plus n'a été coupé
    expect(maxStepM(r.line)).toBeLessThan(160);                           // aucun trou créé
    expect(overlapRatio(r.line)).toBeLessThan(overlapRatio(dirty));
  });
  it("ne touche pas à un tracé sans antenne (vrais virages, épingles) ni aux très petits décrochements", async () => {
    const { removeSpurs } = await import("../src/lib/generator");
    const sq = square(); expect(removeSpurs(sq).line).toEqual(sq); expect(removeSpurs(sq).spurs).toBe(0);
    const hairpin: LL[] = [[6, 45], [6.002, 45.0005], [6.004, 45.001], [6.0042, 45.0013], [6.004, 45.0016], [6.002, 45.0021], [6, 45.0026], [5.998, 45.004], [6, 45]]; // épingle : montée et descente NE coïncident PAS
    expect(removeSpurs(hairpin).line).toEqual(hairpin);
    const tiny: LL[] = [...sq.slice(0, 11), [B[0] + 0.00008, B[1]], B, ...sq.slice(11)]; // ~6 m : en dessous du seuil
    expect(removeSpurs(tiny).spurs).toBe(0);
  });
  it("un long aller-retour (part importante du parcours) est conservé ; un pur aller-retour aussi", async () => {
    const { removeSpurs } = await import("../src/lib/generator");
    const big = withSpur(40); expect(removeSpurs(big).spurs).toBe(0);     // ~2,7 km d'aller-retour sur 6,7 km : choix d'itinéraire, pas un parasite
    const out: LL[] = Array.from({ length: 20 }, (_, i) => [6 + i * 0.001, 45] as LL); const ar = [...out, ...out.slice(0, -1).reverse()];
    expect(removeSpurs(ar).line).toEqual(ar);
  });
  it("antennes imbriquées et multiples : toutes retirées", async () => {
    const { removeSpurs } = await import("../src/lib/generator");
    const sq = square();
    const spur = (o: LL, dx: number, dy: number, n: number): LL[] => { const out = Array.from({ length: n }, (_, i) => [o[0] + (i + 1) * dx, o[1] + (i + 1) * dy] as LL); return [...out, ...out.slice(0, -1).reverse(), o]; };
    // antenne au coin B, contenant elle-même une petite antenne, puis une autre antenne au coin C
    const inner = spur([B[0] + 0.0012, B[1] - 0.0006], 0.0004, 0.0005, 2);
    const outer: LL[] = [[B[0] + 0.0006, B[1] - 0.0003], [B[0] + 0.0012, B[1] - 0.0006], ...inner, [B[0] + 0.0018, B[1] - 0.0009], [B[0] + 0.0012, B[1] - 0.0006], [B[0] + 0.0006, B[1] - 0.0003], B];
    const two = [...sq.slice(0, 11), ...outer, ...sq.slice(11, 21), ...spur(C, 0.0005, 0.0004, 3), ...sq.slice(21)];
    const r = removeSpurs(two); expect(r.spurs).toBeGreaterThanOrEqual(3); expect(r.line).toEqual(sq);
  });
});
