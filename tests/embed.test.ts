import { describe, it, expect } from "vitest";
import { encodeShared, decodeShared, embedHtml, embedUrl, readHash, shareUrl, EMBED_MAX_POINTS } from "../src/lib/embed";
import { trackStats } from "../src/lib/geo";
import type { Pt, Poi } from "../src/lib/types";

const track = (n: number): Pt[] => Array.from({ length: n }, (_, i) => [6.8 + i * 0.0004 + Math.sin(i / 7) * 0.0006, 45.9 + Math.cos(i / 11) * 0.002 + i * 0.0001, 1000 + Math.round(Math.sin(i / 30) * 300 + i * 0.5)]);
const pois: Poi[] = [{ id: "a", type: "eau", name: "Fontaine du village", lng: 6.81, lat: 45.905 }, { id: "b", type: "ravito", name: "Boulangerie <b>x</b>", lng: 6.83, lat: 45.91 }];

describe("partage par lien et intégration (sans serveur)", () => {
  it("aller-retour : tracé, altitudes, POI ; statistiques = celles du tracé complet", () => {
    const c = track(300); const code = encodeShared({ name: "Tour du lac", sport: "trail", region: "Haute-Savoie", description: "Belle boucle", coords: c, pois });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);                                  // sûr dans une adresse
    const r = decodeShared(code)!; const st = trackStats(c, 3);
    expect(r.coords).toHaveLength(300); expect(r.coords[0][0]).toBeCloseTo(c[0][0], 4); expect(r.coords[299][1]).toBeCloseTo(c[299][1], 4); expect(r.coords[150][2]).toBe(c[150][2]);
    expect(r).toMatchObject({ name: "Tour du lac", sport: "trail", region: "Haute-Savoie", description: "Belle boucle", distanceM: Math.round(st.distanceM), gainM: Math.round(st.gainM), lossM: Math.round(st.lossM), sourcePoints: 300 });
    expect(r.pois.map((p) => [p.type, p.name])).toEqual([["eau", "Fontaine du village"], ["ravito", "Boulangerie <b>x</b>"]]); // texte brut, affiché sans HTML
  });
  it("long tracé : allégé à 600 points au plus, extrémités gardées, statistiques d'origine conservées", () => {
    const c = track(5000); const r = decodeShared(encodeShared({ name: "Traversée", sport: "velo", region: "", coords: c, pois: [] }))!;
    expect(r.coords.length).toBeLessThanOrEqual(EMBED_MAX_POINTS); expect(r.sourcePoints).toBe(5000);
    expect(r.coords[0][0]).toBeCloseTo(c[0][0], 4); expect(r.coords.at(-1)![0]).toBeCloseTo(c.at(-1)![0], 4);
    expect(r.distanceM).toBe(Math.round(trackStats(c, 3).distanceM)); expect(r.gainM).toBe(Math.round(trackStats(c, 3).gainM)); expect(r.maxDevM).toBeLessThan(60);
  });
  it("contenu abîmé ou hostile : null, jamais d'exception", () => {
    for (const bad of ["", "abc", "%%%", btoa("{}"), btoa(JSON.stringify({ v: 2, p: "x", t: [] })), btoa(JSON.stringify({ v: 1, p: "??", t: [1, 2, 3] })), btoa(JSON.stringify({ v: 1, p: 5, t: [] }))]) expect(decodeShared(bad)).toBeNull();
    const far = btoa(JSON.stringify({ v: 1, n: "x", s: "zzz", t: [1, 1, 1, 2, 0], p: "_ibE_seK_ibE_ibE_ibE_ibE", k: [["pirate", "x", 1, 2], "nimp"] }));
    const r = decodeShared(far); if (r) { expect(r.sport).toBe("rando"); expect(r.pois).toEqual([]); } // sport inconnu → valeur sûre ; POI de type inconnu ignoré
  });
  it("code iframe : responsive, bac à sable, titre échappé ; options dans l'adresse", () => {
    const url = embedUrl("https://exemple.fr", "/Outdoor-GPX", "CODE", { stats: false, profile: true, height: 440 });
    expect(url).toBe("https://exemple.fr/Outdoor-GPX/integrer/#d=CODE&stats=0"); expect(readHash(new URL(url).hash)).toEqual({ code: "CODE", stats: false, profile: true });
    const html = embedHtml(url, 'Trail "des <Crêtes>"', 440);
    expect(html).toContain('width="100%"'); expect(html).toContain('height="440"'); expect(html).toContain("sandbox="); expect(html).toContain('loading="lazy"'); expect(html).not.toContain("<Crêtes>"); expect(html).toContain("&quot;des &lt;Crêtes&gt;&quot;");
    expect(shareUrl("https://exemple.fr", "", "CODE")).toBe("https://exemple.fr/partage/#d=CODE");
  });
});
