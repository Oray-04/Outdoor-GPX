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

describe("baguette magique (simplifyState)", () => {
  // trace de 245 points, très redondante : lignes droites bruitées + 2 virages en épingle
  const dense = (): [number, number, number][] => {
    const pts: [number, number, number][] = []; let seed = 3; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 1.5e-5;
    for (let i = 0; i < 100; i++) pts.push([6.8 + i * 4e-5 + r(), 45.9 + r(), 1000]);            // ligne est
    for (let i = 1; i <= 45; i++) pts.push([6.804 + r(), 45.9 + i * 3e-5 + r(), 1000]);          // virage à 90° vers le nord
    for (let i = 1; i <= 100; i++) pts.push([6.804 - i * 4e-5 + r(), 45.90135 + r(), 1000]);     // épingle : retour vers l'ouest
    return pts;
  };
  it("réduit fortement le nombre de points en conservant les virages et les extrémités", () => {
    const pts = dense(); expect(pts.length).toBe(245);
    const st = E.fromTrack(pts, []);
    const r = E.simplifyState(st, "auto")!;
    expect(r.report.after).toBeLessThan(40);
    expect(E.trackLL(r.state).length).toBe(r.report.after);
    expect(r.report.maxDevM).toBeLessThan(8);
    const out = E.trackLL(r.state);
    expect(out[0]).toEqual(E.trackLL(st)[0]); expect(out[out.length - 1]).toEqual(E.trackLL(st)[E.trackLL(st).length - 1]);
    // les deux coudes (≈ 6.804/45.9 et 6.804/45.90135) sont conservés à moins de 15 m
    const near = (x: number, y: number) => out.some((p) => Math.hypot((p[0] - x) * 78000, (p[1] - y) * 111000) < 15);
    expect(near(6.804, 45.9)).toBe(true); expect(near(6.804, 45.90135)).toBe(true);
    expect(r.state.waypoints.length).toBe(r.report.after);
  });
  it("le niveau léger conserve au moins autant de points que le niveau fort", () => {
    const st = E.fromTrack(dense(), []);
    expect(E.simplifyState(st, "light")!.report.after).toBeGreaterThanOrEqual(E.simplifyState(st, "strong")!.report.after);
  });
  it("ne fait rien sur un tracé déjà minimal", () => { expect(E.simplifyState({ waypoints: [{ lng: 6, lat: 45, auto: false }, { lng: 6.1, lat: 45, auto: false }], segs: [[[6, 45], [6.1, 45]]], pois: [] })).toBeNull(); });
});

describe("point intermédiaire tiré depuis le tracé (insertWaypointRouted)", () => {
  // routeur factice : suit un « chemin » en créneau (passe par un coude) et décale légèrement ses extrémités (accrochage au réseau)
  const calls: [LL, LL][] = [];
  const router: E.Router = async (a, b) => { calls.push([a, b]); const mid: LL = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.001]; return [[a[0] + 2e-6, a[1] + 2e-6], mid, [b[0] - 2e-6, b[1] - 2e-6]]; };
  const base = async () => { let s = E.emptyState(); s = (await E.addWaypoint(s, 6, 45, true, router)).state; s = (await E.addWaypoint(s, 6.2, 45, true, router)).state; return s; };
  it("insère un waypoint, recalcule exactement les deux tronçons voisins, garde départ et arrivée", async () => {
    const s0 = await base(); calls.length = 0;
    const r = await E.insertWaypointRouted(s0, 0, 6.1, 45.05, true, router);
    expect(r.state.waypoints).toHaveLength(3); expect(r.state.segs).toHaveLength(2);
    expect(calls).toHaveLength(2); // deux tronçons recalculés, pas le parcours entier
    expect(r.state.waypoints[0]).toEqual(s0.waypoints[0]); expect(r.state.waypoints[2]).toEqual(s0.waypoints[1]); // A et B fixes
    const w = r.state.waypoints[1]; expect(Math.abs(w.lng - 6.1)).toBeLessThan(1e-3); // le point est ramené sur le chemin, tout près de la cible
  });
  it("le tracé reste connecté : le 2ᵉ tronçon part exactement du point intermédiaire", async () => {
    const r = await E.insertWaypointRouted(await base(), 0, 6.1, 45.05, true, router);
    const [g1, g2] = r.state.segs; const w = r.state.waypoints[1];
    expect(g1.at(-1)).toEqual([w.lng, w.lat]); expect(g2[0]).toEqual([w.lng, w.lat]);
    const t = E.trackLL(r.state); for (let i = 1; i < t.length; i++) expect(Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1])).toBeLessThan(0.2); // aucun saut
  });
  it("conserve le mode : Libre → lignes droites, Chemins → routeur", async () => {
    calls.length = 0; const libre = await E.insertWaypointRouted(await base(), 0, 6.1, 45.05, false, router);
    expect(libre.state.segs[0]).toHaveLength(2); expect(libre.state.waypoints[1].auto).toBe(false);
    const chem = await E.insertWaypointRouted(await base(), 0, 6.1, 45.05, true, router);
    expect(chem.state.waypoints[1].auto).toBe(true); expect(chem.state.segs[0].length).toBeGreaterThan(2);
  });
  it("plusieurs points successifs, déplacement puis suppression, sans toucher départ/arrivée", async () => {
    let s = await base(); const A = s.waypoints[0], B = s.waypoints[1];
    s = (await E.insertWaypointRouted(s, 0, 6.05, 45.04, true, router)).state;                // 3 points
    s = (await E.insertWaypointRouted(s, E.nearestSegment(s, 6.15, 45.002), 6.15, 45.04, true, router)).state; // 4 points
    expect(s.waypoints).toHaveLength(4); expect(s.segs).toHaveLength(3);
    s = (await E.moveWaypoint(s, 1, 6.06, 45.06, router)).state;
    expect(Math.abs(s.waypoints[1].lat - 45.06)).toBeLessThan(1e-3);
    s = (await E.removeWaypoint(s, 1, router)).state; expect(s.waypoints).toHaveLength(3); expect(s.segs).toHaveLength(2);
    expect(s.waypoints[0]).toEqual(A); expect(s.waypoints.at(-1)).toEqual(B);
  });
  it("nearestSegment : choisit le tronçon le plus proche", async () => {
    let s = await base(); s = (await E.insertWaypointRouted(s, 0, 6.1, 45.0, false, router)).state;
    expect(E.nearestSegment(s, 6.03, 45)).toBe(0); expect(E.nearestSegment(s, 6.17, 45)).toBe(1);
  });
});

