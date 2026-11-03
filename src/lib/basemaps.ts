import type { StyleSpecification } from "maplibre-gl";

export interface Basemap { id: string; label: string; tiles: string[]; maxzoom: number; attribution: string; note: string }

const wmts = (layer: string, format: "png" | "jpeg") =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&FORMAT=image/${format}&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

const IGN = "© IGN – Géoplateforme";

/** Fonds de carte. L'IGN couvre la France ; OpenStreetMap sert de repli hors France (usage développement). */
export const BASEMAPS: Basemap[] = [
  { id: "ign-plan", label: "Plan IGN", tiles: [wmts("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "png")], maxzoom: 18, attribution: IGN, note: "Plan de référence, sentiers et courbes de niveau. France." },
  { id: "ign-photo", label: "Photo aérienne", tiles: [wmts("ORTHOIMAGERY.ORTHOPHOTOS", "jpeg")], maxzoom: 18, attribution: IGN, note: "Orthophotographies. France." },
  { id: "topo", label: "Topographique (monde)", tiles: ["https://tile.opentopomap.org/{z}/{x}/{y}.png"], maxzoom: 17, attribution: "© contributeurs OpenStreetMap, SRTM · style © OpenTopoMap (CC-BY-SA)", note: "Courbes de niveau et relief ombré, monde entier. Serveur public : usage modéré." },
  { id: "etat-major", label: "État-major 1820-1866 (historique)", tiles: [wmts("GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40", "jpeg")], maxzoom: 15, attribution: IGN, note: "Carte ancienne, zoom limité. France." },
  { id: "osm", label: "Monde (OpenStreetMap)", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], maxzoom: 19, attribution: "© contributeurs OpenStreetMap (ODbL)", note: "Hors France. Tuiles publiques OSM : développement uniquement." },
];

export interface Overlay { id: string; label: string; tiles: string[]; minzoom?: number; maxzoom: number; attribution: string; opacity: number; note: string }
export const OVERLAYS: Overlay[] = [
  { id: "ign-cadastre", label: "Cadastre (parcelles)", tiles: [wmts("CADASTRALPARCELS.PARCELLAIRE_EXPRESS", "png")], minzoom: 12, maxzoom: 19, attribution: IGN, opacity: 0.95, note: "Limites de parcelles (Parcellaire Express IGN). Visible à partir d'un zoom assez fort. France." },
  { id: "ign-slopes", label: "Pentes de montagne", tiles: [wmts("GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN", "png")], maxzoom: 16, attribution: IGN, opacity: 0.6, note: "Zones de forte pente, par classes de couleur. Utile en montagne. France." },
];

export function buildStyle(): StyleSpecification {
  const raster = (s: { id: string; tiles: string[]; minzoom?: number; maxzoom: number; attribution: string }) => [s.id, { type: "raster" as const, tiles: s.tiles, tileSize: 256, minzoom: s.minzoom ?? 0, maxzoom: s.maxzoom, attribution: s.attribution }] as const;
  return {
    version: 8,
    sources: Object.fromEntries([...BASEMAPS, ...OVERLAYS].map(raster)),
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#dfe7e2" } },
      ...BASEMAPS.map((b, i) => ({ id: `base-${b.id}`, type: "raster" as const, source: b.id, layout: { visibility: (i === 0 ? "visible" : "none") as "visible" | "none" } })),
      ...OVERLAYS.map((o) => ({ id: `ovl-${o.id}`, type: "raster" as const, source: o.id, layout: { visibility: "none" as const }, paint: { "raster-opacity": o.opacity } })),
    ],
  };
}
