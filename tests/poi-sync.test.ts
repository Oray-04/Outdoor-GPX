import { describe, it, expect } from "vitest";
import { syncEvent, syncRacePosts, placeOn, proposeShared, poiPostId, endpointId } from "../src/lib/poi-sync";
import type { EventModel, Post, Race } from "../src/lib/events";
import type { Poi, Pt } from "../src/lib/types";

// tracé rectiligne vers le nord : 0,01° de latitude ≈ 1,11 km ; 11 points → ≈ 11 km
const coords: Pt[] = Array.from({ length: 11 }, (_, i) => [6, 45 + i * 0.01, 1000 + i * 20] as Pt);
const race: Race = { id: "r1", label: "Trail 11 km", sport: "trail", distanceKm: 11, gainM: 200, startTime: "08:00", maxHours: 3, routeId: "rt" };
const poi = (id: string, type: Poi["type"], i: number, name = id, dLng = 0): Poi => ({ id, type, name, lng: 6 + dLng, lat: 45 + i * 0.01 });
const evOf = (posts: Post[] = [], volunteers: EventModel["volunteers"] = []): EventModel => ({ id: "e", name: "E", organizer: "", date: "", place: "", region: "", description: "", rules: "", practical: "", registrationUrl: "", races: [race], posts, volunteers, team: [], origin: "mine", createdAt: 0 });
const route = (pois: Poi[]) => ({ id: "rt", coords, pois });

describe("POI partagés entre le parcours et la logistique", () => {
  it("les POI du parcours apparaissent dans la logistique ; départ et arrivée pris aux extrémités du parcours", () => {
    const { ev } = syncEvent(evOf(), [route([poi("p1", "ravito", 5, "Ravito du col"), poi("p2", "parking", 0, "Parking", 0.004), poi("p3", "danger", 3, "Traversée D12")])]);
    const byKind = Object.fromEntries(ev.posts.map((p) => [p.kind, p]));
    expect(ev.posts.map((p) => p.kind)).toEqual(["depart", "parking", "signaleur", "ravito", "arrivee"]);
    expect(byKind.depart).toMatchObject({ id: endpointId("r1", "depart"), lng: 6, lat: 45, km: 0 });
    expect(byKind.arrivee).toMatchObject({ lng: 6, lat: 45.1 }); expect(byKind.arrivee.km).toBeCloseTo(11.1, 0);
    expect(byKind.ravito).toMatchObject({ id: poiPostId("r1", "p1"), poiId: "p1", name: "Ravito du col", staffNeeded: 4 });
    expect(byKind.parking.offTrackM).toBeGreaterThan(250); // parking à l'écart du tracé : conservé hors tracé
  });
  it("idempotent : relancé sur le même état, rien ne change (pas d'écriture, pas de boucle)", () => {
    const rts = [route([poi("p1", "ravito", 5)])], once = syncEvent(evOf(), rts).ev;
    expect(syncEvent(once, rts).ev).toBe(once);
  });
  it("POI renommé ou déplacé dans le parcours → poste mis à jour, données d'organisation conservées", () => {
    const rts = [route([poi("p1", "ravito", 5)])];
    const e1 = syncEvent(evOf(), rts).ev, id = poiPostId("r1", "p1");
    const e2 = { ...e1, posts: e1.posts.map((p) => (p.id === id ? { ...p, staffNeeded: 7, cutoffH: 1.5, note: "tables" } : p)), volunteers: [{ id: "v", name: "Ana", phone: "", postId: id, from: "", to: "", instructions: "" }] };
    const e3 = syncEvent(e2, [route([poi("p1", "ravito", 7, "Ravito déplacé")])]).ev, p = e3.posts.find((x) => x.id === id)!;
    expect(p).toMatchObject({ name: "Ravito déplacé", lat: 45.07, staffNeeded: 7, cutoffH: 1.5, note: "tables" }); expect(p.km).toBeCloseTo(7.8, 0);
    expect(e3.volunteers[0].postId).toBe(id);
  });
  it("POI supprimé du parcours → poste retiré, bénévole gardé mais « non affecté »", () => {
    const e1 = syncEvent(evOf(), [route([poi("p1", "secours", 5)])]).ev, id = poiPostId("r1", "p1");
    const e2 = syncEvent({ ...e1, volunteers: [{ id: "v", name: "Ana", phone: "", postId: id, from: "", to: "", instructions: "" }] }, [route([])]).ev;
    expect(e2.posts.some((p) => p.id === id)).toBe(false); expect(e2.volunteers).toHaveLength(1); expect(e2.volunteers[0].postId).toBe("");
  });
  it("ancien poste saisi seulement dans la logistique → versé dans le parcours (sans doublon avec un POI proche du même type)", () => {
    const legacy: Post[] = [
      { id: "old1", raceId: "r1", kind: "ravito", name: "Ravito ferme", km: 4.4, lng: 6, lat: 45.04, staffNeeded: 5, note: "n" },
      { id: "old2", raceId: "r1", kind: "eau", name: "Fontaine", km: 6.7, lng: 6.0001, lat: 45.0601, staffNeeded: 1, note: "" },
    ];
    const res = syncEvent(evOf(legacy), [route([poi("p9", "eau", 6, "Fontaine (parcours)")])]);
    expect(res.addPois.get("rt")!.map((p) => [p.id, p.type, p.name])).toEqual([["lp-old1", "ravito", "Ravito ferme"]]);
    const old2 = res.ev.posts.find((p) => p.id === "old2")!; expect(old2.poiId).toBe("p9"); // rattaché au POI existant
    expect(res.ev.posts.filter((p) => p.kind === "eau")).toHaveLength(1);
    expect(res.ev.posts.find((p) => p.id === "old1")).toMatchObject({ poiId: "lp-old1", staffNeeded: 5, note: "n" });
  });
  it("départ déplacé à la main : conservé ; sinon recalé sur le parcours de base", () => {
    const moved: Post = { id: "d", raceId: "r1", kind: "depart", name: "Départ", km: 0, lng: 6.002, lat: 45.0005, staffNeeded: 4, note: "", pinned: true };
    const { posts } = syncRacePosts([moved], race, { coords, pois: [] });
    expect(posts.find((p) => p.id === "d")).toMatchObject({ lng: 6.002, pinned: true });
    const { posts: p2 } = syncRacePosts([{ ...moved, pinned: undefined }], race, { coords, pois: [] });
    expect(p2.find((p) => p.id === "d")).toMatchObject({ lng: 6, lat: 45 });
  });
  it("placement : aimanté sur le tracé s'il est proche, libre à l'écart ; le parking n'est jamais aimanté", () => {
    expect(placeOn(coords, "ravito", 6.0003, 45.05)).toMatchObject({ lng: 6, lat: 45.05 });
    const far = placeOn(coords, "secours", 6.01, 45.05); expect(far.lng).toBe(6.01); expect(far.offTrackM).toBeGreaterThan(700);
    expect(placeOn(coords, "parking", 6.0003, 45.05).lng).toBe(6.0003);
  });
  it("proposition automatique : chaque poste proposé devient un POI du parcours, sans doublon", () => {
    let n = 0; const id = () => `n${++n}`;
    const base = syncEvent(evOf(), [route([poi("p1", "ravito", 10)])]).ev;
    const { pois, posts } = proposeShared(base, race, route([poi("p1", "ravito", 10)]), id);
    expect(pois.length).toBe(posts.length); expect(posts.every((p) => p.auto && p.poiId && p.id === poiPostId("r1", p.poiId))).toBe(true);
    expect(posts.some((p) => p.kind === "depart" || p.kind === "arrivee")).toBe(false);
    // relancé après coup : rien de nouveau
    const after = syncEvent({ ...base, posts: [...base.posts, ...posts] }, [route([poi("p1", "ravito", 10), ...pois])]).ev;
    expect(proposeShared(after, race, route([poi("p1", "ravito", 10), ...pois]), id).pois).toHaveLength(0);
  });
});

