import { describe, it, expect } from "vitest";
import { bearing, angleDiff } from "../src/lib/geo";
describe("cap et écart d'angle", () => {
  it("caps", () => { expect(bearing([6, 45], [6, 46])).toBeCloseTo(0, 0); expect(bearing([6, 45], [7, 45])).toBeCloseTo(90, 0); });
  it("écart d'angle signé", () => { expect(angleDiff(350, 10)).toBe(20); expect(angleDiff(10, 350)).toBe(-20); });
});
