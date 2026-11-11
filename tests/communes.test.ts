import { describe, it, expect, vi, afterEach } from "vitest";
import { searchCommunes, communeSuggestions, matchRegions, isPostal, norm, CommuneServiceError, type Region } from "../src/lib/communes";
import { routeNear, filterRoutes, DEFAULT_FILTERS } from "../src/lib/route-model";
import { DEMO_VMS } from "./fixtures/synthetic";
import { POI_TYPES, normalizePois } from "../src/lib/types";
import { POI_GLYPHS, poiIconSvg, poiPinSvg } from "../src/lib/poi-icons";
import { filled } from "../src/components/ui/field";

afterEach(() => vi.unstubAllGlobals());
const raw = (nom: string, code: string, cps: string[], lng = 6, lat = 44) => ({ nom, code, codesPostaux: cps, centre: { type: "Point", coordinates: [lng, lat] }, departement: { code: "04", nom: "Alpes-de-Haute-Provence" }, region: { nom: "Provence-Alpes-Côte d'Azur" } });
const stub = (body: unknown, status = 200) => { const f = vi.fn(async () => new Response(JSON.stringify(body), { status })); vi.stubGlobal("fetch", f); return f; };

describe("communes (API Géo)", () => {
  it("code postal : requête exacte, toutes les communes, triées, jamais de choix automatique", async () => {
    const f = stub([raw("La Javie", "04097", ["04000", "04420"]), raw("Digne-les-Bains", "04070", ["04000"]), raw("Entrages", "04074", ["04000", "04270"])]);
    const r = await searchCommunes("04000");
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain("codePostal=04000"); expect(r.map((c) => c.nom)).toEqual(["Digne-les-Bains", "Entrages", "La Javie"]);
    const s = await communeSuggestions("04000", new AbortController().signal, true);
    expect(s![0].label).toBe("Tout le code postal 04000"); expect(s![0].communes).toHaveLength(3); expect(s).toHaveLength(4);
    expect((await communeSuggestions("04000", new AbortController().signal, false))!).toHaveLength(3); // sans option de groupe
  });
  it("code postal à une seule commune ; nom ; saisie incomplète", async () => {
    stub([raw("Manosque", "04112", ["04100"])]); const one = await communeSuggestions("04100", new AbortController().signal, true); expect(one).toHaveLength(1); expect(one![0].label).toBe("Manosque (04100)");
    const f = stub([raw("Digne-les-Bains", "04070", ["04000"])]); await searchCommunes("digne"); expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/nom=digne.*boost=population/);
    expect(await communeSuggestions("041", new AbortController().signal)).toBeNull(); expect(await searchCommunes("a")).toEqual([]); expect(await searchCommunes("0410")).toEqual([]);
  });
  it("erreurs de service : erreur typée", async () => {
    stub({}, 503); await expect(searchCommunes("digne")).rejects.toBeInstanceOf(CommuneServiceError);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); })); await expect(searchCommunes("digne")).rejects.toBeInstanceOf(CommuneServiceError);
  });
  it("régions : « provence » propose Provence-Alpes-Côte d'Azur (sans accent ni casse)", () => {
    const all: Region[] = [{ code: "93", nom: "Provence-Alpes-Côte d'Azur" }, { code: "84", nom: "Auvergne-Rhône-Alpes" }, { code: "53", nom: "Bretagne" }, { code: "27", nom: "Bourgogne-Franche-Comté" }];
    expect(matchRegions(all, "Provence")[0].nom).toBe("Provence-Alpes-Côte d'Azur"); expect(matchRegions(all, "cote d azur")).toHaveLength(1);
    expect(matchRegions(all, "bo").map((r) => r.nom)).toEqual(["Bourgogne-Franche-Comté"]); expect(matchRegions(all, "rhone")[0].nom).toBe("Auvergne-Rhône-Alpes"); expect(matchRegions(all, "zzz")).toEqual([]);
    expect(isPostal("04000")).toBe(true); expect(isPostal("0400")).toBe(false); expect(norm("Côte-d’Azur")).toBe("cote d azur");
  });
});

