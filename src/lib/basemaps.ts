import type { Map as MLMap, StyleSpecification } from "maplibre-gl";

export type BasemapGroup = "ign" | "world" | "outdoor";
export interface Basemap {
  id: string; label: string; group: BasemapGroup;
  /** Modèle d'adresse de tuiles (la clé est ajoutée à l'exécution pour les fonds à clé). */
  tiles: string; maxzoom: number; attribution: string; note: string;
  keyed?: "thunderforest";
}

const wmts = (layer: string, format: "png" | "jpeg") =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&FORMAT=image/${format}&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

const IGN = "© IGN – Géoplateforme";
const TF_ATTR = "Maps © Thunderforest, Data © contributeurs OpenStreetMap";
const tf = (style: string) => `https://api.thunderforest.com/${style}/{z}/{x}/{y}.png`;

export const GROUP_LABEL: Record<BasemapGroup, string> = { ign: "France (IGN)", world: "Monde", outdoor: "Outdoor (Thunderforest)" };

export const BASEMAPS: Basemap[] = [
  { id: "ign-plan", label: "Plan IGN", group: "ign", tiles: wmts("GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", "png"), maxzoom: 18, attribution: IGN, note: "Plan de référence, sentiers et courbes de niveau." },
  { id: "ign-photo", label: "Photo aérienne", group: "ign", tiles: wmts("ORTHOIMAGERY.ORTHOPHOTOS", "jpeg"), maxzoom: 18, attribution: IGN, note: "Orthophotographies." },
  { id: "topo", label: "Topographique", group: "world", tiles: "https://tile.opentopomap.org/{z}/{x}/{y}.png", maxzoom: 17, attribution: "© contributeurs OpenStreetMap, SRTM · style © OpenTopoMap (CC-BY-SA)", note: "Courbes de niveau et relief ombré." },
  { id: "osm", label: "OpenStreetMap", group: "world", tiles: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxzoom: 19, attribution: "© contributeurs OpenStreetMap (ODbL)", note: "Tuiles publiques OSM : usage modéré." },
  { id: "tf-outdoors", label: "Outdoors", group: "outdoor", tiles: tf("outdoors"), maxzoom: 22, attribution: TF_ATTR, note: "Randonnée, trail, ski : sentiers, courbes de niveau, refuges.", keyed: "thunderforest" },
  { id: "tf-cycle", label: "OpenCycleMap", group: "outdoor", tiles: tf("cycle"), maxzoom: 22, attribution: TF_ATTR, note: "Itinéraires cyclables et VTT, relief.", keyed: "thunderforest" },
  { id: "tf-landscape", label: "Landscape", group: "outdoor", tiles: tf("landscape"), maxzoom: 22, attribution: TF_ATTR, note: "Relief et occupation du sol (forêts, prairies, roches).", keyed: "thunderforest" },
];
export const DEFAULT_BASEMAP = "ign-plan";

export interface Overlay { id: string; label: string; tiles: string; minzoom?: number; maxzoom: number; attribution: string; opacity: number; note: string }
export const OVERLAYS: Overlay[] = [
  { id: "ign-cadastre", label: "Cadastre (parcelles)", tiles: wmts("CADASTRALPARCELS.PARCELLAIRE_EXPRESS", "png"), minzoom: 12, maxzoom: 19, attribution: IGN, opacity: 0.95, note: "Limites de parcelles (visible à fort zoom)." },
  { id: "ign-slopes", label: "Pentes de montagne", tiles: wmts("GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN", "png"), maxzoom: 16, attribution: IGN, opacity: 0.6, note: "Zones de forte pente." },
];

export const tilesWithKey = (b: Basemap, key?: string) => (b.keyed ? `${b.tiles}?apikey=${encodeURIComponent(key ?? "")}` : b.tiles);

const rasterSource = (tiles: string, maxzoom: number, attribution: string, minzoom = 0) => ({ type: "raster" as const, tiles: [tiles], tileSize: 256, minzoom, maxzoom, attribution });

/** Style initial : fonds sans clé et surcouches. Les fonds à clé sont ajoutés à la demande (`applyLayers`). */
export function buildStyle(): StyleSpecification {
  const free = BASEMAPS.filter((b) => !b.keyed);
  return {
    version: 8,
    sources: {
      ...Object.fromEntries(free.map((b) => [b.id, rasterSource(b.tiles, b.maxzoom, b.attribution)])),
      ...Object.fromEntries(OVERLAYS.map((o) => [o.id, rasterSource(o.tiles, o.maxzoom, o.attribution, o.minzoom)])),
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#dfe7e2" } },
      ...free.map((b, i) => ({ id: `base-${b.id}`, type: "raster" as const, source: b.id, layout: { visibility: (i === 0 ? "visible" : "none") as "visible" | "none" } })),
      ...OVERLAYS.map((o) => ({ id: `ovl-${o.id}`, type: "raster" as const, source: o.id, layout: { visibility: "none" as const }, paint: { "raster-opacity": o.opacity } })),
    ],
  };
}

/**
 * Applique le fond et les surcouches choisis. Un fond à clé sans clé n'est pas affiché (repli sur le fond par défaut).
 * Renvoie l'identifiant du fond réellement affiché.
 */
export function applyLayers(map: MLMap, baseId: string, overlays: string[], keys: { thunderforest?: string }): string {
  let b = BASEMAPS.find((x) => x.id === baseId) ?? BASEMAPS[0];
  if (b.keyed && !keys[b.keyed]) b = BASEMAPS.find((x) => x.id === DEFAULT_BASEMAP)!;
  if (!map.getLayer(`base-${b.id}`)) {
    if (map.getSource(b.id)) map.removeSource(b.id);
    map.addSource(b.id, rasterSource(tilesWithKey(b, keys[b.keyed!]), b.maxzoom, b.attribution));
    map.addLayer({ id: `base-${b.id}`, type: "raster", source: b.id, layout: { visibility: "none" } }, `ovl-${OVERLAYS[0].id}`);
  }
  for (const x of BASEMAPS) if (map.getLayer(`base-${x.id}`)) map.setLayoutProperty(`base-${x.id}`, "visibility", x.id === b.id ? "visible" : "none");
  for (const o of OVERLAYS) if (map.getLayer(`ovl-${o.id}`)) map.setLayoutProperty(`ovl-${o.id}`, "visibility", overlays.includes(o.id) ? "visible" : "none");
  return b.id;
}

/** Si la clé change, on retire le fond à clé pour le recréer avec la nouvelle clé. */
export function dropKeyedLayers(map: MLMap) {
  for (const b of BASEMAPS.filter((x) => x.keyed)) {
    if (map.getLayer(`base-${b.id}`)) map.removeLayer(`base-${b.id}`);
    if (map.getSource(b.id)) map.removeSource(b.id);
  }
}
