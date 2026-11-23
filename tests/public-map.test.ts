import { describe, it, expect } from "vitest";
import { publicPoints, runnerMap, isPublic, togglePost, toggleKind, kindsOf, poisOf, normalizeRunnerMap, PUBLIC_KINDS } from "../src/lib/public-map";
import { toPublicEvent } from "../src/lib/sync";
import { eventFromRow } from "../src/lib/community";
import type { EventModel, Post, PostKind } from "../src/lib/events";

const post = (id: string, kind: PostKind, km: number, raceId = "c10", extra: Partial<Post> = {}): Post => ({ id, raceId, kind, name: `${kind} ${id}`, km, lng: 6 + km / 100, lat: 45, staffNeeded: 2, note: "Consigne interne : clé du local", ...extra } as Post);
const ev = (p: Partial<EventModel> = {}): EventModel => ({ id: "e", name: "T", organizer: "", date: "2027-06-20", place: "", region: "", description: "", rules: "", practical: "", registrationUrl: "", origin: "mine", createdAt: 0, team: [], volunteers: [{ id: "v", name: "Ana", phone: "06", postId: "s1", from: "", to: "", instructions: "" }],
  races: [{ id: "c10", label: "10 km", sport: "trail", distanceKm: 10, gainM: 1, startTime: "8:00", maxHours: 3, routeId: "R" }, { id: "c20", label: "20 km", sport: "trail", distanceKm: 20, gainM: 1, startTime: "8:00", maxHours: 5 }],
  posts: [post("d", "depart", 0), post("r1", "ravito", 5), post("s1", "signaleur", 3), post("t1", "controle", 7), post("e1", "eau", 8), post("r2", "ravito", 12, "c20"), post("rc", "ravito", 4, "c10", { shared: [{ raceId: "c20", km: 9 }] } as Partial<Post>)], ...p });

describe("carte des coureurs : points utiles seulement", () => {
  it("par défaut : ravitaillements, eau, secours, parkings, points de vue ; signaleurs et chronométrage masqués", () => {
    const pts = publicPoints(ev());
    expect(pts.filter((p) => p.raceId === "c10").map((p) => p.id)).toEqual(["r1", "e1", "rc"]);
    expect(pts.filter((p) => p.raceId === "c20").map((p) => `${p.id}@${p.km}`)).toEqual(["r2@12", "rc@9"]); // poste commun : au bon km sur chaque course
    expect(pts.some((p) => ["s1", "t1", "d"].includes(p.id))).toBe(false);
    expect(kindsOf(undefined)).toEqual(PUBLIC_KINDS);
  });
  it("aucune donnée interne publiée (effectifs, consignes, bénévoles)", () => {
    const json = JSON.stringify(publicPoints(ev()));
    expect(json).not.toMatch(/Consigne|staff|Ana|06/);
  });
  it("exception poste par poste et par type ; les postes de la logistique ne changent jamais", () => {
    const e = ev(), before = JSON.stringify(e.posts);
    let s = togglePost(undefined, e.posts.find((p) => p.id === "r1")!); expect(s.hidden).toEqual(["r1"]); expect(isPublic(e.posts[1], s)).toBe(false);
    s = togglePost(s, e.posts.find((p) => p.id === "t1")!); expect(s.shown).toEqual(["t1"]); // chronométrage montré malgré son type
    s = togglePost(s, e.posts.find((p) => p.id === "r1")!); expect(s.hidden).toEqual([]);
    s = toggleKind(s, "eau"); expect(kindsOf(s)).not.toContain("eau");
    const pts = publicPoints({ ...e, publicMap: s }).filter((p) => p.raceId === "c10").map((p) => p.id);
    expect(pts).toEqual(["r1", "t1", "rc"]);
    expect(JSON.stringify(e.posts)).toBe(before);
  });
  it("course sans poste : points du parcours, même règle (danger = signaleur, masqué)", () => {
    const e = ev({ posts: [] });
    const pts = publicPoints(e, () => [{ id: "p1", type: "ravito", name: "Ravito du col", lng: 6, lat: 45 }, { id: "p2", type: "danger", name: "Traversée", lng: 6.1, lat: 45 }]);
    expect(pts.filter((p) => p.raceId === "c10").map((p) => p.name)).toEqual(["Ravito du col"]);
  });
  it("marqueurs de carte et carte importée", () => {
    const m = runnerMap(ev({ publicMap: { image: "data:image/jpeg;base64,AA", caption: "Plan", interactive: false } }));
    expect(m).toMatchObject({ image: "data:image/jpeg;base64,AA", caption: "Plan", interactive: false });
    expect(poisOf(m, "c10").map((p) => p.type)).toEqual(["ravito", "eau", "ravito"]);
  });
});

describe("publication : seule la carte des coureurs quitte l'appareil", () => {
  it("points filtrés publiés, relus nettoyés ; événement d'un autre organisateur affiché tel que reçu", () => {
    const row = toPublicEvent("u", ev()) as { runner_map: { points: { id: string }[] } };
    expect(row.runner_map.points.map((p) => p.id).sort()).toEqual(["e1", "r1", "r2", "rc", "rc"].sort());
    expect(JSON.stringify(row)).not.toMatch(/Consigne|signaleur|controle/);
    const back = eventFromRow({ ...(row as unknown as Parameters<typeof eventFromRow>[0]), runner_map: { points: [...row.runner_map.points, { id: "x", raceId: "c10", kind: "inconnu", lng: 1, lat: 1 }], image: "https://pistage.example/x.png" } });
    expect(back.runnerMap?.points).toHaveLength(5); expect(back.runnerMap?.image).toBeUndefined();
    expect(runnerMap(back).points).toHaveLength(5);
    expect(normalizeRunnerMap(null)).toBeUndefined();
  });
});
