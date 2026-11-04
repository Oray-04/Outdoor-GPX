import { describe, it, expect } from "vitest";
import { BASEMAPS, OVERLAYS, applyLayers, buildStyle, tilesWithKey } from "../src/lib/basemaps";

/** Faux objet carte : mémorise sources, couches et visibilités. */
function fakeMap() {
  const sources = new Map<string, unknown>(), layers = new Map<string, { visibility: string }>(), order: string[] = [];
  for (const [id] of Object.entries(buildStyle().sources)) sources.set(id, 1);
  for (const l of buildStyle().layers) { layers.set(l.id, { visibility: (l as { layout?: { visibility?: string } }).layout?.visibility ?? "visible" }); order.push(l.id); }
  return {
    sources, layers, order,
    getLayer: (id: string) => layers.get(id), getSource: (id: string) => sources.get(id),
    removeSource: (id: string) => sources.delete(id), removeLayer: (id: string) => { layers.delete(id); },
    addSource: (id: string, spec: unknown) => sources.set(id, spec),
    addLayer: (l: { id: string }, before?: string) => { layers.set(l.id, { visibility: "none" }); order.splice(before ? order.indexOf(before) : order.length, 0, l.id); },
    setLayoutProperty: (id: string, _k: string, v: string) => { layers.get(id)!.visibility = v; },
  };
}

describe("fonds de carte", () => {
  it("l'état-major et le calque FKT ne sont plus proposés", () => { expect(BASEMAPS.some((b) => /etat|major/i.test(b.id))).toBe(false); });
  it("fonds Thunderforest retenus : outdoors, cycle, landscape", () => { expect(BASEMAPS.filter((b) => b.keyed).map((b) => b.id)).toEqual(["tf-outdoors", "tf-cycle", "tf-landscape"]); });
  it("la clé est ajoutée à l'adresse (et encodée)", () => {
    const b = BASEMAPS.find((x) => x.id === "tf-outdoors")!;
    expect(tilesWithKey(b, "ab c&d")).toBe("https://api.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=ab%20c%26d");
    expect(tilesWithKey(BASEMAPS[0], "x")).not.toContain("apikey");
  });
  it("sans clé, un fond Thunderforest se replie sur le plan IGN", () => {
    const m = fakeMap();
    expect(applyLayers(m as never, "tf-cycle", [], {})).toBe("ign-plan");
    expect(m.layers.get("base-ign-plan")!.visibility).toBe("visible");
    expect(m.layers.has("base-tf-cycle")).toBe(false);
  });
  it("avec clé, la couche est créée sous les surcouches et seule elle est visible", () => {
    const m = fakeMap();
    expect(applyLayers(m as never, "tf-cycle", ["ign-cadastre"], { thunderforest: "K" })).toBe("tf-cycle");
    expect((m.sources.get("tf-cycle") as { tiles: string[] }).tiles[0]).toContain("apikey=K");
    expect(m.order.indexOf("base-tf-cycle")).toBeLessThan(m.order.indexOf(`ovl-${OVERLAYS[0].id}`));
    expect(m.layers.get("base-ign-plan")!.visibility).toBe("none");
    expect(m.layers.get("ovl-ign-cadastre")!.visibility).toBe("visible");
    expect(m.layers.get("ovl-ign-slopes")!.visibility).toBe("none");
  });
});
