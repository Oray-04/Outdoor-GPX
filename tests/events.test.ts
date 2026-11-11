import { describe, it, expect } from "vitest";
import { DEMO_VMS, DEMO_EVENT_MODELS } from "./fixtures/synthetic";
import { passageTable, positionOnTrack, effortProfile, clockAt, filterEvents, DEFAULT_EVENT_FILTERS, type Race, type Post } from "../src/lib/events";
import type { Pt } from "../src/lib/types";

// 10 km quasi rectilignes avec 500 m de D+ concentrés dans la 2e moitié
const coords: Pt[] = Array.from({ length: 101 }, (_, i) => [6, 45 + i * 0.0009, i <= 50 ? 1000 : 1000 + (i - 50) * 10]);
const race: Race = { id: "r", label: "10K", sport: "trail", distanceKm: 10, gainM: 500, startTime: "08:00", maxHours: 3 };
const post = (km: number, extra: Partial<Post> = {}): Post => ({ id: String(km), raceId: "r", kind: "ravito", name: `R${km}`, km, staffNeeded: 2, note: "", ...extra });

describe("événements", () => {
  it("heure d'horloge et passage minuit", () => { expect(clockAt("08:30", 45)).toBe("09:15"); expect(clockAt("23:00", 90)).toBe("00:30 (+1 j)"); });
  it("km d'un point posé sur la trace", () => {
    const p = positionOnTrack(coords, 6, 45 + 50 * 0.0009);
    expect(p.km).toBeGreaterThan(4.9); expect(p.km).toBeLessThan(5.1); expect(p.offTrackM).toBeLessThan(1);
  });
  it("l'effort pèse le dénivelé : le km 5 arrive avant la mi-temps", () => {
    const rows = passageTable(race, [post(5)], coords, [2]);
    expect(rows[0].times[0].elapsedMin).toBeLessThan(60);  // 5 km plats = ~1/3 de l'effort total
    expect(rows[0].times[0].elapsedMin).toBeGreaterThan(30);
  });
  it("sans trace : proportionnel aux km", () => {
    expect(passageTable(race, [post(5)], null, [2])[0].times[0].elapsedMin).toBeCloseTo(60);
  });
  it("barrière horaire dépassée détectée", () => {
    const r = passageTable(race, [post(5, { cutoffH: 0.5 })], null, [1, 4]);
    expect(r[0].late).toEqual([false, true]);
  });
  it("effort cumulé = km + D+/100", () => { const { e } = effortProfile(coords); expect(e.at(-1)!).toBeGreaterThan(14); expect(e.at(-1)!).toBeLessThan(16); });
  it("filtre par sport, distance, dates", () => {
    expect(filterEvents(DEMO_EVENT_MODELS, { ...DEFAULT_EVENT_FILTERS, sport: "gravel" })).toHaveLength(1);
    expect(filterEvents(DEMO_EVENT_MODELS, { ...DEFAULT_EVENT_FILTERS, minKm: 35 }).map((e) => e.id)).toEqual(expect.arrayContaining(["ev-1", "ev-4"]));
    expect(filterEvents(DEMO_EVENT_MODELS, { ...DEFAULT_EVENT_FILTERS, minKm: 35 }).map((e) => e.id)).not.toContain("ev-2");
    expect(filterEvents(DEMO_EVENT_MODELS, { ...DEFAULT_EVENT_FILTERS, from: "2027-06-01", to: "2027-06-30" })).toHaveLength(1);
  });
});

describe("événements de démonstration", () => {
  it("chaque course est reliée à un parcours de démonstration existant, aux mesures cohérentes", () => {
    for (const e of DEMO_EVENT_MODELS) for (const r of e.races) {
      const v = DEMO_VMS.find((x) => x.id === r.routeId);
      expect(v, `${e.name} / ${r.label}`).toBeDefined();
      expect(r.distanceKm).toBeCloseTo(v!.stats.distanceM / 1000, 1); expect(r.gainM).toBe(Math.round(v!.stats.gainM));
    }
  });
});
