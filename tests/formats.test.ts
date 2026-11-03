// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseAny, serialize, GpsFileError, type GpsFormat } from "../src/lib/formats";
import { haversine, trackStats, simplifyIndices, densify } from "../src/lib/geo";
import { buildProfile } from "../src/lib/profile";
import type { Pt } from "../src/lib/types";

const track: Pt[] = [[6.87, 45.92, 1000], [6.871, 45.921, 1010], [6.872, 45.922, 1030], [6.873, 45.9225, 1020]];
const pois = [{ id: "1", type: "eau" as const, name: "Source <A&B>", lng: 6.871, lat: 45.921 }];

describe("formats GPS", () => {
  for (const f of ["gpx", "kml", "geojson", "tcx"] as GpsFormat[]) {
    it(`aller-retour ${f}`, () => {
      const out = serialize(f, { name: "Test é", coords: track, pois });
      const back = parseAny(out, `x.${f}`);
      expect(back.format).toBe(f);
      expect(back.coords).toHaveLength(4);
      expect(back.coords[2][2]).toBe(1030);
      expect(back.coords[0][0]).toBeCloseTo(6.87, 5);
      if (f !== "tcx") expect(back.pois[0].name).toBe("Source <A&B>");
    });
  }
  it("rejette un fichier vide", () => expect(() => parseAny("  ", "a.gpx")).toThrow(GpsFileError));
  it("rejette un XML mal formé", () => expect(() => parseAny("<gpx><trk>", "a.gpx")).toThrow(GpsFileError));
  it("rejette un format inconnu", () => expect(() => parseAny("hello", "a.txt")).toThrow(/Format non reconnu/));
  it("ignore les coordonnées invalides et prévient", () => {
    const gpx = `<gpx><trk><trkseg><trkpt lat="45" lon="6"><ele>1</ele></trkpt><trkpt lat="999" lon="6"></trkpt><trkpt lat="45.1" lon="6.1"><ele>2</ele></trkpt></trkseg></trk></gpx>`;
    const r = parseAny(gpx, "a.gpx");
    expect(r.coords).toHaveLength(2);
    expect(r.warnings.join(" ")).toMatch(/invalides/);
  });
  it("signale l'absence d'altitude", () => {
    const r = parseAny(`<gpx><trk><trkseg><trkpt lat="45" lon="6"/><trkpt lat="45.1" lon="6.1"/></trkseg></trk></gpx>`, "a.gpx");
    expect(r.hadElevation).toBe(false);
  });
  it("refuse un tracé à un seul point", () => expect(() => parseAny(`<gpx><trk><trkseg><trkpt lat="45" lon="6"/></trkseg></trk></gpx>`, "a.gpx")).toThrow(/2 points/));
});

describe("calculs", () => {
  it("haversine : 1° de latitude ≈ 111 km", () => expect(haversine([0, 0], [0, 1]) / 1000).toBeCloseTo(111.2, 0));
  it("D+ / D−", () => {
    const s = trackStats([[0, 0, 100], [0, 0.001, 150], [0, 0.002, 120]], 1);
    expect(s.gainM).toBe(50); expect(s.lossM).toBe(30); expect(s.minEle).toBe(100); expect(s.maxEle).toBe(150);
  });
  it("simplification garde début et fin", () => {
    const line = Array.from({ length: 200 }, (_, i) => [6 + i * 0.0001, 45 + Math.sin(i / 10) * 0.0005, 0]);
    const idx = simplifyIndices(line, 5);
    expect(idx[0]).toBe(0); expect(idx.at(-1)).toBe(199); expect(idx.length).toBeLessThan(200);
  });
  it("densify limite l'espacement", () => {
    const d = densify([[6, 45], [6.01, 45]], 100);
    for (let i = 1; i < d.length; i++) expect(haversine(d[i - 1], d[i])).toBeLessThanOrEqual(101);
  });
  it("pente d'un profil régulier ≈ 10 %", () => {
    const c: Pt[] = Array.from({ length: 30 }, (_, i) => [6, 45 + i * 0.0009, i * 10]);
    const p = buildProfile(c, 100);
    expect(p[15].grade).toBeGreaterThan(8); expect(p[15].grade).toBeLessThan(12);
  });
});
