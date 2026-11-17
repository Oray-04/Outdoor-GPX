import { describe, it, expect } from "vitest";
import { syncEvent, commonCandidates, mergeEndpoints, splitEndpoint, mergePoiPlan } from "../src/lib/poi-sync";
import { staffing, postStatus, postsOfRace, type EventModel, type Race, type Volunteer } from "../src/lib/events";
import { volunteersCsv, CSV_COLUMNS } from "../src/lib/volunteers-csv";
import type { Poi, Pt } from "../src/lib/types";

// trois parcours (10, 20, 40 km) partant du même endroit, vers le nord, l'est et l'ouest
const line = (dx: number, dy: number, n: number): Pt[] => Array.from({ length: n }, (_, i) => [6 + dx * i, 45 + dy * i, 1000] as Pt);
const routes = [{ id: "R10", coords: line(0, 0.01, 10), pois: [] as Poi[] }, { id: "R20", coords: line(0.014, 0, 15), pois: [] as Poi[] }, { id: "R40", coords: line(-0.014, 0, 30), pois: [] as Poi[] }];
const race = (id: string, routeId: string): Race => ({ id, label: `${id} km`, sport: "trail", distanceKm: 10, gainM: 0, startTime: "08:00", maxHours: 4, routeId });
const vol = (id: string, name: string, postId: string, o: Partial<Volunteer> = {}): Volunteer => ({ id, name, phone: "06 00", postId, from: "07:00", to: "10:00", instructions: "", ...o });
const base = (): EventModel => ({ id: "e", name: "Trail des 3 vallées", organizer: "", date: "2027-05-01", place: "", region: "", description: "", rules: "", practical: "", registrationUrl: "", races: [race("10", "R10"), race("20", "R20"), race("40", "R40")], posts: [], volunteers: [], team: [], origin: "mine", createdAt: 0 });

describe("postes communs à plusieurs parcours : bénévoles mutualisés", () => {
  const synced = () => syncEvent(base(), routes).ev;
  it("trois départs au même endroit sont détectés comme communs (les arrivées, éloignées, non)", () => {
    const g = commonCandidates(synced());
    expect(g).toHaveLength(1); expect(g[0].map((p) => p.kind)).toEqual(["depart", "depart", "depart"]); expect(g[0].map((p) => p.raceId)).toEqual(["10", "20", "40"]);
  });
  it("départ mutualisé : un seul poste de 4 bénévoles au lieu de 3 × 4 = 12 ; visible sur chaque parcours ; stable à la synchronisation", () => {
    let ev = synced(); const ids = commonCandidates(ev)[0].map((p) => p.id);
    expect(staffing(ev).need).toBe(3 * 4 + 3 * 6); // avant : 3 départs (4) + 3 arrivées (6)
    ev = { ...ev, volunteers: [vol("a", "Ana", ids[1]), vol("b", "Bob", ids[2])] };
    ev = mergeEndpoints(ev, ids);
    const departs = ev.posts.filter((p) => p.kind === "depart"); expect(departs).toHaveLength(1);
    expect(departs[0].shared?.map((s) => s.raceId)).toEqual(["20", "40"]);
    expect(ev.volunteers.every((v) => v.postId === departs[0].id)).toBe(true); // bénévoles reportés, aucun doublon
    const again = syncEvent(ev, routes).ev; // la synchronisation ne recrée pas de départ pour 20 et 40
    expect(again.posts.filter((p) => p.kind === "depart")).toHaveLength(1);
    expect(syncEvent(again, routes).ev).toBe(again);
    for (const r of ["10", "20", "40"]) expect(postsOfRace(again.posts, r).filter((p) => p.kind === "depart")).toHaveLength(1);
    const st = staffing(again); expect(st.need).toBe(4 + 3 * 6); expect(st.mutualised).toBe(8); expect(st.assigned).toBe(2); expect(st.common).toBe(1);
    expect(postStatus(again, departs[0])).toBe("partiel");
    expect(commonCandidates(again)).toHaveLength(0);
  });
  it("retirer une course du départ commun : elle retrouve son propre départ, l'équipe reste sur le poste commun", () => {
    let ev = synced(); const ids = commonCandidates(ev)[0].map((p) => p.id);
    ev = syncEvent(mergeEndpoints({ ...ev, volunteers: [vol("a", "Ana", ids[0])] }, ids), routes).ev;
    const d = ev.posts.find((p) => p.kind === "depart")!;
    const s = syncEvent(splitEndpoint(ev, d.id, "40"), routes).ev;
    expect(s.posts.filter((p) => p.kind === "depart")).toHaveLength(2);
    expect(s.posts.find((p) => p.id === d.id)!.shared?.map((x) => x.raceId)).toEqual(["20"]);
    expect(s.volunteers[0].postId).toBe(d.id);
  });
  it("ravitaillements placés séparément au même endroit sur deux parcours → un POI commun, un seul poste, équipe réunie", () => {
    const rts = routes.map((r) => (r.id === "R10" ? { ...r, pois: [{ id: "a", type: "ravito" as const, name: "Ravito A", lng: 6.0003, lat: 45.05 }] } : r.id === "R20" ? { ...r, pois: [{ id: "b", type: "ravito" as const, name: "Ravito B", lng: 6.0005, lat: 45.0503 }] } : r));
    // les deux points sont à ~40 m : même lieu ; on rapproche R20 de R10 en lui donnant ce ravito
    let ev = syncEvent(base(), rts).ev;
    const g = commonCandidates(ev).find((x) => x[0].kind === "ravito")!; expect(g).toHaveLength(2);
    ev = { ...ev, volunteers: [vol("z", "Zoé", g[1].id)] };
    const plan = mergePoiPlan(ev, rts, g.map((p) => p.id))!;
    const after = rts.map((r) => (plan.writes.has(r.id) ? { ...r, pois: plan.writes.get(r.id)! } : r));
    expect(after.find((r) => r.id === "R20")!.pois.map((q) => q.id)).toEqual(["a"]); expect(after.find((r) => r.id === "R10")!.pois[0].common).toBe(true);
    const e2 = syncEvent(plan.ev, after).ev, rav = e2.posts.filter((p) => p.kind === "ravito");
    expect(rav).toHaveLength(1); expect(rav[0].shared?.map((s) => s.raceId)).toEqual(["20"]); expect(e2.volunteers[0].postId).toBe(rav[0].id);
  });
});

