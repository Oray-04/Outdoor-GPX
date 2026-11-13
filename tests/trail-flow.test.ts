import { describe, it, expect } from "vitest";
import { trailFlow } from "../src/lib/trail-flow";
import { proposePosts, raceFactsFromRoute, type EventModel, type Post, type Race } from "../src/lib/events";
import { roadPointsFromEdges, type TraceEdge } from "../src/lib/routing";
import { rulesDraft } from "../src/lib/race-prep";
import type { LL, Pt } from "../src/lib/types";

const coordsOf = (km: number): Pt[] => Array.from({ length: Math.round(km * 10) + 1 }, (_, i) => [6 + i * 0.00128, 45, 1000 + Math.sin(i / 20) * 200] as Pt); // ~100 m par point
const race = (o: Partial<Race> = {}): Race => ({ id: "r1", label: "Le 30", sport: "trail", distanceKm: 30, gainM: 1500, startTime: "08:00", maxHours: 7, routeId: "rt", ...o });
const event = (o: Partial<EventModel> = {}): EventModel => ({ id: "e", name: "Trail du Test", organizer: "Club", date: "2027-05-31", place: "Digne", region: "", description: "", rules: "", practical: "", registrationUrl: "", races: [], posts: [], volunteers: [], team: [], origin: "mine", createdAt: 0, ...o });
let k = 0; const newId = () => `p${++k}`;
const st = (ev: EventModel, routes: string[] = ["rt"]) => { const f = trailFlow(ev, routes, "2026-11-15"); return { f, by: Object.fromEntries(f.steps.map((s) => [s.id, s.status])) }; };