describe("filtre de la bibliothèque par zone", () => {
  const line = Array.from({ length: 50 }, (_, i) => [6.2 + i * 0.002, 44.09, 800] as [number, number, number]);
  it("parcours passant près de la commune ; rayon respecté ; plusieurs communes (code postal partagé)", () => {
    expect(routeNear(line, [[6.2495, 44.0954]], 5)).toBe(true);        // Digne : le tracé passe à ~1 km
    expect(routeNear(line, [[2.35, 48.85]], 50)).toBe(false);           // Paris : loin
    expect(routeNear(line, [[6.2495, 44.2]], 5)).toBe(false);           // 12 km au nord, rayon 5 km
    expect(routeNear(line, [[6.2495, 44.2]], 20)).toBe(true);           // mêmes 12 km, rayon 20 km
    expect(routeNear(line, [[2.35, 48.85], [6.3, 44.1]], 5)).toBe(true); // une seule des communes suffit
  });
  it("filterRoutes applique la zone sans modifier les autres filtres", () => {
    const some = DEMO_VMS[0]; const c = some.coords[0];
    const near = filterRoutes(DEMO_VMS, { ...DEFAULT_FILTERS, place: { label: "x", centers: [[c[0], c[1]]], radiusKm: 5 } }, []);
    expect(near.some((r) => r.id === some.id)).toBe(true); expect(near.length).toBeLessThanOrEqual(DEMO_VMS.length);
    expect(filterRoutes(DEMO_VMS, { ...DEFAULT_FILTERS, place: { label: "x", centers: [[-60, -30]], radiusKm: 20 } }, [])).toEqual([]);
    expect(filterRoutes(DEMO_VMS, DEFAULT_FILTERS, []).length).toBe(DEMO_VMS.length);
  });
});

describe("pictogrammes de POI", () => {
  it("7 catégories (plus de « Départ »), chacune avec un pictogramme distinct, une couleur distincte et une épingle", () => {
    const want = ["ravito", "eau", "controle", "vue", "danger", "secours", "parking"] as const;
    expect(Object.keys(POI_TYPES).sort()).toEqual([...want].sort()); expect("depart" in POI_TYPES).toBe(false);
    expect(new Set(want.map((t) => POI_GLYPHS[t].map((g) => g.d).join("|"))).size).toBe(7);
    expect(new Set(want.map((t) => POI_TYPES[t].color)).size).toBe(7);
    for (const t of want) { expect(poiIconSvg(t, 20)).toMatch(/^<svg[^>]+width="20"/); const pin = poiPinSvg(t); expect(pin).toContain(POI_TYPES[t].color); expect(pin).not.toMatch(/\d\.\d*0[ "a-zA-Z-]/); }
    expect(POI_TYPES.danger.label).toBe("Passage");
  });
  it("anciens POI « Départ » et types inconnus : convertis sans perte (données enregistrées préservées)", () => {
    const old = [{ id: "a", type: "depart", name: "Départ course", lng: 6, lat: 45 }, { id: "b", type: "eau", name: "Fontaine", lng: 6, lat: 45 }, { id: "c", type: "zzz", name: "?", lng: 6, lat: 45 }] as unknown as Parameters<typeof normalizePois>[0];
    const r = normalizePois(old); expect(r.map((p) => p.type)).toEqual(["parking", "eau", "vue"]); expect(r[0].name).toBe("Départ course"); expect(normalizePois(undefined)).toEqual([]);
  });
});

describe("champs obligatoires", () => {
  it("un champ rempli d'espaces n'est pas rempli", () => { expect(filled("  ")).toBe(false); expect(filled("")).toBe(false); expect(filled(undefined)).toBe(false); expect(filled(" a ")).toBe(true); });
});
