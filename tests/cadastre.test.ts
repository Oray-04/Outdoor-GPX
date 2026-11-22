import { describe, it, expect } from "vitest";
import { synthesize, routeCsv, synthesisCsv, routeSig, toStored, crossedParcels, touchedParcels, communesOf, type StoredAnalysis } from "../src/lib/cadastre";
import type { Analysis, ParcelHit, ZoneHit } from "../src/lib/analysis";

const sq = { type: "Polygon" as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const P = (id: string, commune: string, insee: string, num: string, lengthM: number, extra: Partial<ParcelHit> = {}): ParcelHit => ({ id, ref: `${insee} A ${num}`, commune, insee, section: "A", numero: num, areaM2: 1000, lengthM, geometry: sq, fromM: 0, passages: 1, zoneIds: [], ...extra });
const Z = (id: string, kind: ZoneHit["kind"], name: string, lengthM: number): ZoneHit => ({ id, kind, name, nature: "", lengthM, geometry: sq });
const A = (parcels: ParcelHit[], zones: ZoneHit[] = [], routeM = 10000): Analysis => ({ routeM, parcels, zones, portions: [], summary: { byNature: [], priveKm: 0, nonPriveKm: 0, inconnuKm: 0, itineraires: [], grKm: 0 }, waymarked: [], warnings: [], at: 1, nonCadastralM: routeM - parcels.reduce((t, p) => t + p.lengthM, 0) });

describe("synthèse cadastrale de l'événement", () => {
  const n2000 = Z("n2000-habitats:FR1", "n2000-habitats", "Massif test", 800);
  const r10 = toStored("R10", "Boucle 10", "s", A([P("X1", "Alpha", "01001", "0001", 1200, { zoneIds: [n2000.id] }), P("X2", "Alpha", "01001", "0002", 300), P("T1", "Beta", "01002", "0009", 0.2)], [n2000]));
  const r20 = toStored("R20", "Grand 20", "s", A([P("X1", "Alpha", "01001", "0001", 1500, { zoneIds: [n2000.id] }), P("X3", "Beta", "01002", "0003", 2000)], [{ ...n2000, lengthM: 900 }], 20000));
  const s = synthesize([{ routeId: "R10", label: "10 km", a: r10 }, { routeId: "R20", label: "20 km", a: r20 }, { routeId: "R40", label: "40 km", a: null }]);
  it("chaque parcelle une seule fois, parcours concernés, distance cumulée", () => {
    expect(s.parcels.map((p) => p.id)).toEqual(["X1", "X2", "X3"]); // contact ponctuel T1 écarté, X1 non dupliquée
    const x1 = s.parcels[0]; expect(x1.byRoute.map((b) => `${b.label}:${b.lengthM}`)).toEqual(["10 km:1200", "20 km:1500"]); expect(x1.totalM).toBe(2700);
    expect(x1.byRoute.map((b) => b.fromM)).toEqual([0, 0]); // kilomètre d'entrée conservé pour chaque parcours (PDF de synthèse)
    expect(s.totals).toMatchObject({ parcels: 3, shared: 1, communes: 2, cumulM: 5000 });
    expect(s.missing).toEqual([{ routeId: "R40", label: "40 km" }]);
  });
  it("communes : parcelles, parcelles communes, distance cumulée, parcours dans l'ordre de l'événement", () => {
    expect(s.communes).toEqual([{ insee: "01001", name: "Alpha", parcels: 2, sharedParcels: 1, totalM: 3000, routes: ["10 km", "20 km"] }, { insee: "01002", name: "Beta", parcels: 1, sharedParcels: 0, totalM: 2000, routes: ["20 km"] }]);
  });
  it("zonages fusionnés avec la distance de chaque parcours", () => {
    expect(s.zones).toHaveLength(1); expect(s.zones[0].byRoute.map((b) => b.lengthM)).toEqual([800, 900]); expect(s.zones[0].totalM).toBe(1700);
  });
  it("un même tracé fourni deux fois n'est compté qu'une fois", () => {
    const d = synthesize([{ routeId: "R10", label: "10 km", a: r10 }, { routeId: "R10", label: "10 km", a: r10 }]);
    expect(d.parcels[0].totalM).toBe(1200); expect(d.totals.routesM).toBe(10000);
  });
  it("CSV de synthèse : une ligne par parcelle, colonnes par parcours, communes marquées", () => {
    const lines = synthesisCsv(s).replace("﻿", "").trim().split("\r\n");
    expect(lines).toHaveLength(4); expect(lines[0]).toContain("Distance cumulée (km);10 km (km);20 km (km)");
    expect(lines[1]).toContain("10 km + 20 km;2;Oui;2,700;1,200;1,500"); expect(lines[1]).toContain("Natura 2000 — directive Habitats (SIC/ZSC) : Massif test");
    expect(lines[3]).toContain(";20 km;1;Non;2,000;;2,000");
  });
});

describe("analyse d'un parcours : export et stockage", () => {
  const a = toStored("R", "Boucle", "sig", A([P("B", "Beta", "02", "0002", 500, { fromM: 3000 }), P("A", "Alpha", "01", "0001", 250, { fromM: 100, passages: 2 }), P("C", "Gamma", "03", "0003", 0)]));
  it("contours retirés, ordre de passage, parcelles en limite à part", () => {
    expect(JSON.stringify(a)).not.toContain("coordinates");
    expect(crossedParcels(a).map((p) => p.id)).toEqual(["A", "B"]); expect(touchedParcels(a).map((p) => p.id)).toEqual(["C"]);
    expect(communesOf(a).map((c) => c.name)).toEqual(["Alpha", "Beta"]); expect(a.nonCadastralM).toBe(9250);
  });
  it("CSV détaillé : N°, référence, distance en km, entrée, passages ; Excel français", () => {
    const csv = routeCsv(a as StoredAnalysis);
    expect(csv.startsWith("﻿N°;Commune;Code INSEE")).toBe(true);
    const l = csv.trim().split("\r\n"); expect(l[1]).toBe("1;Alpha;01;;A;;0001;01 A 0001;A;1000;0,250;0,10;2;;"); expect(l[3]).toMatch(/^contact;Gamma/);
  });
  it("empreinte du tracé : change si le parcours change", () => {
    const c = [[6, 45], [6.01, 45]]; expect(routeSig(c)).toBe(routeSig(c.map((x) => [...x]))); expect(routeSig(c)).not.toBe(routeSig([[6, 45], [6.02, 45]]));
  });
});
