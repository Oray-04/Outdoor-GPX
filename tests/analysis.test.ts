import { describe, it, expect, vi, afterEach } from "vitest";
import { resample, inGeometry, lengthInside, distToLine, windows, parcelRef, isGR, classify, summarize, fetchParcels, fetchTroncons, fetchZones, analyzeRoute, parcelsCsv, queryLine, sliceByDistance, type Ring, type Troncon } from "../src/lib/analysis";
import type { LL } from "../src/lib/types";
import { cumulative } from "../src/lib/geo";

afterEach(() => vi.unstubAllGlobals());
const sq = (x0: number, y0: number, x1: number, y1: number): Ring => ({ type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
// tracé vers l'est, ~1,1 km (0,014° de longitude à 45°N ≈ 1,1 km)
const line: LL[] = [[6.00, 45.0], [6.014, 45.0]];

describe("analyse du tracé : géométrie", () => {
  it("rééchantillonnage régulier jusqu'à l'arrivée", () => {
    const r = resample(line, 5); expect(r[0].d).toBe(0); expect(r.at(-1)!.d).toBeCloseTo(1100, -2); expect(r[1].d - r[0].d).toBe(5);
    expect(r.at(-1)!.p[0]).toBeCloseTo(6.014, 6);
  });
  it("point dans polygone, trou exclu, multipolygone", () => {
    expect(inGeometry([0.5, 0.5], sq(0, 0, 1, 1))).toBe(true); expect(inGeometry([1.5, 0.5], sq(0, 0, 1, 1))).toBe(false);
    const holed: Ring = { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };
    expect(inGeometry([2, 2], holed)).toBe(false); expect(inGeometry([0.5, 0.5], holed)).toBe(true);
    const multi: Ring = { type: "MultiPolygon", coordinates: [sq(0, 0, 1, 1).coordinates as number[][][], sq(5, 5, 6, 6).coordinates as number[][][]] };
    expect(inGeometry([5.5, 5.5], multi)).toBe(true); expect(inGeometry([3, 3], multi)).toBe(false);
  });
  it("longueur traversée par parcelle : 2 parcelles se partagent le tracé", () => {
    const s = resample(line, 5);
    const [a, b, c] = lengthInside(s, [sq(5.99, 44.99, 6.007, 45.01), sq(6.007, 44.99, 6.02, 45.01), sq(7, 44, 8, 45)], 5);
    expect(a + b).toBeGreaterThan(1090); expect(a + b).toBeLessThan(1115); expect(a).toBeGreaterThan(500); expect(a).toBeLessThan(600); expect(c).toBe(0);
  });
  it("distance point–ligne", () => {
    expect(distToLine([6.005, 45.0001], [[6.0, 45.0], [6.01, 45.0]])).toBeCloseTo(11.06, 0);
    expect(distToLine([6.0, 45.0], [[6.0, 45.0], [6.01, 45.0]])).toBeCloseTo(0, 5);
  });
  it("fenêtres chevauchantes d'un sommet", () => { const w = windows(Array.from({ length: 50 }, (_, i) => i), 22); expect(w.every((x) => x.length <= 22)).toBe(true); expect(w[0].at(-1)).toBe(w[1][0]); expect(w.at(-1)!.at(-1)).toBe(49); });
});

describe("références et itinéraires", () => {
  it("référence cadastrale lisible", () => {
    expect(parcelRef({ code_insee: "74056", section: "0G", numero: "4352", nom_com: "Chamonix-Mont-Blanc" })).toBe("74056 0G 4352");
    expect(parcelRef({ code_insee: "74056", com_abs: "012", section: "AB", numero: "0001", nom_com: "X" })).toBe("74056 (012) AB 0001");
  });
  it("détection des GR par le nom", () => {
    for (const ok of ["GR 5", "GR5 Tour du Lac", "Variante du GR®20", "GRP Tour du Pays", "Sentier de Grande Randonnée"]) expect(isGR(ok), ok).toBe(true);
    for (const no of ["Sentier du Signal", "Grand Balcon Nord", "Agrément", "PR 12 Boucle des Crêtes", ""]) expect(isGR(no), no).toBe(false);
  });
});

describe("classification des portions", () => {
  const t = (id: string, nature: string, prive: boolean | null, itineraire: string, y: number): Troncon => ({ id, nature, prive, accesPieton: null, itineraire, geometry: [[6.0, y], [6.007, y]] });
  it("découpe le tracé selon le chemin sous-jacent et signale le hors réseau", () => {
    const s = resample(line, 5);
    const p = classify(s, [t("a", "Sentier", false, "GR 5", 45.0), { ...t("b", "Chemin", true, "", 45.0), geometry: [[6.007, 45.0], [6.011, 45.0]] }]);
    expect(p.map((x) => x.nature)).toEqual(["Sentier", "Chemin", "Hors réseau recensé"]);
    expect(p[0]).toMatchObject({ prive: false, gr: true, matched: true }); expect(p[1]).toMatchObject({ prive: true, gr: false });
    expect(p[2]).toMatchObject({ matched: false, prive: null });
    expect(p[0].fromM).toBe(0); expect(p.at(-1)!.toM).toBeCloseTo(1100, -2);
  });
  it("bilan : privé / non signalé privé / inconnu et itinéraires", () => {
    const sm = summarize([
      { fromM: 0, toM: 3000, nature: "Sentier", prive: false, itineraire: "GR 5/Tour du Lac", gr: true, matched: true },
      { fromM: 3000, toM: 4000, nature: "Chemin", prive: true, itineraire: "", gr: false, matched: true },
      { fromM: 4000, toM: 4500, nature: "Hors réseau recensé", prive: null, itineraire: "", gr: false, matched: false },
      { fromM: 4500, toM: 5000, nature: "Route à 1 chaussée", prive: null, itineraire: "", gr: false, matched: true },
    ]);
    expect(sm.nonPriveKm).toBe(3); expect(sm.priveKm).toBe(1); expect(sm.inconnuKm).toBe(1); expect(sm.grKm).toBe(3);
    expect(sm.itineraires.find((i) => i.name === "GR 5")).toMatchObject({ km: 3, gr: true }); expect(sm.itineraires.find((i) => i.name === "Tour du Lac")!.gr).toBe(false);
    expect(sm.byNature[0]).toEqual({ nature: "Sentier", km: 3 });
  });
});

describe("accès aux services (simulés)", () => {
  const parcelFeat = (idu: string, num: string, g: Ring) => ({ properties: { idu, numero: num, section: "0G", code_insee: "74056", com_abs: "000", nom_com: "Chamonix-Mont-Blanc", contenance: 1200 }, geometry: g });
  it("parcelles : dédoublonnées entre fenêtres, longueur calculée, tri, adresse de l'API Carto", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); return new Response(JSON.stringify({ features: [parcelFeat("740560000G0002", "0002", sq(6.007, 44.99, 6.02, 45.01)), parcelFeat("740560000G0001", "0001", sq(5.99, 44.99, 6.007, 45.01))] }), { status: 200 }); }));
    const many: LL[] = Array.from({ length: 80 }, (_, i) => [6 + i * 0.00018, 45 + (i % 2) * 0.0003]); // plusieurs fenêtres
    const hits = await fetchParcels(many, resample(many, 5), 5);
    expect(urls.length).toBeGreaterThan(1); expect(urls[0]).toContain("apicarto.ign.fr/api/cadastre/parcelle?geom=");
    expect(hits).toHaveLength(2); expect(hits.map((h) => h.numero)).toEqual(["0001", "0002"]); // dédoublonnées et triées
    expect(hits[0].ref).toBe("74056 0G 0001"); expect(hits[0].lengthM + hits[1].lengthM).toBeGreaterThan(1300);
  });
  it("tronçons : filtre de proximité en SRID 4326 (lon lat), champs limités", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); return new Response(JSON.stringify({ features: [{ properties: { cleabs: "T1", nature: "Sentier", prive: false, acces_pieton: null, cpx_toponyme_itineraire_autre: "GR 5" }, geometry: { type: "LineString", coordinates: [[6, 45], [6.01, 45]] } }, { properties: { cleabs: "T2", nature: "Chemin", prive: null, acces_pieton: null, cpx_toponyme_itineraire_autre: null }, geometry: { type: "MultiLineString", coordinates: [[[6, 45.001], [6.01, 45.001]]] } }] }), { status: 200 }); }));
    const t = await fetchTroncons(line);
    const dec = decodeURIComponent(urls[0]);
    expect(dec).toContain("DWITHIN(geometrie,SRID=4326;LINESTRING(6.000000 45.000000"); expect(dec).toContain("PROPERTYNAME=geometrie,cleabs,nature"); expect(dec).toContain("15,meters");
    expect(t.map((x) => x.id)).toEqual(["T1", "T2"]); expect(t[0].itineraire).toBe("GR 5"); expect(t[1].itineraire).toBe(""); expect(t[1].prive).toBeNull();
  });
  it("zones : forêt publique et parc, longueur par zone, zones sans passage écartées", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const f = u.includes("foret_publique") ? [{ properties: { cleabs: "F1", toponyme: "Forêt Communale de Test", nature: "Autre forêt publique" }, geometry: sq(5.99, 44.99, 6.007, 45.01) }, { properties: { cleabs: "F2", toponyme: "Loin", nature: "" }, geometry: sq(9, 9, 10, 10) }]
        : [{ properties: { cleabs: "P1", toponyme: "Site Natura Test", nature: "Site Natura 2000" }, geometry: sq(5.99, 44.99, 6.02, 45.01) }];
      return new Response(JSON.stringify({ features: f }), { status: 200 });
    }));
    const z = await fetchZones(line, resample(line, 5), 5);
    expect(z.map((x) => `${x.kind}:${x.name}`)).toEqual(["parc:Site Natura Test", "foret:Forêt Communale de Test"]); // trié par longueur
    expect(z[0].lengthM).toBeGreaterThan(z[1].lengthM); expect(z.find((x) => x.name === "Loin")).toBeUndefined();
  });
  it("analyse complète + export CSV ; avertissement si hors couverture", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      if (u.includes("apicarto")) return new Response(JSON.stringify({ features: [] }), { status: 200 });
      if (u.includes("waymarkedtrails")) return new Response(JSON.stringify({ results: [{ ref: "GR 5", name: "Grande Traversée", group: "NAT" }] }), { status: 200 });
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    }));
    const a = await analyzeRoute(line);
    expect(a.warnings.join(" ")).toMatch(/Aucune parcelle/); expect(a.warnings.join(" ")).toMatch(/Aucun chemin recensé/);
    expect(a.waymarked[0]).toMatchObject({ ref: "GR 5", group: "NAT" }); expect(a.routeM).toBeCloseTo(1100, -2);
    expect(parcelsCsv({ ...a, parcels: [{ id: "x", ref: "74056 0G 4352", commune: 'Cha"mo', insee: "74056", section: "0G", numero: "4352", areaM2: 1009, lengthM: 87.4, geometry: sq(0, 0, 1, 1) }] })).toBe('Commune;Code INSEE;Section;Numéro;Référence;Surface parcelle (m²);Longueur du tracé (m)\r\n"Cha""mo";74056;0G;4352;"74056 0G 4352";1009;87');
  });
  it("une erreur du service est signalée, pas avalée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(fetchParcels(line, resample(line, 5), 5)).rejects.toThrow(/403/);
  });
});

