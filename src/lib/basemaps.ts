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

export interface Overlay {
  id: string; label: string; tiles: string; minzoom?: number; maxzoom: number; attribution: string; opacity: number; note: string;
  /** Couche environnementale interrogeable (WMS de la Géoplateforme, données INPN/Patrinat) : nom de couche et libellé du type de protection. */
  env?: { layer: string; kind: string; regulated: boolean };
}
const PATRINAT = "© INPN / PatriNat (OFB, MNHN) – Géoplateforme, Licence Ouverte";
const wmsEnv = (layer: string) => `https://data.geopf.fr/wms-v/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${layer}&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true`;
const env = (id: string, label: string, layer: string, kind: string, regulated: boolean, note: string): Overlay => ({ id, label, tiles: wmsEnv(layer), minzoom: 5, maxzoom: 17, attribution: PATRINAT, opacity: 0.55, note, env: { layer, kind, regulated } });
export const OVERLAYS: Overlay[] = [
  { id: "ign-cadastre", label: "Cadastre (parcelles)", tiles: wmts("CADASTRALPARCELS.PARCELLAIRE_EXPRESS", "png"), minzoom: 12, maxzoom: 19, attribution: IGN, opacity: 0.95, note: "Limites de parcelles (visible à fort zoom)." },
  { id: "ign-slopes", label: "Pentes de montagne", tiles: wmts("GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN", "png"), maxzoom: 16, attribution: IGN, opacity: 0.6, note: "Zones de forte pente." },
  env("env-n2000-oiseaux", "Natura 2000 – oiseaux (ZPS)", "Patrinat_ZPS_France", "Site Natura 2000 – Zone de protection spéciale (directive Oiseaux)", false, "Zones de protection des oiseaux. Information environnementale : pas une interdiction de passage en soi."),
  env("env-n2000-habitats", "Natura 2000 – habitats (SIC/ZSC)", "Patrinat_SIC_France", "Site Natura 2000 – directive Habitats, faune, flore", false, "Protection des habitats et des espèces. Information environnementale."),
  env("env-pn", "Parcs nationaux", "Patrinat_PN_France", "Parc national", true, "Cœur et aire d'adhésion : une réglementation propre s'applique dans le cœur (voir la fiche officielle)."),
  env("env-pnr", "Parcs naturels régionaux", "Patrinat_PNR_France", "Parc naturel régional", false, "Territoire de projet, sans réglementation d'accès générale."),
  env("env-rnn", "Réserves naturelles nationales", "Patrinat_RNN_France", "Réserve naturelle nationale", true, "Réglementation propre à chaque réserve (voir la fiche officielle)."),
  env("env-rnr", "Réserves naturelles régionales", "Patrinat_RNR_France", "Réserve naturelle régionale", true, "Réglementation propre à chaque réserve (voir la fiche officielle)."),
  env("env-apb", "Arrêtés de protection de biotope", "Patrinat_APB_France", "Arrêté de protection de biotope", true, "Mesures de protection fixées par arrêté préfectoral."),
  env("env-rb", "Réserves biologiques (forêts)", "Patrinat_RB_France", "Réserve biologique", true, "Réserves en forêt publique ; accès parfois limité (réserves intégrales)."),
  env("env-znieff1", "ZNIEFF de type 1 (inventaire)", "Patrinat_ZNIEFF1_France", "ZNIEFF de type 1 (inventaire scientifique)", false, "Inventaire scientifique sans portée réglementaire directe."),
];
export const ENV_OVERLAYS = OVERLAYS.filter((o) => o.env);

/** Légende d'une surcouche : pastilles de couleur expliquées, ou vignette fournie par le serveur (couleur exacte du rendu). */
export interface LegendEntry { overlayId: string; title: string; items: { color?: string; line?: boolean; img?: string; label: string }[]; note?: string }
/** Couleurs de la carte des pentes : légende officielle de l'IGN (GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN). */
const SLOPES = [["#f5e400", "30° à 35°"], ["#f58220", "35° à 40°"], ["#e6005a", "40° à 45°"], ["#c98ac0", "plus de 45°"]];
export function legendFor(overlayIds: string[]): LegendEntry[] {
  return OVERLAYS.filter((o) => overlayIds.includes(o.id)).map((o) => {
    if (o.id === "ign-slopes") return { overlayId: o.id, title: o.label, items: SLOPES.map(([color, label]) => ({ color, label: `Pente de ${label}` })), note: "Sans couleur : pente inférieure à 30°. Au-delà de 30°, terrain raide (risque d'avalanche en hiver)." };
    if (o.id === "ign-cadastre") return { overlayId: o.id, title: o.label, items: [{ color: "#f5a01e", line: true, label: "Limite de parcelle (numéro au centre)" }], note: "Visible à partir du zoom 12." };
    return { overlayId: o.id, title: o.label, items: [{ img: `https://data.geopf.fr/wms-v/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&FORMAT=image/png&LAYER=${o.env!.layer}&STYLE=`, label: o.env!.kind }], note: o.note };
  });
}

export interface EnvZone { overlayId: string; kind: string; regulated: boolean; name: string; zone: string; areaHa: number | null; created: string; manager: string; url: string }
/** Zones protégées en un point, pour les couches données (GetFeatureInfo). Une seule requête par couche active. */
export async function envZonesAt(lng: number, lat: number, overlayIds: string[], signal?: AbortSignal): Promise<EnvZone[]> {
  const x = (lng * 20037508.34) / 180, y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * 20037508.34 / 180, h = 60;
  const out: EnvZone[] = [];
  for (const o of ENV_OVERLAYS.filter((v) => overlayIds.includes(v.id))) {
    const u = `https://data.geopf.fr/wms-v/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${o.env!.layer}&QUERY_LAYERS=${o.env!.layer}&STYLES=&CRS=EPSG:3857&BBOX=${x - h},${y - h},${x + h},${y + h}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=5`;
    const r = await fetch(u, { signal }); if (!r.ok) throw new Error(`Couche « ${o.label} » indisponible (${r.status})`);
    const j = (await r.json()) as { features?: { properties: Record<string, string | number | null> }[] };
    for (const f of j.features ?? []) { const p = f.properties; const a = Number(p.surf_off ?? p.area_sig);
      out.push({ overlayId: o.id, kind: o.env!.kind, regulated: o.env!.regulated, name: String(p.nom_site ?? "(sans nom)"), zone: String(p.zone ?? ""), areaHa: Number.isFinite(a) && a > 0 ? a : null, created: String(p.date_crea ?? "").slice(0, 4), manager: String(p.gest_site ?? p.operateur ?? ""), url: /^https:\/\/inpn\.mnhn\.fr\//.test(String(p.url_fiche ?? "")) ? String(p.url_fiche) : "" }); }
  }
  return out.filter((z, i, a) => a.findIndex((q) => q.overlayId === z.overlayId && q.name === z.name && q.zone === z.zone) === i);
}

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