describe("parcours guidé : chaque étape ouvre la suivante", () => {
  it("sans parcours : seule l'étape 1 est ouverte", () => {
    const { f, by } = st(event(), []); expect(by).toEqual({ parcours: "todo", trail: "locked", analyse: "locked", documents: "locked", logistique: "locked", verification: "locked" });
    expect(f.current).toBe("parcours"); expect(f.steps[1].lockedWhy).toMatch(/Enregistrez d'abord un parcours/); expect(f.percent).toBeLessThan(15);
  });
  it("déblocages successifs jusqu'à la vérification", () => {
    let ev = event(); expect(st(ev).by.trail).not.toBe("locked"); expect(st(ev).by.analyse).toBe("locked"); expect(st(ev).f.steps[2].lockedWhy).toMatch(/Ajoutez d'abord une course/);
    ev = { ...ev, races: [race({ routeId: undefined })] }; expect(st(ev).f.steps[2].lockedWhy).toMatch(/Associez un parcours/);
    ev = { ...ev, races: [race()] }; expect(st(ev).f.steps[2].lockedWhy).toMatch(/participants/);
    ev = { ...ev, prep: { participants: 300 } }; expect(st(ev).by.analyse).toBe("todo"); expect(st(ev).by.trail).toBe("done"); expect(st(ev).by.documents).toBe("locked"); expect(st(ev).f.current).toBe("analyse");
    ev = { ...ev, prep: { ...ev.prep, analysedAt: 1, paved: { r1: 10 }, roads: { r1: [] }, departments: ["04"] } }; expect(st(ev).by.analyse).toBe("done"); expect(st(ev).by.documents).not.toBe("locked"); expect(st(ev).by.logistique).toBe("locked");
    ev = { ...ev, rules: rulesDraft(ev, ev.prep!), prep: { ...ev.prep, docsAt: 2 } }; expect(st(ev).by.logistique).not.toBe("locked"); expect(st(ev).by.verification).toBe("locked"); expect(st(ev).f.steps[5].lockedWhy).toMatch(/postes/);
    ev = { ...ev, posts: proposePosts({ race: ev.races[0], coords: coordsOf(30), newId }) }; expect(st(ev).by.verification).toBe("progress");
    // un parcours supprimé reverrouille l'analyse et la suite
    expect(st(ev, []).by.analyse).toBe("locked"); expect(st(ev, []).by.verification).toBe("locked");
  });
  it("événement préparé avant le parcours guidé : ses postes et bénévoles restent accessibles", () => {
    const ev = event({ races: [race()], posts: [{ id: "x", raceId: "r1", kind: "ravito", name: "R", km: 5, staffNeeded: 2, note: "" }] }), { by } = st(ev);
    expect(by.logistique).not.toBe("locked"); expect(by.documents).not.toBe("locked"); expect(by.analyse).not.toBe("locked"); expect(by.verification).not.toBe("locked");
  });
  it("validations humaines : proposées quand l'élément est prêt, jamais faites à la place de l'organisateur", () => {
    const ev = event({ races: [race()], rules: "x".repeat(80), prep: { participants: 300, analysedAt: 1, docsAt: 1, paved: { r1: 10 }, roads: { r1: [] }, departments: ["04"] } });
    const { f } = st(ev); expect(f.toValidate.map((x) => x.id)).toContain("v:reglement"); expect(f.toValidate.map((x) => x.id)).toContain("v:autorisations"); expect(f.toValidate.map((x) => x.id)).not.toContain("v:medical"); // pas de poste de secours : rien à valider encore
    const f2 = st({ ...ev, prep: { ...ev.prep, validated: ["v:reglement"] } }).f; expect(f2.toValidate.map((x) => x.id)).not.toContain("v:reglement"); expect(f2.done.map((x) => x.id)).toContain("v:reglement"); expect(f2.percent).toBeGreaterThan(f.percent);
  });
  it("vérification finale : tout terminé = 100 %", () => {
    const r = race(), posts = proposePosts({ race: r, coords: coordsOf(30), roads: [{ kind: "traversee", atM: 5000, lng: 6.06, lat: 45, roadClass: "secondary", name: "D 900", lengthM: 0 }], newId }).map((p) => ({ ...p, auto: undefined, staffNeeded: 0 }));
    const ev = event({ races: [r], posts, rules: "x".repeat(80), prep: { participants: 300, spectators: 0, analysedAt: 1, docsAt: 1, paved: { r1: 10 }, roads: { r1: [] }, departments: ["04"], validated: ["v:reglement", "v:dossier", "v:medical", "v:signaleurs", "v:autorisations"], done: ["coordonnees", "assurance", "ordre", "communication", "securite", "structures", "evacuation", ...["secours", "budget", "autorisations", "dossier", "services", "presse", "essais", "balisage", "veille", "jour", "debalisage", "merci"].map((x) => `t:${x}`)] } });
    const { f, by } = st(ev); const left = [...f.todo, ...f.toValidate].map((x) => x.label);
    expect(left.filter((l) => !/Bénévoles|signaleurs nommés|liste des signaleurs|Dossier administratif/.test(l))).toEqual([]); expect(by.analyse).toBe("done"); expect(f.percent).toBeGreaterThan(85);
  });
  it("trop de goudron et ultra sans barrière : signalés", () => {
    const ev = event({ races: [race({ distanceKm: 100 })], prep: { participants: 100, analysedAt: 1, docsAt: 1, paved: { r1: 40 }, roads: { r1: [] }, departments: ["04"] }, posts: [{ id: "x", raceId: "r1", kind: "depart", name: "D", km: 0, staffNeeded: 0, note: "" }] });
    const f = st(ev).f; expect(f.toValidate.map((x) => x.label).join(" | ")).toMatch(/Trop de goudron.*40 %/); expect(f.todo.map((x) => x.label).join(" | ")).toMatch(/Barrières horaires/);
    expect(st({ ...ev, prep: { ...ev.prep, validated: ["v:plafond"] } }).f.toValidate.some((x) => x.id === "v:plafond")).toBe(false);
  });
});

describe("postes proposés automatiquement", () => {
  const kinds = (ps: Post[]) => ps.map((p) => p.kind);
  it("course de 30 km sans point d'intérêt : départ, ravitaillements espacés, arrivée, secours", () => {
    const ps = proposePosts({ race: race(), coords: coordsOf(30), newId });
    expect(ps[0].kind).toBe("depart"); expect(ps.every((p) => p.auto && p.lng != null && p.raceId === "r1")).toBe(true); expect(kinds(ps).filter((x) => x === "arrivee")).toHaveLength(1);
    const rav = ps.filter((p) => p.kind === "ravito"); expect(rav).toHaveLength(3); expect(rav[0].km).toBeGreaterThan(8); expect(rav[0].km).toBeLessThan(12); expect(rav[2].km).toBeGreaterThan(29);
    expect(ps.filter((p) => p.kind === "secours")).toHaveLength(2); expect(ps.map((p) => p.km)).toEqual([...ps.map((p) => p.km)].sort((a, b) => a - b)); expect(ps.some((p) => p.cutoffH != null)).toBe(false);
  });
  it("course courte : pas de ravitaillement en route, mais un à l'arrivée", () => {
    const ps = proposePosts({ race: race({ distanceKm: 8 }), coords: coordsOf(8), newId }); expect(ps.filter((p) => p.kind === "ravito").map((p) => p.name)).toEqual(["Ravitaillement d'arrivée"]); expect(ps.filter((p) => p.kind === "secours")).toHaveLength(1);
  });
  it("au-delà du marathon : barrière horaire à mi-course, au prorata de l'effort", () => {
    const ps = proposePosts({ race: race({ distanceKm: 60, maxHours: 12 }), coords: coordsOf(60), newId }), cut = ps.find((p) => p.cutoffH != null)!;
    expect(cut.kind).toBe("controle"); expect(cut.cutoffH).toBeGreaterThan(3); expect(cut.cutoffH).toBeLessThan(9); expect((cut.cutoffH! * 4) % 1).toBe(0);
  });
  it("points d'intérêt du parcours repris sans ressaisie ; pas de ravitaillement inventé s'il y en a déjà", () => {
    const c = coordsOf(30), ps = proposePosts({ race: race(), coords: c, newId, pois: [{ type: "ravito", name: "Ravito du col", lng: c[120][0], lat: c[120][1] }, { type: "eau", name: "Fontaine", lng: c[200][0], lat: c[200][1] }, { type: "danger", name: "Route D4", lng: c[50][0], lat: c[50][1] }, { type: "vue", name: "Belvédère", lng: c[60][0], lat: c[60][1] }, { type: "secours", name: "Loin", lng: 7, lat: 46 }] });
    expect(ps.filter((p) => p.kind === "ravito").map((p) => p.name)).toEqual(["Ravito du col", "Ravitaillement d'arrivée"]); expect(ps.find((p) => p.name === "Ravito du col")!.km).toBeCloseTo(12, 0);
    expect(ps.some((p) => p.kind === "eau" && p.name === "Fontaine")).toBe(true); expect(ps.some((p) => p.kind === "signaleur" && p.name === "Route D4")).toBe(true); expect(ps.some((p) => p.name === "Belvédère" || p.name === "Loin")).toBe(false);
  });
  it("signaleurs aux routes détectées : toutes les routes classées, deux personnes sur les plus importantes", () => {
    const roads = [{ kind: "traversee" as const, atM: 4000, lng: 6.05, lat: 45, roadClass: "secondary", name: "D 41", lengthM: 0 }, { kind: "route" as const, atM: 9000, lng: 6.11, lat: 45, roadClass: "residential", name: "Rue du Lac", lengthM: 350 }, { kind: "traversee" as const, atM: 9050, lng: 6.111, lat: 45, roadClass: "tertiary", name: "", lengthM: 0 }];
    const sig = proposePosts({ race: race(), coords: coordsOf(30), roads, newId }).filter((p) => p.kind === "signaleur");
    expect(sig.map((p) => p.name)).toEqual(["Traversée — D 41", "Entrée sur route — Rue du Lac"]); expect(sig[0].staffNeeded).toBe(2); expect(sig[1].staffNeeded).toBe(1); expect(sig[1].note).toMatch(/350 m/); expect(sig[0].km).toBe(4);
    expect(proposePosts({ race: race(), coords: [], newId })).toEqual([]);
  });
  it("données de course cohérentes avec le parcours", () => { const f = raceFactsFromRoute(coordsOf(30)); expect(f.distanceKm).toBeCloseTo(30, 0); });
});

describe("traversées et passages sur route d'un tracé", () => {
  const shape: LL[] = Array.from({ length: 12 }, (_, i) => [6 + i * 0.001, 45] as LL);
  const e = (use: string, cls: string, len: number, end: number, x: [string, string][] = [], name?: string): TraceEdge => ({ use, road_class: cls, length: len, end_shape_index: end, names: name ? [name] : undefined, end_node: { intersecting_edges: x.map(([u, c]) => ({ use: u, road_class: c })) } });
  it("traversée (chemin → chemin en croisant une route), entrée sur route avec sa longueur, rues de service ignorées", () => {
    const r = roadPointsFromEdges([e("path", "service_other", 0.5, 1), e("path", "service_other", 0.4, 2, [["road", "secondary"], ["footway", "service_other"]]), e("track", "service_other", 0.6, 3, [["road", "service_other"]]), e("path", "service_other", 0.5, 4), e("road", "tertiary", 0.3, 5, [], "D 12"), e("road", "tertiary", 0.2, 6, [], "D 12"), e("path", "service_other", 1, 7)], shape);
    expect(r).toEqual([{ kind: "traversee", atM: 900, lng: 6.002, lat: 45, roadClass: "secondary", name: "", lengthM: 0 }, { kind: "route", atM: 2000, lng: 6.004, lat: 45, roadClass: "tertiary", name: "D 12", lengthM: 500 }]);
  });
  it("départ sur route signalé ; points proches regroupés en gardant la route la plus importante", () => {
    const r = roadPointsFromEdges([e("road", "residential", 0.06, 1, [], "Rue A"), e("footway", "service_other", 0.05, 2, [["road", "primary"]]), e("path", "service_other", 2, 3), e("path", "service_other", 1, 4)], shape);
    expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ atM: 0, roadClass: "primary", kind: "traversee" }); expect(roadPointsFromEdges([], shape)).toEqual([]);
  });
});