describe("export cadastral : tracé complet, sans coupure (correctifs)", () => {
  const dense = (n: number): LL[] => Array.from({ length: n }, (_, i) => [6 + i * 0.00004, 45 + (i % 3 === 0 ? 0.6e-5 : -0.6e-5)] as LL); // ~3 m entre points, zigzag de ±0,7 m
  it("queryLine : extrémités conservées, jamais d'écart < 1 m, aucune simplification de forme", () => {
    const l = dense(600), q = queryLine(l);
    expect(q[0]).toEqual(l[0]); expect(q.at(-1)).toEqual(l.at(-1)); expect(q.length).toBeGreaterThan(500);
  });
  it("portions jointives : somme des longueurs = longueur du tracé (aucun trou aux frontières)", () => {
    const l = dense(600), s = resample(l, 5);
    const tr = (id: string, nature: string, x0: number, x1: number): Troncon => ({ id, nature, prive: false, accesPieton: null, itineraire: "", geometry: [[x0, 45], [x1, 45]] });
    const p = classify(s, [tr("a", "Sentier", 5.99, 6.006), tr("b", "Chemin", 6.0061, 6.015)]);
    expect(p.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < p.length; i++) expect(p[i].fromM).toBeCloseTo(p[i - 1].toM, 6);
    expect(p[0].fromM).toBe(0);
    expect(p.reduce((a, x) => a + x.toM - x.fromM, 0)).toBeCloseTo(s.at(-1)!.d, 6);
    expect(summarize(p).byNature.reduce((a, x) => a + x.km, 0) * 1000).toBeCloseTo(s.at(-1)!.d, 3);
  });
  it("sliceByDistance : les tranches recollées reconstituent exactement le tracé (même sur un tracé clairsemé)", () => {
    const l: LL[] = [[6, 45], [6.001, 45], [6.001, 45.001], [6.004, 45.001]]; const cum = cumulative(l); const total = cum.at(-1)!;
    const cuts = [0, 20, 95, 100, 260, total]; const parts = cuts.slice(0, -1).map((c, i) => sliceByDistance(l, cum, c, cuts[i + 1]));
    parts.forEach((pt) => expect(pt.length).toBeGreaterThanOrEqual(2)); // même une portion de 5 m (< écart entre sommets) est tracée
    for (let i = 1; i < parts.length; i++) expect(parts[i][0]).toEqual(parts[i - 1].at(-1)); // jointives
    const len = parts.reduce((a, pt) => a + cumulative(pt).at(-1)!, 0); expect(len).toBeCloseTo(total, 1);
  });
  it("tracé de plusieurs centaines de points sur 3 communes : toutes les parcelles traversées, même étroites, sont retrouvées", async () => {
    const route = dense(700); // 700 points ≈ 2,1 km
    // 21 bandes de parcelles de 1,2 m de large (étroites) réparties sur 3 communes, sur le tracé ; 21 autres loin du tracé
    const strip = (i: number, y0: number): { props: object; g: Ring; crossed: boolean } => {
      const x0 = 6 + i * 0.0012, commune = i < 7 ? ["Alpha", "74001"] : i < 14 ? ["Beta", "74002"] : ["Gamma", "74003"];
      return { props: { idu: `${commune[1]}000A${String(i).padStart(4, "0")}`, numero: String(i).padStart(4, "0"), section: "A", code_insee: commune[1], com_abs: "000", nom_com: commune[0], contenance: 40 }, g: sq(x0, y0, x0 + 0.0004, y0 + 1.2e-5), crossed: y0 < 45 + 1e-5 };
    };
    const all = Array.from({ length: 21 }, (_, i) => strip(i, 45 - 0.6e-5)).concat(Array.from({ length: 21 }, (_, i) => strip(i + 100, 45.01)));
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      const geom = JSON.parse(decodeURIComponent(u.split("geom=")[1].split("&")[0])) as { coordinates: LL[] };
      const hit = (g: Ring) => { for (let i = 1; i < geom.coordinates.length; i++) { const a = geom.coordinates[i - 1], b = geom.coordinates[i]; for (let k = 0; k <= 40; k++) if (inGeometry([a[0] + ((b[0] - a[0]) * k) / 40, a[1] + ((b[1] - a[1]) * k) / 40], g)) return true; } return false; };
      return new Response(JSON.stringify({ features: all.filter((x) => hit(x.g)).map((x) => ({ properties: x.props, geometry: x.g })) }), { status: 200 });
    }));
    const hits = await fetchParcels(route, resample(route, 5), 5);
    // référence indépendante : parcelles contenant un point du tracé d'origine (pas de 0,3 m)
    const truth = new Set(all.filter((x) => { for (let i = 1; i < route.length; i++) for (let k = 0; k < 10; k++) { const a = route[i - 1], b = route[i]; if (inGeometry([a[0] + ((b[0] - a[0]) * k) / 10, a[1] + ((b[1] - a[1]) * k) / 10], x.g)) return true; } return false; }).map((x) => (x.props as { idu: string }).idu));
    expect(truth.size).toBeGreaterThan(15);
    const got = new Set(hits.map((h) => h.id));
    expect([...truth].filter((id) => !got.has(id)), "parcelles manquantes").toEqual([]);
    expect(new Set(hits.map((h) => h.commune)).size).toBe(3);
  });
  it("API Carto en panne (404) : secours WFS Géoplateforme, mêmes parcelles, un seul essai raté", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(String(u)); if (String(u).includes("apicarto")) return new Response("<html>404</html>", { status: 404 });
      return new Response(JSON.stringify({ numberMatched: 1, features: [{ properties: { idu: "740560000G0001", numero: "0001", section: "0G", code_insee: "74056", com_abs: "000", nom_com: "Chamonix-Mont-Blanc", contenance: 900 }, geometry: sq(5.99, 44.99, 6.05, 45.01) }] }), { status: 200 }); }));
    const l = dense(200); const hits = await fetchParcels(l, resample(l, 5), 5);
    expect(hits).toHaveLength(1); expect(hits[0].ref).toBe("74056 0G 0001"); expect(hits[0].lengthM).toBeGreaterThan(100);
    expect(urls.filter((u) => u.includes("apicarto")).length).toBeLessThanOrEqual(3);   // au plus un essai par requête simultanée, puis on n'insiste plus
    const w = urls.find((u) => u.includes("wfs"))!; expect(w).toContain("CADASTRALPARCELS.PARCELLAIRE_EXPRESS%3Aparcelle"); expect(decodeURIComponent(w)).toContain("INTERSECTS(geom,SRID=4326;LINESTRING(");
  });
  it("résultat tronqué par le service : erreur explicite plutôt qu'un export silencieusement incomplet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [], totalFeatures: 1500 }), { status: 200 })));
    const l = dense(50); await expect(fetchParcels(l, resample(l, 5), 5)).rejects.toThrow(/tronqu/);
  });
});
