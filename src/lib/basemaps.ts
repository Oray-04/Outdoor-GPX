import type { StyleSpecification } from "maplibre-gl";

export interface Basemap { id: string; label: string; tiles: string[]; maxzoom: number; attribution: string; note: string }

/** Fonds compatibles avec leurs licences d'usage (attribution obligatoire, usage production à contractualiser). */
export const BASEMAPS: Basemap[] = [
  { id: "osm", label: "Plan", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], maxzoom: 19, attribution: "© contributeurs OpenStreetMap (ODbL)", note: "Tuiles publiques OSM : développement uniquement." },
  { id: "topo", label: "Relief", tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"], maxzoom: 17, attribution: "© contributeurs OpenStreetMap, SRTM · style © OpenTopoMap (CC-BY-SA)", note: "Courbes de niveau et relief. Usage production à contractualiser." },
];

export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    sources: Object.fromEntries(BASEMAPS.map((b) => [b.id, { type: "raster" as const, tiles: b.tiles, tileSize: 256, maxzoom: b.maxzoom, attribution: b.attribution }])),
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#dfe7e2" } },
      ...BASEMAPS.map((b, i) => ({ id: `base-${b.id}`, type: "raster" as const, source: b.id, layout: { visibility: (i === 0 ? "visible" : "none") as "visible" | "none" } })),
    ],
  };
}
