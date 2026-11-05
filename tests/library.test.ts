// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { findDuplicates, validateCoords, entryIssues, toSavedRoute, norm, CATEGORIES, type LibEntry } from "../src/lib/library";
import { trackStats } from "../src/lib/geo";
import { toGpx, parseGpx } from "../src/lib/formats";
import type { Pt } from "../src/lib/types";

const DIR = path.resolve(__dirname, "../public/library");
const index: LibEntry[] = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
const coordsOf = (id: string): Pt[] => JSON.parse(fs.readFileSync(path.join(DIR, "routes", `${id}.json`), "utf8")).coords;

describe("bibliothèque d'itinéraires intégrée (données réelles)", () => {
  it("contient des itinéraires GR et cyclistes, chacun avec sa source et sa licence", () => {
    expect(index.length).toBeGreaterThanOrEqual(15);
    expect(index.some((e) => e.category === "gr")).toBe(true); expect(index.some((e) => /velo/.test(e.practice))).toBe(true);
    for (const e of index) {
      expect(CATEGORIES.some((c) => c.id === e.category), e.id).toBe(true);
      expect(e.source.license, e.id).toBe("ODbL 1.0"); expect(e.source.url, e.id).toMatch(/^https:\/\/www\.openstreetmap\.org\/relation\/\d+$/);
      expect(e.source.attribution).toMatch(/OpenStreetMap/); expect(e.name && e.region && e.start && e.end, e.id).toBeTruthy();
    }
  });
  it("aucun doublon (même nom, même relation, même géométrie)", () => { expect(findDuplicates(index)).toEqual([]); expect(new Set(index.map((e) => e.id)).size).toBe(index.length); });
  it.each(index.map((e) => [e.id, e] as const))("%s : fichier de tracé valide, continu, statistiques cohérentes avec l'index", (id, e) => {
    const c = coordsOf(id);
    expect(c.length).toBe(e.points);
    expect(validateCoords(c, { maxJumpM: 3000 }), "problèmes de validité").toEqual([]);
    const st = trackStats(c, 3);
    expect(Math.abs(st.distanceM - e.distanceM)).toBeLessThan(e.distanceM * 0.001 + 5); expect(Math.abs(st.gainM - e.gainM)).toBeLessThan(2); expect(Math.abs(st.lossM - e.lossM)).toBeLessThan(2);
    expect(e.gainM).toBeGreaterThanOrEqual(0); expect(e.maxEle).toBeGreaterThanOrEqual(e.minEle);
    expect(c.every((p) => p[2] > -50 && p[2] < 4900), "altitudes plausibles").toBe(true);
    expect(entryIssues(e), "alertes de qualité").toEqual([]);
  });
  it("un itinéraire de la bibliothèque s'exporte en GPX relisible et se convertit en parcours éditable", () => {
    const e = index.find((x) => x.id === "gr20") ?? index[0]; const c = coordsOf(e.id);
    const back = parseGpx(toGpx({ name: e.name, coords: c, pois: [] }));
    expect(back.coords.length).toBe(c.length);
    const r = toSavedRoute(e, c, "t1"); expect(r.coords.length).toBe(c.length); expect(r.waypoints.length).toBeGreaterThan(2); expect(r.segs.length).toBe(r.waypoints.length - 1);
    expect(r.sourceUrl).toBe(e.source.url); expect(r.description).toMatch(/OpenStreetMap/);
  });
});

describe("contrôle de validité et anti-doublons", () => {
  it("détecte points invalides, sauts et traces trop courtes", () => {
    expect(validateCoords([[6, 45, 0]])).toContain("Moins de 2 points.");
    expect(validateCoords([[6, 45, 0], [6.0001, 45, 0], [200, 45, 0]]).some((m) => /invalides/.test(m))).toBe(true);
    expect(validateCoords([[6, 45, 0], [6.1, 45, 0], [8, 47, 0]], { maxJumpM: 5000 }).some((m) => /Saut/.test(m))).toBe(true);
    expect(validateCoords([[6, 45, 0], [6.01, 45, 0], [6.02, 45, 0]])).toEqual([]);
  });
  it("repère deux entrées de même nom normalisé ou de même géométrie", () => {
    const base = index[0];
    const dup = { ...base, id: "autre", source: { ...base.source, relation: 1 }, hash: "x" } as LibEntry;
    expect(findDuplicates([base, dup]).length).toBe(1); // même nom
    expect(norm("GR 20 — Corse")).toBe(norm("gr 20 corse"));
    expect(findDuplicates([base, { ...dup, name: "Autre nom", distanceM: base.distanceM * 1.5 }])).toEqual([]);
  });
});
