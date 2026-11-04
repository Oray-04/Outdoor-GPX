import { describe, it, expect } from "vitest";
import * as E from "../src/lib/editor-core";
import type { LL } from "../src/lib/types";

const straight: E.Router = async (a: LL, b: LL) => [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b];
const failing: E.Router = async () => null;

async function build(n = 4, route = straight) {
  let s = E.emptyState();
  for (let i = 0; i < n; i++) s = (await E.addWaypoint(s, 6 + i * 0.01, 45 + (i % 2) * 0.01, true, route)).state;
  return s;
}

describe("éditeur", () => {
  it("ajoute des waypoints et des segments", async () => {
    const s = await build(4);
    expect(s.waypoints).toHaveLength(4); expect(s.segs).toHaveLength(3);
    expect(E.trackLL(s).length).toBe(3 * 3 - 2); // 3 segments de 3 pts, jonctions fusionnées
  });
  it("repli en ligne droite si le routage échoue", async () => {
    const r = await E.addWaypoint(await build(1), 6.1, 45, true, failing);
    expect(r.fallbacks).toBe(1); expect(r.state.segs[0]).toHaveLength(2);
  });
  it("déplace un waypoint intermédiaire et retrace 2 segments", async () => {
    const s = await build(4);
    const r = await E.moveWaypoint(s, 1, 6.5, 45.5, straight);
    expect(r.state.segs[0].at(-1)).toEqual([6.5, 45.5]); expect(r.state.segs[1][0]).toEqual([6.5, 45.5]);
    expect(r.state.segs[2]).toEqual(s.segs[2]);
  });
  it("supprime un waypoint intermédiaire en reliant ses voisins", async () => {
    const s = await build(4);
    const r = await E.removeWaypoint(s, 2, straight);
    expect(r.state.waypoints).toHaveLength(3); expect(r.state.segs).toHaveLength(2);
    expect(r.state.segs[1][0]).toEqual([r.state.waypoints[1].lng, r.state.waypoints[1].lat]);
  });
  it("supprime début et fin", async () => {
    const s = await build(4);
    expect((await E.removeWaypoint(s, 0, straight)).state.segs).toHaveLength(2);
    expect((await E.removeWaypoint(s, 3, straight)).state.segs).toHaveLength(2);
  });
  it("inverse deux fois = identité", async () => {
    const s = await build(4);
    const back = E.reverse(E.reverse(s));
    expect(back.waypoints).toEqual(s.waypoints); expect(back.segs).toEqual(s.segs);
    expect(E.reverse(s).waypoints[0]).toMatchObject({ lng: s.waypoints[3].lng });
  });
  it("ferme une boucle puis change le départ", async () => {
    const s = (await E.closeLoop(await build(4), true, straight)).state;
    expect(E.isClosed(s)).toBe(true);
    const r = E.setStart(s, 2);
    expect(E.isClosed(r)).toBe(true);
    expect(r.waypoints[0]).toMatchObject({ lng: s.waypoints[2].lng, lat: s.waypoints[2].lat });
    expect(E.trackLL(r).length).toBe(E.trackLL(s).length);
  });
  it("divise puis refusionne sans perdre de points", async () => {
    const s = await build(5);
    const [a, b] = E.splitAt(s, 2)!;
    expect(a.waypoints).toHaveLength(3); expect(b.waypoints).toHaveLength(3);
    const m = E.merge(a, b);
    expect(E.trackLL(m)).toEqual(E.trackLL(s));
  });
  it("insère un waypoint sur un segment sans modifier la trace", async () => {
    const s = await build(3);
    const r = E.insertOnSegment(s, 0, 1);
    expect(r.waypoints).toHaveLength(4); expect(E.trackLL(r)).toEqual(E.trackLL(s));
  });
  it("importe une trace en gardant sa géométrie", () => {
    const coords = Array.from({ length: 300 }, (_, i) => [6 + i * 0.0002, 45 + Math.sin(i / 20) * 0.002, 100] as [number, number, number]);
    const s = E.fromTrack(coords, []);
    expect(s.waypoints.length).toBeLessThan(300);
    expect(E.trackLL(s)).toHaveLength(300);
  });
});

describe("éditeur : accrochage des points sur les chemins", () => {
  // routeur qui « accroche » à un chemin décalé de 0,001° : ses extrémités ne sont pas les points cliqués
  const snapped: E.Router = async (a, b) => [[a[0] + 0.001, a[1]], [(a[0] + b[0]) / 2 + 0.001, (a[1] + b[1]) / 2], [b[0] + 0.001, b[1]]];
  it("les points de passage sont ramenés sur le chemin, sans raccord hors chemin", async () => {
    let s = E.emptyState();
    for (const [x, y] of [[6, 45], [6.01, 45], [6.02, 45.01]] as [number, number][]) s = (await E.addWaypoint(s, x, y, true, snapped)).state;
    expect(s.waypoints[0].lng).toBeCloseTo(6.001, 6); expect(s.waypoints[2].lng).toBeCloseTo(6.021, 6);
    const t = E.trackLL(s);
    expect(t[0]).toEqual([6.001, 45]);                       // la trace commence sur le chemin, pas au point cliqué
    expect(t.some((p) => Math.abs(p[0] - 6) < 1e-9)).toBe(false);
  });
  it("trace continue : pas de point perdu quand les segments ne se rejoignent pas exactement", () => {
    const s: E.EState = { waypoints: [{ lng: 0, lat: 0, auto: true }, { lng: 1, lat: 0, auto: true }, { lng: 2, lat: 0, auto: true }], segs: [[[0, 0], [1, 0]], [[1.1, 0], [2, 0]]], pois: [] };
    expect(E.trackLL(s)).toEqual([[0, 0], [1, 0], [1.1, 0], [2, 0]]);
  });
});

describe("découpe multiple", () => {
  it("découpe en N parties qui se raccordent et conservent toute la géométrie", async () => {
    const s = await build(7);
    const parts = E.splitMany(s, [4, 2, 2, 0, 6]); // doublons et extrémités ignorés
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.waypoints.length)).toEqual([3, 3, 3]);
    parts.slice(1).forEach((p, i) => expect(p.waypoints[0]).toEqual(parts[i].waypoints.at(-1)));
    const total = parts.reduce((n, p) => n + E.trackLL(p).length, 0);
    expect(total).toBe(E.trackLL(s).length + (parts.length - 1)); // les points de coupe sont partagés
  });
  it("aucune coupe valide : le parcours est renvoyé tel quel", async () => { const s = await build(4); expect(E.splitMany(s, [0, 3])).toEqual([s]); });
  it("répartit les points d'intérêt sur la partie la plus proche", async () => {
    let s = await build(5);
    s = { ...s, pois: [{ id: "a", type: "eau", name: "début", lng: s.waypoints[0].lng, lat: s.waypoints[0].lat }, { id: "b", type: "eau", name: "fin", lng: s.waypoints[4].lng, lat: s.waypoints[4].lat }] };
    const [p1, p2] = E.splitMany(s, [2]);
    expect(p1.pois.map((x) => x.id)).toEqual(["a"]); expect(p2.pois.map((x) => x.id)).toEqual(["b"]);
  });
});
