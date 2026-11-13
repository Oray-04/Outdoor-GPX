import { describe, it, expect } from "vitest";
import { postNumbers, postLabel, volunteersAt, assignVolunteer, addVolunteerAt, cleanAssignments, raceFactsFromRoute, raceOutOfSync, type EventModel, type Post, type Race, type Volunteer } from "../src/lib/events";
import { racesUsing, deleteMessage } from "../src/lib/route-delete";
import type { Pt } from "../src/lib/types";

const race = (id: string, o: Partial<Race> = {}): Race => ({ id, label: `Course ${id}`, sport: "trail", distanceKm: 10, gainM: 300, startTime: "08:00", maxHours: 4, ...o });
const post = (id: string, raceId: string, km: number, kind: Post["kind"] = "ravito"): Post => ({ id, raceId, kind, name: `P-${id}`, km, staffNeeded: 2, note: "" });
const vol = (id: string, name: string, postId = ""): Volunteer => ({ id, name, phone: "06", postId, from: "07:00", to: "12:00", instructions: "gilet" });
const ev = (): Pick<EventModel, "races" | "posts" | "volunteers"> => ({ races: [race("r1"), race("r2")], posts: [post("b", "r1", 12), post("a", "r1", 3), post("c", "r1", 20), post("x", "r2", 5)], volunteers: [vol("v1", "Ana Durand", "a"), vol("v2", "Léo", "")] });

describe("bénévoles et postes : une seule affectation, lue par la carte et par les fiches", () => {
  it("numéros de poste : par course, dans l'ordre des kilomètres (comme sur la carte)", () => {
    const n = postNumbers(ev()); expect(n.get("a")!.n).toBe(1); expect(n.get("b")!.n).toBe(2); expect(n.get("c")!.n).toBe(3); expect(n.get("x")!.n).toBe(1); expect(n.get("x")!.race!.id).toBe("r2");
    expect(postLabel(ev(), ev().posts[2])).toBe("Poste 3 — P-c (km 20) · Course r1"); expect(postLabel({ ...ev(), races: [race("r1")] }, ev().posts[0])).toBe("Poste 2 — P-b (km 12)");
  });
  it("fiche → carte : choisir le poste 3 sur la fiche place le bénévole au poste 3", () => {
    const e = assignVolunteer(ev(), "v2", "c"); expect(volunteersAt(e, "c").map((v) => v.name)).toEqual(["Léo"]); expect(e.volunteers.find((v) => v.id === "v2")).toMatchObject({ postId: "c", phone: "06", instructions: "gilet" });
  });
  it("carte → fiche : affecter depuis un poste met à jour la fiche ; un bénévole n'a qu'un poste", () => {
    const e = assignVolunteer(ev(), "v1", "b"); expect(volunteersAt(e, "a")).toEqual([]); expect(volunteersAt(e, "b").map((v) => v.id)).toEqual(["v1"]); expect(e.volunteers).toHaveLength(2);
    expect(assignVolunteer(e, "v1", "").volunteers[0].postId).toBe(""); expect(assignVolunteer(e, "v1", "inconnu").volunteers[0].postId).toBe(""); expect(assignVolunteer(e, "nul", "b")).toEqual(e);
  });
  it("ajout depuis la carte : nouvelle fiche, ou réaffectation si le nom existe déjà (pas de doublon)", () => {
    const e1 = addVolunteerAt(ev(), "  Zoé   Martin ", "c", "v3"); expect(e1.volunteers).toHaveLength(3); expect(e1.volunteers[2]).toMatchObject({ id: "v3", name: "Zoé Martin", postId: "c" });
    const e2 = addVolunteerAt(e1, "ana  durand", "c", "v4"); expect(e2.volunteers).toHaveLength(3); expect(volunteersAt(e2, "c").map((v) => v.id).sort()).toEqual(["v1", "v3"]); expect(e2.volunteers[0]).toMatchObject({ name: "Ana Durand", phone: "06", from: "07:00" });
    expect(addVolunteerAt(ev(), "   ", "c", "v9").volunteers).toHaveLength(2);
  });
  it("poste supprimé : les fiches sont gardées, remises à « non affecté »", () => {
    const e = { ...ev(), posts: ev().posts.filter((p) => p.id !== "a") }, c = cleanAssignments(e); expect(c.volunteers).toHaveLength(2); expect(c.volunteers[0]).toMatchObject({ name: "Ana Durand", postId: "", phone: "06" });
    const same = ev(); expect(cleanAssignments(same)).toBe(same);
  });
});

describe("course créée à partir d'un parcours", () => {
  const coords: Pt[] = [[6, 45, 1000], [6.01, 45, 1100], [6.02, 45, 1050], [6.03, 45, 1250]];
  it("distance, D+, D−, altitudes repris du tracé", () => {
    const f = raceFactsFromRoute(coords); expect(f.distanceKm).toBeCloseTo(2.4, 1); expect(f.gainM).toBe(300); expect(f.lossM).toBe(50); expect(f.minEle).toBe(1000); expect(f.maxEle).toBe(1250);
  });
  it("détecte une course qui ne correspond plus à son parcours", () => {
    const r = race("r1", raceFactsFromRoute(coords)); expect(raceOutOfSync(r, coords)).toBe(false);
    expect(raceOutOfSync(r, [...coords, [6.04, 45, 1400] as Pt])).toBe(true); expect(raceOutOfSync(race("r1"), coords)).toBe(true);
  });
});

describe("suppression de parcours dans Mon espace", () => {
  it("message de confirmation : un ou plusieurs parcours, courses qui en dépendent", () => {
    expect(deleteMessage(["Tour du lac"], [])).toMatch(/^Supprimer le parcours « Tour du lac » \?/); expect(deleteMessage(["A", "B", "C"], [])).toMatch(/Supprimer ces 3 parcours \?[\s\S]*• A\n• B\n• C/);
    expect(deleteMessage(Array.from({ length: 15 }, (_, i) => `P${i}`), [])).toMatch(/et 3 autre\(s\)/); expect(deleteMessage(["A"], ["Le 30 (Trail X)"])).toMatch(/une course s'appuie sur ce parcours : Le 30 \(Trail X\)/); expect(deleteMessage(["A"], [])).toMatch(/définitive/);
    expect(racesUsing([{ name: "Trail X", races: [race("r1", { routeId: "rt1", label: "Le 30" }), race("r2", { routeId: "rt2" })] }], ["rt1"])).toEqual(["Le 30 (Trail X)"]);
  });
});
