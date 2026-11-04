import { describe, it, expect, vi, afterEach } from "vitest";
import { decodePolyline, chunkLine, pickBest, snapToPaths, routeSegment, COSTING, profileForSport, lineLength } from "../src/lib/routing";
import * as E from "../src/lib/editor-core";
import type { LL } from "../src/lib/types";

const enc = (pts: LL[], prec = 6) => { // encodeur de test (lat/lon)
  let out = "", la = 0, lo = 0; const f = 10 ** prec;
  const put = (v: number) => { let n = v < 0 ? ~(v << 1) : v << 1; while (n >= 32) { out += String.fromCharCode((32 | (n & 31)) + 63); n >>= 5; } out += String.fromCharCode(n + 63); };
  for (const [x, y] of pts) { const a = Math.round(y * f), b = Math.round(x * f); put(a - la); put(b - lo); la = a; lo = b; }
  return out;
};
const line = (n: number, dx = 0.0003): LL[] => Array.from({ length: n }, (_, i) => [6 + i * dx, 45 + Math.sin(i / 5) * 0.0004]);
afterEach(() => vi.unstubAllGlobals());

describe("moteur de tracé", () => {
  it("décode une polyligne (exemple de référence, précision 5)", () => {
    const d = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    expect(d).toHaveLength(3); expect(d[0]).toEqual([-120.2, 38.5]); expect(d[2][1]).toBeCloseTo(43.252, 3);
  });
  it("encode/décode sans perte (précision 6)", () => { const l = line(20); const back = decodePolyline(enc(l)); back.forEach((p, i) => { expect(p[0]).toBeCloseTo(l[i][0], 5); expect(p[1]).toBeCloseTo(l[i][1], 5); }); });
  it("profils : sentiers de montagne autorisés pour le trail, VTT sur graphe vélo", () => {
    expect(COSTING.trail.options.max_hiking_difficulty).toBeGreaterThanOrEqual(3);
    expect(COSTING.mtb).toMatchObject({ costing: "bicycle" }); expect(COSTING.mtb.options.bicycle_type).toBe("Mountain");
    expect(profileForSport("vtt")).toBe("mtb"); expect(profileForSport("trail")).toBe("trail"); expect(profileForSport("velo")).toBe("road");
  });
  it("auto : si une source échoue, l'autre est retenue ; sinon la plus directe", () => {
    const short = line(5), long = line(5, 0.0006);
    expect(pickBest(null, long)?.source).toBe("osm"); expect(pickBest(short, null)?.source).toBe("ign");
    expect(pickBest(short, long)?.source).toBe("ign"); expect(pickBest(long, short)?.source).toBe("osm");
    expect(pickBest(null, null)).toBeNull();
    expect(pickBest(short, short)?.source).toBe("osm"); // égalité : OpenStreetMap
  });
  it("découpage en fenêtres qui se chevauchent d'un point", () => {
    const c = chunkLine(Array.from({ length: 250 }, (_, i) => i), 120);
    expect(c.every((x) => x.length <= 120)).toBe(true); expect(c[0].at(-1)).toBe(c[1][0]); expect(c.at(-1)!.at(-1)).toBe(249);
    expect(chunkLine([1, 2, 3], 120)).toEqual([[1, 2, 3]]);
  });
  it("alignement : les fenêtres réussies sont remplacées, les échecs conservés, extrémités inchangées", async () => {
    const input = line(300, 0.0002); let call = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      call++; const shape = (JSON.parse(init.body).shape as { lat: number; lon: number }[]).map((p) => [p.lon, p.lat] as LL);
      if (call === 2 || call === 3) return new Response("{}", { status: 400 }); // la 2e fenêtre n'est pas alignable (2 tentatives)
      return new Response(JSON.stringify({ trip: { legs: [{ shape: enc(shape.map(([x, y]) => [x + 0.00001, y] as LL)) }] } }), { status: 200 });
    }));
    const r = await snapToPaths(input, "trail");
    expect(r.matched).toBeGreaterThan(0); expect(r.kept).toBe(1); // la 2e fenêtre échoue aux deux tentatives
    expect(r.line[0]).toEqual(input[0]); expect(r.line.at(-1)).toEqual(input.at(-1));
    for (let i = 1; i < r.line.length; i++) expect(Math.abs(r.line[i][0] - r.line[i - 1][0])).toBeLessThan(0.01); // pas de saut
  });
  it("alignement : un détour absurde est refusé", async () => {
    const input = line(30);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ trip: { legs: [{ shape: enc(line(30, 0.003)) }] } }), { status: 200 })));
    const r = await snapToPaths(input, "foot"); expect(r.matched).toBe(0); expect(r.kept).toBe(1);
    expect(lineLength(r.line)).toBeCloseTo(lineLength(input), -1);
  });
  it("tracé : l'itinéraire OpenStreetMap complète une absence côté IGN", async () => {
    const a: LL = [6.869, 45.923], b: LL = [6.88, 45.93];
    const osm = enc([a, [6.875, 45.926], b]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("data.geopf.fr")) return new Response("{}", { status: 400 }); // IGN : aucun chemin
      return new Response(JSON.stringify({ trip: { legs: [{ shape: osm }] } }), { status: 200 });
    }));
    const r = await routeSegment(a, b, { engine: "auto", profile: "trail" });
    expect(r?.source).toBe("osm"); expect(r?.line).toHaveLength(3); expect(r?.line[0][0]).toBeCloseTo(a[0], 5); expect(r?.line.at(-1)![0]).toBeCloseTo(b[0], 5);
  });
  it("VTT : n'interroge pas le graphe piéton de l'IGN", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ trip: { legs: [{ shape: enc(line(4)) }] } }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    await routeSegment([6.1, 45.1], [6.2, 45.2], { engine: "auto", profile: "mtb" });
    expect((f.mock.calls as unknown as string[][]).some((c) => String(c[0]).includes("data.geopf.fr"))).toBe(false);
  });
});

describe("alignement dans l'éditeur", () => {
  it("garde les points de passage et conserve les segments non alignés", async () => {
    let s = E.emptyState();
    const straight: E.Router = async (a, b) => [a, b];
    for (const [x, y] of [[6, 45], [6.01, 45.01], [6.02, 45]] as LL[]) s = (await E.addWaypoint(s, x, y, false, straight)).state;
    let n = 0;
    const r = await E.alignState(s, async (l) => (n++ === 0 ? [l[0], [6.005, 45.0049], l[1]] : null));
    expect(r.matched).toBe(1); expect(r.fallbacks).toBe(1);
    expect(r.state.waypoints).toEqual(s.waypoints);
    expect(r.state.segs[0]).toHaveLength(3); expect(r.state.segs[1]).toEqual(s.segs[1]);
    expect(E.trackLL(r.state)[0]).toEqual([6, 45]);
  });
});
