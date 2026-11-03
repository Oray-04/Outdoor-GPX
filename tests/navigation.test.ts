import { describe, it, expect } from "vitest";
import { bearing, angleDiff, navigate, OffRouteDetector, recordingStats, acceptFix, cumOf } from "../src/lib/navigation";

// route vers le nord sur 1 km, puis virage à droite vers l'est
const north = Array.from({ length: 11 }, (_, i) => [6, 45 + i * 0.0009, 100] as [number, number, number]);
const east = Array.from({ length: 10 }, (_, i) => [6 + (i + 1) * 0.0013, 45.009, 100] as [number, number, number]);
const route = [...north, ...east];
const cum = cumOf(route);

describe("navigation", () => {
  it("caps", () => { expect(bearing([6, 45], [6, 46])).toBeCloseTo(0, 0); expect(bearing([6, 45], [7, 45])).toBeCloseTo(90, 0); });
  it("écart d'angle signé", () => { expect(angleDiff(350, 10)).toBe(20); expect(angleDiff(10, 350)).toBe(-20); });
  it("sur la trace : écart nul, tout droit", () => {
    const s = navigate(route, cum, [6, 45.0018]);
    expect(s.offM).toBeLessThan(1); expect(s.hint).toBe("straight"); expect(s.remainM).toBeGreaterThan(1500);
  });
  it("annonce un virage à droite avant le coude", () => {
    const s = navigate(route, cum, [6, 45.0080]);
    expect(s.hint).toBe("right");
  });
  it("détecte l'écart latéral", () => {
    const s = navigate(route, cum, [6.001, 45.0045]);
    expect(s.offM).toBeGreaterThan(70); expect(s.offM).toBeLessThan(90);
  });
  it("alerte uniquement après 3 relevés consécutifs", () => {
    const d = new OffRouteDetector(40, 3);
    expect([d.push(60), d.push(60), d.push(60)]).toEqual([false, false, true]);
    expect(d.push(10)).toBe(false);
    expect([d.push(60), d.push(60)]).toEqual([false, false]);
  });
  it("tolère un GPS imprécis", () => { const d = new OffRouteDetector(40, 1); expect(d.push(55, 50)).toBe(false); });
  it("filtre les relevés imprécis ou immobiles", () => {
    const a = { lng: 6, lat: 45, ele: 0, t: 0, acc: 5 };
    expect(acceptFix(a, { ...a, acc: 80, lat: 45.001 })).toBe(false);
    expect(acceptFix(a, { ...a, lat: 45.000001 })).toBe(false);
    expect(acceptFix(a, { ...a, lat: 45.001 })).toBe(true);
  });
  it("stats d'enregistrement", () => {
    const f = [0, 1, 2, 3].map((i) => ({ lng: 6, lat: 45 + i * 0.001, ele: i * 10, t: i * 60000, acc: 5 }));
    const s = recordingStats(f);
    expect(s.distM).toBeGreaterThan(330); expect(s.gainM).toBe(30); expect(s.durationS).toBe(180);
  });
});