import { mergePois } from "../src/lib/poi-sync";
describe("éditeur ouvert pendant que la logistique modifie le parcours", () => {
  const a = poi("a", "ravito", 2), b = poi("b", "eau", 4), c = poi("c", "secours", 6);
  it("ajout, déplacement et suppression faits dans la logistique sont repris ; les modifications de l'éditeur sont gardées", () => {
    const base = [a, b, c];
    const mine = [{ ...a, name: "Ravito renommé ici" }, b, c, poi("m", "vue", 8)]; // éditeur : renomme a, ajoute m
    const theirs = [a, { ...b, lat: 45.045 }, poi("t", "parking", 0, "P", 0.004)]; // logistique : déplace b, supprime c, ajoute t
    const r = mergePois(base, mine, theirs);
    expect(r.map((p) => p.id)).toEqual(["a", "b", "m", "t"]);
    expect(r[0].name).toBe("Ravito renommé ici"); expect(r[1].lat).toBe(45.045);
  });
  it("conflit sur le même point : l'éditeur l'emporte ; point modifié ici mais supprimé ailleurs : gardé", () => {
    const r = mergePois([a], [{ ...a, name: "ici" }], [{ ...a, name: "ailleurs" }]); expect(r[0].name).toBe("ici");
    expect(mergePois([a], [{ ...a, name: "ici" }], [])).toHaveLength(1);
    expect(mergePois([a], [a], [])).toHaveLength(0);
  });
});

