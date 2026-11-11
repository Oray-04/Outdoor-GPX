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

describe("baguette magique à jauge (0–90 % de points supprimés)", () => {
  // 1 000 points : longues lignes droites bruitées (± 1 m) reliées par 9 virages à angle droit, altitude en rampe + un col marqué
  const track = (): [number, number, number][] => {
    const pts: [number, number, number][] = []; let seed = 5; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2.2e-5;
    let x = 6, y = 45;
    for (let leg = 0; leg < 10; leg++) for (let i = 0; i < 100; i++) { if (leg % 2 === 0) x += 5e-5; else y += 3.5e-5; const k = leg * 100 + i; pts.push([x + r(), y + r(), 1000 + (k < 500 ? k * 0.8 : (1000 - k) * 0.8)]); }
    return pts;
  };
  it("le pourcentage demandé est respecté : 1 000 points à 50 % → 500 conservés ; 25 %, 75 %, 90 %", async () => {
    const { simplifyByRatio } = await import("../src/lib/geo"); const p = track(); expect(p).toHaveLength(1000);
    for (const [pct, kept] of [[25, 750], [50, 500], [75, 250], [90, 100]] as const) { const r = simplifyByRatio(p, pct); expect(r.after).toBe(kept); expect(r.removedPct).toBe(pct); expect(r.indices[0]).toBe(0); expect(r.indices.at(-1)).toBe(999); }
    const zero = simplifyByRatio(p, 0); expect(zero.after).toBe(1000); expect(zero.maxDevM).toBe(0);
    expect(simplifyByRatio(p, 150).after).toBe(100); // borné à 90 %
  });
  it("les points importants partent en dernier : les 9 virages et le col survivent à 90 %", async () => {
    const { simplifyByRatio, pointImportance } = await import("../src/lib/geo"); const p = track();
    const r = simplifyByRatio(p, 90); const kept = new Set(r.indices);
    for (let leg = 1; leg < 10; leg++) expect([...kept].some((i) => Math.abs(i - (leg * 100 - 1)) <= 3), `virage ${leg}`).toBe(true);
    expect([...kept].some((i) => Math.abs(i - 500) <= 5), "col (rupture de pente)").toBe(true);
    expect(r.maxDevM).toBeLessThan(6); expect(r.exceeded).toBe(false);
    const imp = pointImportance(p); expect(imp[0]).toBe(Infinity); expect(imp[99]).toBeGreaterThan(imp[50] * 5);
  });
  it("demande excessive sur un tracé sinueux : avertissement et pourcentage conseillé plus bas", async () => {
    const { simplifyByRatio, maxDeviation } = await import("../src/lib/geo");
    const wig: [number, number, number][] = Array.from({ length: 300 }, (_, i) => [6 + i * 2e-4, 45 + Math.sin(i / 2.2) * 6e-4, 1000]); // lacets de ~65 m d'amplitude
    const r = simplifyByRatio(wig, 90); expect(r.exceeded).toBe(true); expect(r.maxDevM).toBeGreaterThan(15); expect(r.safePct).toBeLessThan(90);
    const safe = simplifyByRatio(wig, r.safePct); expect(maxDeviation(wig, safe.indices)).toBeLessThanOrEqual(15); expect(safe.exceeded).toBe(false);
  });
  it("points à conserver imposés ; état d'éditeur : même tracé allégé, POI intacts, annulable (état d'origine non modifié)", async () => {
    const { simplifyByRatio } = await import("../src/lib/geo"); const p = track();
    expect(simplifyByRatio(p, 90, { keep: [37, 512] }).indices).toEqual(expect.arrayContaining([37, 512]));
    const s0 = { ...E.fromTrack(p, []), pois: [{ id: "p", type: "eau" as const, name: "Fontaine", lng: 6.01, lat: 45.001 }] };
    const n0 = E.trackLL(s0).length; const r = E.simplifyStateByRatio(s0, 50, p)!;
    expect(E.trackLL(r.state).length).toBe(r.result.after); expect(Math.abs(r.result.after - n0 / 2)).toBeLessThanOrEqual(1);
    expect(r.state.pois).toEqual(s0.pois); expect(E.trackLL(s0).length).toBe(n0);
    expect(E.trackLL(r.state)[0]).toEqual(E.trackLL(s0)[0]); expect(E.trackLL(r.state).at(-1)).toEqual(E.trackLL(s0).at(-1));
  });
});

