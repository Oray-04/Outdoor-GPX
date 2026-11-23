import { describe, it, expect } from "vitest";
import { nearestOnLine, cumulative } from "../src/lib/geo";

describe("repère de survol : point le plus proche sur le tracé", () => {
  const line = [[6, 45, 1000], [6.01, 45, 1100], [6.01, 45.01, 1300]];
  it("projette sur le segment (position glissante), distance depuis le départ et altitude interpolées", () => {
    const n = nearestOnLine(line, [6.0025, 45.0004])!;
    expect(n.pt[0]).toBeCloseTo(6.0025, 6); expect(n.pt[1]).toBeCloseTo(45, 6);
    expect(n.distM).toBeCloseTo(cumulative(line)[1] / 4, 0); expect(n.alt).toBeCloseTo(1025, 0); expect(n.i).toBe(0);
  });
  it("deuxième segment, sommet le plus proche pour le profil ; tracé trop court", () => {
    const n = nearestOnLine(line, [6.0104, 45.008])!; expect(n.i).toBe(2); expect(n.alt).toBeCloseTo(1260, 0);
    expect(nearestOnLine([[6, 45]], [6, 45])).toBeNull();
  });
});
