import { describe, it, expect } from "vitest";
import { sampleRoute, relativeWind, atTime, evaluate, startHourScores, comfortScore, wallMs, addDays, type Forecast, type Hourly } from "../src/lib/weather";
import { bearing } from "../src/lib/navigation";
import type { Pt } from "../src/lib/types";

/** Prévision synthétique : vent constant, pluie à une heure donnée. */
const hourly = (date: string, o: { wind: number; dir: number; rainHour?: number; temp?: number }): Hourly => {
  const time = Array.from({ length: 48 }, (_, i) => `${addDays(date, Math.floor(i / 24))}T${String(i % 24).padStart(2, "0")}:00`);
  return { time, temperature_2m: time.map((_, i) => (o.temp ?? 12) + (i % 24 === 14 ? 4 : 0)), precipitation: time.map((_, i) => (i === o.rainHour ? 3 : 0)), precipitation_probability: time.map((_, i) => (i === o.rainHour ? 80 : 5)),
    wind_speed_10m: time.map(() => o.wind), wind_direction_10m: time.map(() => o.dir), wind_gusts_10m: time.map(() => o.wind * 1.5), weather_code: time.map(() => 1) };
};
const fc = (h: Hourly, n: number): Forecast[] => Array.from({ length: n }, () => ({ hourly: h }));

// aller vers l'est sur 10 km, puis retour (aller-retour)
const east: Pt[] = Array.from({ length: 101 }, (_, i) => [6 + i * 0.0013, 45, 1000]);
const outBack: Pt[] = [...east, ...[...east].reverse().slice(1)];

describe("météo le long du parcours", () => {
  it("échantillonnage : départ et arrivée inclus, cap vers l'est", () => {
    const s = sampleRoute(east, 6);
    expect(s).toHaveLength(6); expect(s[0].distM).toBe(0); expect(s.at(-1)!.index).toBe(east.length - 1);
    s.forEach((x) => expect(x.bearing).toBeCloseTo(90, 0));
  });
  it("vent relatif : de face, dans le dos, de côté, faible", () => {
    expect(relativeWind(90, 20, 90)).toMatchObject({ cls: "face" });     // je vais à l'est, le vent vient de l'est
    expect(relativeWind(90, 20, 90).head).toBeCloseTo(20, 5);
    expect(relativeWind(270, 20, 90)).toMatchObject({ cls: "dos" });
    expect(relativeWind(270, 20, 90).head).toBeCloseTo(-20, 5);
    expect(relativeWind(0, 20, 90)).toMatchObject({ cls: "cote" });
    expect(relativeWind(0, 20, 90).head).toBeCloseTo(0, 5);
    expect(relativeWind(90, 4, 90).cls).toBe("calme");
  });
  it("interpolation horaire (température, direction par le plus court chemin)", () => {
    const h = hourly("2027-05-01", { wind: 10, dir: 350 }); h.wind_direction_10m[9] = 10; h.temperature_2m[9] = 20; h.temperature_2m[8] = 10;
    const p = atTime(h, wallMs("2027-05-01T08:30"))!;
    expect(p.temp).toBeCloseTo(15, 5);
    expect(Math.min(p.dir, 360 - p.dir)).toBeLessThan(0.5); // 350° → 10° passe par le nord (0°), pas par le sud
    expect(atTime(h, wallMs("2030-01-01T00:00"))).toBeNull();
  });
  it("aller-retour avec vent d'ouest : face au retour, dans le dos à l'aller (inversion automatique)", () => {
    const samples = sampleRoute(outBack, 12);
    const r = evaluate(samples, fc(hourly("2027-05-01", { wind: 24, dir: 270 }), 12), wallMs("2027-05-01T08:00"), 180);
    const first = r.segments.slice(0, 5), last = r.segments.slice(-5);
    expect(first.every((s) => s.cls === "dos")).toBe(true);     // vers l'est, vent d'ouest : dans le dos
    expect(last.every((s) => s.cls === "face")).toBe(true);     // retour vers l'ouest : de face
    expect(Math.abs(r.exposure.facePct - r.exposure.dosPct)).toBeLessThanOrEqual(10);
    expect(Math.abs(r.exposure.avgHead)).toBeLessThan(4);       // bilan à peu près nul sur un aller-retour symétrique (vent de 24 km/h)
    expect(r.exposure.maxGust).toBeCloseTo(36, 0);
  });
  it("vent d'est sur un parcours vers l'est : 100 % de face", () => {
    const r = evaluate(sampleRoute(east, 8), fc(hourly("2027-05-01", { wind: 25, dir: 90 }), 8), wallMs("2027-05-01T09:00"), 120);
    expect(r.exposure.facePct).toBe(100); expect(r.exposure.avgHead).toBeCloseTo(25, 0);
  });
  it("l'heure de passage suit l'effort : la météo vécue change avec l'heure de départ", () => {
    const h = hourly("2027-05-01", { wind: 10, dir: 90, rainHour: 12 });
    const s = sampleRoute(east, 8);
    const matin = evaluate(s, fc(h, 8), wallMs("2027-05-01T06:00"), 120).exposure.precipMm;
    const midi = evaluate(s, fc(h, 8), wallMs("2027-05-01T11:00"), 120).exposure.precipMm;
    expect(midi).toBeGreaterThan(matin);
    expect(evaluate(s, fc(h, 8), wallMs("2027-05-01T11:00"), 120).points.at(-1)!.timeMs - wallMs("2027-05-01T11:00")).toBe(120 * 60e3);
  });
  it("meilleur créneau : évite la pluie", () => {
    const sc = startHourScores(sampleRoute(east, 8), fc(hourly("2027-05-01", { wind: 10, dir: 90, rainHour: 12 }), 8), "2027-05-01", 120);
    expect(sc).toHaveLength(24);
    expect(sc[11].score).toBeGreaterThan(sc[6].score); // départ à 11 h (pluie à 12 h) pire que 6 h
    expect(Math.min(...sc.map((x) => x.score))).toBeLessThan(comfortScore(sc[11].exposure));
  });
  it("cap d'un point = cap du parcours", () => { expect(bearing([6, 45], [6.1, 45])).toBeCloseTo(90, 0); });
  it("addDays", () => { expect(addDays("2027-02-28", 1)).toBe("2027-03-01"); expect(addDays("2027-12-31", 1)).toBe("2028-01-01"); });
});