describe("section entre deux points (sliceTrack) et nouveau départ (startFrom)", () => {
  const coords: [number, number, number][] = Array.from({ length: 201 }, (_, i) => [6 + i * 0.001, 45 + Math.sin(i / 9) * 0.003, 1000 + i * 2 + Math.sin(i / 4) * 15]);
  it("coupe exacte entre deux points GPX : extrémités interpolées (position et altitude), géométrie d'origine entre les deux", async () => {
    const { cumulative, trackStats } = await import("../src/lib/geo"); const cum = cumulative(coords), total = cum.at(-1)!;
    const a = cum[40] + (cum[41] - cum[40]) * 0.3, b = cum[120] + (cum[121] - cum[120]) * 0.75;
    const s = E.sliceTrack(coords, cum, a, b);
    expect(s.slice(1, -1)).toEqual(coords.slice(41, 121));                          // tous les points d'origine, dans l'ordre, inchangés
    expect(s[0][0]).toBeCloseTo(coords[40][0] + (coords[41][0] - coords[40][0]) * 0.3, 7); expect(s[0][2]).toBeCloseTo(coords[40][2] + (coords[41][2] - coords[40][2]) * 0.3, 1);
    expect(s.at(-1)![2]).toBeCloseTo(coords[120][2] + (coords[121][2] - coords[120][2]) * 0.75, 1);
    expect(trackStats(s, 0).distanceM).toBeCloseTo(b - a, 0);                        // longueur = écart entre les deux coupes : aucune ligne droite ajoutée
    expect(E.sliceTrack(coords, cum, b, a)).toEqual(s);                              // A et B posés dans l'autre ordre : même section, même sens
    expect(E.sliceTrack(coords, cum, 0, total)).toHaveLength(coords.length); expect(E.sliceTrack(coords, cum, a, a)).toEqual([]);
  });
  it("étapes d'itinérance : A→B, B→C, C→D recollées redonnent exactement la distance et le D+ du parcours", async () => {
    const { cumulative, trackStats } = await import("../src/lib/geo"); const cum = cumulative(coords), total = cum.at(-1)!;
    const cuts = [0, total * 0.23, total * 0.5, total * 0.81, total];
    const parts = cuts.slice(0, -1).map((c, i) => E.sliceTrack(coords, cum, c, cuts[i + 1]));
    for (let i = 1; i < parts.length; i++) { expect(parts[i][0][0]).toBeCloseTo(parts[i - 1].at(-1)![0], 9); expect(parts[i][0][2]).toBeCloseTo(parts[i - 1].at(-1)![2], 1); }
    expect(parts.reduce((x, p) => x + trackStats(p, 0).distanceM, 0)).toBeCloseTo(total, 0);
    expect(parts.reduce((x, p) => x + trackStats(p, 0).gainM, 0)).toBeCloseTo(trackStats(coords, 0).gainM, 0);
  });
  it("projection d'un clic sur le tracé, entre deux sommets", async () => {
    const { cumulative } = await import("../src/lib/geo"); const line: [number, number, number][] = [[6, 45, 0], [6.01, 45, 0], [6.02, 45, 0]]; const cum = cumulative(line);
    const p = E.projectOnTrack(line, cum, 6.0125, 45.0002); expect(p.atM).toBeCloseTo(cum[1] + (cum[2] - cum[1]) * 0.25, -1); expect(p.offM).toBeGreaterThan(15); expect(p.offM).toBeLessThan(30);
  });
  const router: E.Router = async () => null;
  const five = async (close: boolean) => { let s = E.emptyState(); for (const [x, y] of [[6, 45], [6.01, 45.005], [6.02, 45], [6.03, 45.005], [6.04, 45]]) s = (await E.addWaypoint(s, x, y, false, router)).state; if (close) s = (await E.closeLoop(s, false, async (a, b) => [a, b])).state; return { ...s, pois: [{ id: "p", type: "eau" as const, name: "Fontaine", lng: 6.005, lat: 45.002 }] }; };
  it("parcours ouvert A→B→C→D→E, départ en C : C→D→E conservé à l'identique, début rendu à l'appelant, POI en place", async () => {
    const s = await five(false); const r = E.startFrom(s, 2)!;
    expect(r.loop).toBe(false); expect(r.state.waypoints).toEqual(s.waypoints.slice(2)); expect(r.state.segs).toEqual(s.segs.slice(2));
    expect(r.removed[0]).toEqual([6, 45]); expect(r.removed.at(-1)).toEqual([6.02, 45]); expect(r.state.pois).toEqual(s.pois);
    expect(E.trackLL(s)).toHaveLength(5);                                            // l'état d'origine n'est pas modifié (annulation possible)
    expect(E.startFrom(s, 0)).toBeNull(); expect(E.startFrom(s, 4)).toBeNull();
  });
  it("boucle : même tracé, même longueur, seul le départ tourne ; toujours fermée", async () => {
    const s = await five(true); const r = E.startFrom(s, 2)!; expect(r.loop).toBe(true); expect(r.removed).toEqual([]);
    expect(E.isClosed(r.state)).toBe(true); expect(r.state.waypoints[0]).toMatchObject({ lng: 6.02, lat: 45 }); expect(r.state.waypoints.at(-1)).toMatchObject({ lng: 6.02, lat: 45 });
    const len = (st: E.EState) => { const t = E.trackLL(st); let d = 0; for (let i = 1; i < t.length; i++) d += Math.hypot(t[i][0] - t[i - 1][0], t[i][1] - t[i - 1][1]); return d; };
    expect(len(r.state)).toBeCloseTo(len(s), 9); expect(r.state.pois).toEqual(s.pois);
  });
});