describe("clôture du parcours (closeLoop)", () => {
  const calls: [LL, LL][] = [];
  // routeur factice : passe par un coude et s'arrête ~3 m AVANT la destination (comme un vrai moteur accroché au réseau)
  const router: E.Router = async (a, b) => { calls.push([a, b]); return [a, [(a[0] + b[0]) / 2, a[1] + 0.002], [b[0] - 3e-5, b[1]]]; };
  const open3 = async () => { let s = E.emptyState(); for (const [x, y] of [[6, 45], [6.02, 45.01], [6.04, 45]]) s = (await E.addWaypoint(s, x, y, false, router)).state; return s; };
  it("ajoute un tronçon routé de la fin vers le départ ; l'arrivée est exactement le départ", async () => {
    const s0 = await open3(); calls.length = 0;
    const r = await E.closeLoop(s0, true, router);
    expect(calls).toHaveLength(1); expect(calls[0][1]).toEqual([s0.waypoints[0].lng, s0.waypoints[0].lat]);
    expect(r.fallbacks).toBe(0); expect(E.isClosed(r.state)).toBe(true);
    const t = E.trackLL(r.state); expect(t.at(-1)).toEqual(t[0]);                               // boucle complète, coordonnées identiques
    expect(r.state.waypoints.at(-1)).toMatchObject({ lng: s0.waypoints[0].lng, lat: s0.waypoints[0].lat, auto: true });
    const back = r.state.segs.at(-1)!; expect(back.length).toBeGreaterThan(2);                   // pas une ligne droite : géométrie du routeur
    expect(back[0]).toEqual([s0.waypoints[2].lng, s0.waypoints[2].lat]);                          // connecté au dernier point
    expect(r.state.segs.slice(0, -1)).toEqual(s0.segs);                                           // le reste du tracé est intact
  });
  it("fonctionne dès 2 points ; sans effet sur une boucle déjà fermée ; signale l'absence de chemin", async () => {
    let s = E.emptyState(); s = (await E.addWaypoint(s, 6, 45, false, router)).state; s = (await E.addWaypoint(s, 6.02, 45.01, false, router)).state;
    const r = await E.closeLoop(s, true, router); expect(E.isClosed(r.state)).toBe(true);
    expect((await E.closeLoop(r.state, true, router)).state).toBe(r.state);
    const none = await E.closeLoop(s, true, async () => null); expect(none.fallbacks).toBe(1);
  });
  it("le retour reste modifiable : un point tiré sur le tronçon de fermeture le recalcule, la boucle reste fermée", async () => {
    const r = await E.closeLoop(await open3(), true, router);
    const k = r.state.segs.length - 1;
    const m = await E.insertWaypointRouted(r.state, k, 6.02, 44.99, true, router);
    expect(m.state.waypoints).toHaveLength(r.state.waypoints.length + 1); expect(E.isClosed(m.state)).toBe(true);
    const t = E.trackLL(m.state); expect(t.at(-1)).toEqual(t[0]);
  });
});