describe("export CSV des bénévoles", () => {
  it("colonnes utiles, séparateur ;, BOM, CRLF, guillemets et protection contre les formules ; poste commun : toutes ses courses", () => {
    let ev = syncEvent(base(), routes).ev; const ids = commonCandidates(ev)[0].map((p) => p.id);
    ev = syncEvent(mergeEndpoints(ev, ids), routes).ev; const d = ev.posts.find((p) => p.kind === "depart")!;
    ev = { ...ev, volunteers: [vol("a", "Durand; Ana", d.id, { instructions: "Gilet jaune\n\"sifflet\"", email: "ana@exemple.fr" }), vol("b", "=Bob", "")] };
    const csv = volunteersCsv(ev);
    expect(csv.startsWith("﻿")).toBe(true); expect(csv.includes("\r\n")).toBe(true);
    const lines = csv.slice(1).trim().split("\r\n");
    expect(lines[0].split(";")).toEqual([...CSV_COLUMNS]);
    expect(lines[1]).toContain('"Durand; Ana"'); expect(lines[1]).toContain('"Gilet jaune\n""sifflet"""'.replace("\n", "\n"));
    expect(lines[1]).toContain("10 km + 20 km + 40 km"); expect(lines[1]).toContain("ana@exemple.fr"); expect(lines[1]).toContain("Partiel");
    expect(csv).toContain("'=Bob"); expect(csv).toContain("Non affecté");
  });
});

import { trackCandidates } from "../src/lib/poi-sync";
describe("poste sur le tronc commun de plusieurs parcours", () => {
  it("un ravitaillement placé sur le 10 km mais aussi sur le tracé du 20 km est proposé comme commun ; plus après l'avoir rendu commun", () => {
    const r20 = { id: "R20b", coords: line(0, 0.01, 20), pois: [] as Poi[] }; // même direction que le 10 km, plus long
    const r10 = { ...routes[0], pois: [{ id: "rv", type: "ravito" as const, name: "Ravito tronc commun", lng: 6, lat: 45.05 }] };
    const ev0: EventModel = { ...base(), races: [race("10", "R10"), race("20", "R20b")] };
    let ev = syncEvent(ev0, [r10, r20]).ev;
    const c = trackCandidates(ev, [r10, r20]); expect(c).toHaveLength(1); expect(c[0].raceIds).toEqual(["20"]); expect(c[0].routeIds).toEqual(["R20b"]);
    const r20c = { ...r20, pois: [{ ...r10.pois[0], common: true }] };
    ev = syncEvent(ev, [{ ...r10, pois: [{ ...r10.pois[0], common: true }] }, r20c]).ev;
    expect(trackCandidates(ev, [r10, r20c])).toHaveLength(0);
    expect(ev.posts.filter((p) => p.kind === "ravito")).toHaveLength(1);
  });
});
