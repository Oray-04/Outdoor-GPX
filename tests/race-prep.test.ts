import { describe, it, expect, vi, afterEach } from "vitest";
import { departmentsAlong, classify, ageCategories, youngestAllowed, mandatoryGear, medicalPlan, shiftDate, timeline, raceDay, logisticsChecks, adminFile, budgetTotal, rulesDraft, prepReport } from "../src/lib/race-prep";
import type { EventModel, Post, Race } from "../src/lib/events";

const race = (o: Partial<Race> = {}): Race => ({ id: "r1", label: "Le 30", sport: "trail", distanceKm: 30, gainM: 1500, startTime: "08:00", maxHours: 7, routeId: "rt", ...o });
const post = (id: string, kind: Post["kind"], km: number, o: Partial<Post> = {}): Post => ({ id, raceId: "r1", kind, name: id, km, staffNeeded: 1, note: "", ...o });
const event = (o: Partial<EventModel> = {}): EventModel => ({ id: "e", name: "Trail du Test", organizer: "Club du Test", date: "2027-05-31", place: "Digne", region: "", description: "", rules: "", practical: "", registrationUrl: "", races: [race()], posts: [], volunteers: [], team: [], origin: "mine", createdAt: 0, ...o });

describe("préparation d'une épreuve de trail", () => {
  it("nature de l'épreuve selon la distance et plafond de goudron", () => {
    expect(classify(12).id).toBe("nature"); expect(classify(20.9).id).toBe("nature"); expect(classify(21).id).toBe("decouverte"); expect(classify(42).id).toBe("decouverte");
    expect(classify(42.5).id).toBe("trail"); expect(classify(80).id).toBe("trail"); expect(classify(81).id).toBe("ultra");
    expect(classify(12).maxPavedPct).toBe(25); expect(classify(60).maxPavedPct).toBe(15);
    expect(classify(60).pavedOk).toBeNull(); expect(classify(60, 15).pavedOk).toBe(true); expect(classify(60, 16).pavedOk).toBe(false); expect(classify(12, 24).pavedOk).toBe(true);
  });
  it("catégories admises : distances maximales par âge", () => {
    const ok = (km: number) => ageCategories(km, 2027).filter((a) => a.allowed).map((a) => a.code);
    expect(ok(0.8)).toEqual(["EA", "PO", "BE", "MI", "CA", "JU", "ES", "SE", "VE"]); expect(ok(1)).toEqual(["PO", "BE", "MI", "CA", "JU", "ES", "SE", "VE"]);
    expect(ok(5)).toEqual(["MI", "CA", "JU", "ES", "SE", "VE"]); expect(ok(15)).toEqual(["CA", "JU", "ES", "SE", "VE"]); expect(ok(25)).toEqual(["JU", "ES", "SE", "VE"]); expect(ok(26)).toEqual(["ES", "SE", "VE"]);
    const y = youngestAllowed(30, 2027); expect(y.code).toBe("ES"); expect(y.born).toBe("2005 à 2007"); expect(ageCategories(30, 2027)[8].born).toBe("1987 et avant");
  });
  it("matériel et dispositif médical", () => {
    expect(mandatoryGear(10, false)).toHaveLength(5); expect(mandatoryGear(10, false)[0]).toMatch(/bidon/); expect(mandatoryGear(40, true)).toHaveLength(7); expect(mandatoryGear(40, true).join()).toMatch(/Éclairage/);
    expect(medicalPlan(100, 20).items).toHaveLength(2); expect(medicalPlan(250, 20).items.join()).toMatch(/ambulance/i); expect(medicalPlan(500, 20).level).toMatch(/250 à 500/); expect(medicalPlan(501, 20).items.join()).toMatch(/médecin/);
    expect(medicalPlan(100, 50).items.join()).toMatch(/Présence obligatoire d'au moins un médecin/); expect(medicalPlan(100, 42).items.join()).not.toMatch(/Présence obligatoire/);
  });
  it("échéancier daté depuis la date de l'épreuve", () => {
    expect(shiftDate("2027-05-31", { months: -3 })).toBe("2027-02-28"); expect(shiftDate("2027-01-15", { months: -6 })).toBe("2026-07-15"); expect(shiftDate("2027-03-01", { days: -1 })).toBe("2027-02-28"); expect(shiftDate("", { days: 1 })).toBeNull();
    const t = timeline("2027-05-31", false), by = (id: string) => t.find((x) => x.id === id)!;
    expect(by("secours").due).toBe("2026-11-30"); expect(by("dossier").due).toBe("2027-04-19"); expect(timeline("2027-05-31", true).find((x) => x.id === "dossier")!.due).toBe("2027-02-28");
    expect(by("veille").due).toBe("2027-05-30"); expect(by("jour").due).toBe("2027-05-31"); expect(by("debalisage").due).toBe("2027-06-02");
    expect(t.map((x) => x.due)).toEqual([...t.map((x) => x.due)].sort()); // ordre chronologique
    expect(timeline("", false).every((x) => x.due === null)).toBe(true);
  });
  it("horaires du jour J autour de l'heure de départ", () => {
    const d = raceDay(race()); expect(d.steps.map((s) => s.clock).slice(0, 4)).toEqual(["05:45", "07:00", "07:45", "08:00"]); expect(d.steps[5].clock).toBe("15:00"); expect(d.steps[5].estimate).toBe(false);
    expect(d.steps[4].estimate).toBe(true); expect(d.firstH).toBeGreaterThan(1); expect(d.firstH).toBeLessThan(d.lastH);
    expect(raceDay(race({ maxHours: 0 })).steps[5].estimate).toBe(true);
  });
  it("contrôles de la logistique : signaleurs, secours, ravitaillement, barrières", () => {
    const empty = logisticsChecks(event(), race(), classify(30)); expect(empty.filter((c) => c.level === "warn")).toHaveLength(2); expect(logisticsChecks(event({ races: [race({ distanceKm: 55 })] }), race({ distanceKm: 55 }), classify(55)).some((c) => c.level === "warn" && /pas même à l'arrivée/.test(c.text))).toBe(true); expect(empty.some((c) => /Aucun poste de signaleur/.test(c.text))).toBe(true);
    const ev = event({ posts: [post("s1", "signaleur", 3), post("sec", "secours", 15), post("rav", "ravito", 30), post("c", "controle", 15, { cutoffH: 4 })], volunteers: [{ id: "v", name: "Ana", phone: "", postId: "s1", from: "", to: "", instructions: "" }] });
    const full = logisticsChecks(ev, race(), classify(30)); expect(full.filter((c) => c.level === "warn")).toEqual([]); expect(full.some((c) => /tous pourvus/.test(c.text))).toBe(true); expect(full.some((c) => /50 m avant/.test(c.text))).toBe(true);
    const short = logisticsChecks({ ...ev, volunteers: [] }, race(), classify(30)); expect(short.some((c) => c.level === "warn" && /sans bénévole/.test(c.text))).toBe(true);
    expect(logisticsChecks(event({ races: [race({ distanceKm: 100 })] }), race({ distanceKm: 100 }), classify(100)).some((c) => /barrière horaire/.test(c.text) && c.level === "warn")).toBe(true);
    expect(logisticsChecks(event(), race({ routeId: undefined }), classify(30)).some((c) => /Aucun parcours lié/.test(c.text))).toBe(true);
  });
  it("dossier administratif : pièces automatiques et pièces cochées", () => {
    const f0 = adminFile(event(), {}), by = (l: typeof f0, id: string) => l.find((x) => x.id === id)!;
    expect(by(f0, "date").ok).toBe(true); expect(by(f0, "participants").ok).toBe(false); expect(by(f0, "reglement").ok).toBe(false); expect(by(f0, "assurance").auto).toBe(false); expect(by(f0, "assurance").ok).toBe(false);
    const ev = event({ rules: "x".repeat(60), posts: [post("d", "depart", 0), post("a", "arrivee", 30), post("s1", "signaleur", 3), post("sec", "secours", 15)], volunteers: [{ id: "v", name: "Ana", phone: "", postId: "s1", from: "", to: "", instructions: "" }] });
    const f1 = adminFile(ev, { participants: 300, spectators: 0, done: ["assurance"] });
    for (const id of ["participants", "spectateurs", "reglement", "zones", "secours", "signaleurs", "plan", "assurance"]) expect(by(f1, id).ok, id).toBe(true);
    expect(by(f1, "signaleurs").detail).toMatch(/Ana/); expect(by(f1, "ordre").ok).toBe(false);
  });
  it("budget, règlement type et dossier complet", () => {
    expect(budgetTotal({ medical: 800, dossards: 150.5, inconnu: 999 })).toBe(950.5); expect(budgetTotal(undefined)).toBe(0);
    const ev = event({ posts: [post("c", "controle", 15, { cutoffH: 4, name: "Col" })] }), txt = rulesDraft(ev, { night: true });
    expect(txt).toMatch(/Trail du Test/); expect(txt).toMatch(/31 mai 2027/); expect(txt).toMatch(/Le 30 : 30 km, 1500 m/); expect(txt).toMatch(/trail découverte/); expect(txt).toMatch(/espoirs \(nés en 2005 à 2007\)/);
    expect(txt).toMatch(/Barrière horaire — Le 30, Col \(km 15\) : 12:00/); expect(txt).toMatch(/éclairage/); expect(txt).toMatch(/\[à compléter\]/);
    const rep = prepReport(ev, { participants: 300, budget: { medical: 500 } }); expect(rep.map((s) => s.title).join("|")).toMatch(/Le 30.*Dispositif médical.*Échéancier.*Dossier administratif.*Budget.*urgence.*Signalétique/);
    expect(prepReport(event({ races: [] }), {}).length).toBeGreaterThanOrEqual(4);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("départements traversés : dédoublonnés, null si le service ne répond pas", async () => {
    let k = 0; vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [{ properties: { departmentcode: k++ < 3 ? "74" : "73" } }] }))));
    expect(await departmentsAlong([[6.8, 45.9], [6.9, 45.8], [7, 45.7], [7.1, 45.6], [7.2, 45.5]])).toEqual(["73", "74"]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("réseau"); })); expect(await departmentsAlong([[6.8, 45.9], [6.9, 45.8]])).toBeNull();
    expect(await departmentsAlong([[6.8, 45.9]])).toEqual([]);
  });
});