import { postsOfRace, passageTable, postLabel } from "../src/lib/events";
describe("POI communs à plusieurs parcours : une seule fiche, un seul poste", () => {
  // parcours B : même départ, part vers l'est (le POI commun est au km 0,8 de A et sur B aussi)
  const coordsB: Pt[] = Array.from({ length: 6 }, (_, i) => [6 + i * 0.01, 45 + (i ? 0.007 : 0), 1000] as Pt);
  const raceB: Race = { ...race, id: "r2", label: "Trail court", routeId: "rtB" };
  const shared = poi("ps", "ravito", 0, "Ravito commun");
  const ev2 = (posts: Post[] = [], volunteers: EventModel["volunteers"] = []): EventModel => ({ ...evOf(posts, volunteers), races: [race, raceB] });
  const both = (aPois: Poi[], bPois: Poi[]) => [route(aPois), { id: "rtB", coords: coordsB, pois: bPois }];
  it("un même POI sur deux parcours → un seul poste, visible dans les deux courses avec son kilomètre", () => {
    const s1 = { ...shared, lat: 45.007 };
    const { ev } = syncEvent(ev2(), both([s1], [s1]));
    const ps = ev.posts.filter((p) => p.poiId === "ps");
    expect(ps).toHaveLength(1); expect(ps[0].raceId).toBe("r1"); expect(ps[0].shared?.map((x) => x.raceId)).toEqual(["r2"]);
    expect(postsOfRace(ev.posts, "r2").some((p) => p.id === ps[0].id)).toBe(true);
    expect(postLabel(ev, ps[0])).toMatch(/Trail 11 km \+ Trail court/);
    expect(syncEvent(ev, both([s1], [s1])).ev).toBe(ev); // idempotent
    const rows = passageTable(raceB, ev.posts, coordsB, [1]); expect(rows.some((r) => r.post.id === ps[0].id)).toBe(true);
  });
  it("retirer un parcours de l'association garde le POI (et son équipe) sur les autres", () => {
    const s1 = { ...shared, lat: 45.007 };
    const e1 = syncEvent(ev2(), both([s1], [s1])).ev, id = e1.posts.find((p) => p.poiId === "ps")!.id;
    const e1v = { ...e1, volunteers: [{ id: "v", name: "Ana", phone: "", postId: id, from: "", to: "", instructions: "" }] };
    const e2 = syncEvent(e1v, both([s1], [])).ev, p2 = e2.posts.find((p) => p.poiId === "ps")!;
    expect(p2.shared).toBeUndefined(); expect(p2.id).toBe(id); expect(e2.volunteers[0].postId).toBe(id);
    // retirer la course principale : le poste passe sur l'autre course, même identifiant, même bénévole
    const e3 = syncEvent(e1v, both([], [s1])).ev, p3 = e3.posts.find((p) => p.poiId === "ps")!;
    expect(p3.raceId).toBe("r2"); expect(p3.id).toBe(id); expect(e3.volunteers[0].postId).toBe(id);
  });
  it("anciens postes en double (deux courses sur le même parcours) → fusionnés, bénévoles reportés, effectif le plus grand", () => {
    const sameRoute = { ...raceB, routeId: "rt" };
    const old: Post[] = [
      { id: "r1~p1", raceId: "r1", kind: "ravito", name: "R", km: 5, staffNeeded: 3, note: "", poiId: "p1" },
      { id: "r2~p1", raceId: "r2", kind: "ravito", name: "R", km: 5, staffNeeded: 6, note: "", poiId: "p1" },
    ];
    const e = syncEvent({ ...evOf(old, [{ id: "v", name: "Léo", phone: "", postId: "r2~p1", from: "", to: "", instructions: "" }]), races: [race, sameRoute] }, [route([poi("p1", "ravito", 5)])]).ev;
    const ps = e.posts.filter((p) => p.poiId === "p1"); expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ id: "r1~p1", staffNeeded: 6 }); expect(e.volunteers[0].postId).toBe("r1~p1");
  });
});

import { propagateCommon } from "../src/lib/poi-sync";
describe("POI commun modifié dans un parcours → reporté dans les autres", () => {
  it("nom et position recopiés ; POI non commun ou retiré : rien n'est propagé", () => {
    const c = { ...poi("c", "ravito", 3, "Ravito commun"), common: true }, solo = poi("s", "eau", 4);
    const A = { id: "A", pois: [{ ...c, name: "Ravito du col", lat: 45.031 }, solo] }, B = { id: "B", pois: [c] }, C = { id: "C", pois: [poi("x", "vue", 1)] };
    const out = propagateCommon(A, [A, B, C]);
    expect(out.map((r) => r.id)).toEqual(["B"]); expect(out[0].pois[0]).toMatchObject({ name: "Ravito du col", lat: 45.031, common: true });
    expect(propagateCommon({ id: "A", pois: [solo] }, [A, B])).toEqual([]); // A a retiré le POI commun : B le garde tel quel
  });
});
