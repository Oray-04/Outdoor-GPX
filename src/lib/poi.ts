export type PoiKind = "water" | "peak" | "shelter" | "viewpoint";
export const POI_KINDS: Record<PoiKind, { label: string; color: string; query: string }> = {
  water: { label: "Points d'eau", color: "#3ba6c9", query: 'node["amenity"="drinking_water"]' },
  peak: { label: "Sommets", color: "#6b4f3a", query: 'node["natural"="peak"]["name"]' },
  shelter: { label: "Abris", color: "#1e7a58", query: 'node["amenity"="shelter"]' },
  viewpoint: { label: "Points de vue", color: "#f0612b", query: 'node["tourism"="viewpoint"]' },
};

export interface PoiFeature { type: "Feature"; properties: { kind: PoiKind; name: string; ele?: string }; geometry: { type: "Point"; coordinates: [number, number] } }

/** Requête Overpass (données OpenStreetMap, ODbL) sur la zone visible. */
export async function fetchPois(bbox: [number, number, number, number], kinds: PoiKind[], signal: AbortSignal): Promise<PoiFeature[]> {
  const [w, s, e, n] = bbox;
  const box = `(${s},${w},${n},${e})`;
  const q = `[out:json][timeout:15];(${kinds.map((k) => `${POI_KINDS[k].query}${box};`).join("")});out 300;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: q }), signal });
  if (!r.ok) throw new Error(`Overpass ${r.status}`);
  const j = (await r.json()) as { elements: { lat: number; lon: number; tags?: Record<string, string> }[] };
  return j.elements.map((el) => {
    const t = el.tags ?? {};
    const kind: PoiKind = t.natural === "peak" ? "peak" : t.amenity === "drinking_water" ? "water" : t.amenity === "shelter" ? "shelter" : "viewpoint";
    return { type: "Feature", properties: { kind, name: t.name ?? POI_KINDS[kind].label, ele: t.ele }, geometry: { type: "Point", coordinates: [el.lon, el.lat] } };
  });
}
