import { describe, it, expect } from "vitest";
import { DEFAULT_FILTERS, filterRoutes, isClosedTrack } from "../src/lib/route-model";
import { DEMO_VMS } from "./fixtures/synthetic";
import { difficultyOf, estimateMinutes } from "../src/lib/sports";

describe("catalogue", () => {
  it("sans filtre : tout le catalogue", () => expect(filterRoutes(DEMO_VMS, DEFAULT_FILTERS, [])).toHaveLength(DEMO_VMS.length));
  it("filtre discipline + distance", () => {
    const r = filterRoutes(DEMO_VMS, { ...DEFAULT_FILTERS, sports: ["rando"], maxKm: 26 }, []);
    expect(r.length).toBeGreaterThan(0); expect(r.every((x) => x.sport === "rando" && x.stats.distanceM <= 26000)).toBe(true);
  });
  it("recherche insensible aux accents et à la casse", () => expect(filterRoutes(DEMO_VMS, { ...DEFAULT_FILTERS, q: "PYRENEES" }, []).length).toBeGreaterThan(0));
  it("boucles uniquement", () => expect(filterRoutes(DEMO_VMS, { ...DEFAULT_FILTERS, loopOnly: true }, []).every((r) => r.loop)).toBe(true));
  it("officiels vérifiés = liste fournie", () => {
    expect(filterRoutes(DEMO_VMS, { ...DEFAULT_FILTERS, scope: "verified" }, [])).toHaveLength(0);
    expect(filterRoutes(DEMO_VMS, { ...DEFAULT_FILTERS, scope: "verified" }, [DEMO_VMS[0].id])).toHaveLength(1);
  });
  it("détection de boucle", () => { expect(isClosedTrack([[1, 1, 0], [2, 2, 0], [1, 1, 0]])).toBe(true); expect(isClosedTrack([[1, 1, 0], [2, 2, 0], [3, 3, 0]])).toBe(false); });
  it("durée et difficulté croissent avec l'effort", () => {
    expect(estimateMinutes("trail", 20000, 1500)).toBeGreaterThan(estimateMinutes("trail", 20000, 0));
    expect(difficultyOf(5000, 100)).toBe("facile"); expect(difficultyOf(50000, 3000)).toBe("expert");
  });
});

import { inFrance } from "../src/lib/geo";
describe("calques", () => {
  it("emprise France : Chamonix oui, Londres non", () => { expect(inFrance(6.87, 45.92)).toBe(true); expect(inFrance(-0.12, 51.5)).toBe(false); expect(inFrance(9.1, 42.3)).toBe(true); });
  it("filtre par calque", () => {
    const a = { ...DEMO_VMS[0], layer: "orga" };
    expect(filterRoutes([a, DEMO_VMS[1]], { ...DEFAULT_FILTERS, layers: ["orga"] }, [])).toHaveLength(1);
  });
});
