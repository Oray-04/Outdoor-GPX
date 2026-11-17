import { describe, it, expect } from "vitest";
import { cloverOffsets } from "../src/lib/clover";

const o = { threshold: 30, radius: 22 };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
describe("marqueurs en trèfle", () => {
  it("points isolés : aucun décalage", () => { expect(cloverOffsets([{ x: 0, y: 0 }, { x: 100, y: 0 }], o)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]); });
  it("deux points superposés : écartés à gauche et à droite, plus de chevauchement", () => {
    const p = [{ x: 50, y: 50 }, { x: 50, y: 50 }], d = cloverOffsets(p, o), q = p.map((pt, i) => ({ x: pt.x + d[i].x, y: pt.y + d[i].y }));
    expect(q[0].x).toBeLessThan(50); expect(q[1].x).toBeGreaterThan(50); expect(dist(q[0], q[1])).toBeGreaterThanOrEqual(2 * 22 - 1e-9);
  });
  it("trois ou quatre points proches : pétales régulièrement répartis, tous séparés d'au moins le seuil", () => {
    for (const n of [3, 4]) {
      const p = Array.from({ length: n }, (_, i) => ({ x: 100 + i * 3, y: 100 - i * 2 })), d = cloverOffsets(p, o), q = p.map((pt, i) => ({ x: pt.x + d[i].x, y: pt.y + d[i].y }));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(dist(q[i], q[j])).toBeGreaterThanOrEqual(o.threshold);
    }
  });
  it("garde la disposition réelle : le point le plus à l'ouest reste à l'ouest", () => {
    const p = [{ x: 110, y: 100 }, { x: 95, y: 100 }], d = cloverOffsets(p, o);
    expect(p[1].x + d[1].x).toBeLessThan(p[0].x + d[0].x);
  });
  it("bouquet (épingles) : toutes les pointes au-dessus de la position réelle, qui reste visible", () => {
    const p = [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: -1, y: 2 }], d = cloverOffsets(p, { ...o, lift: true });
    p.forEach((pt, i) => expect(pt.y + d[i].y).toBeLessThan(Math.max(...p.map((q) => q.y))));
  });
});
