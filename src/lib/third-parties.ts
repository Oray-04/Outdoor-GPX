/**
 * Services externes appelés directement par le navigateur (liste alignée sur la politique de sécurité `csp.ts`).
 * Aucun ne dépose de cookie via le site ; chacun reçoit l'adresse IP du visiteur et la zone ou les points demandés.
 * Affichée dans la politique de confidentialité et la page cookies : à tenir à jour avec `csp.ts`.
 */
export interface ThirdParty { name: string; operator: string; use: string; country: string; outsideEU: string; domains: string[] }
export const THIRD_PARTIES: ThirdParty[] = [
  { name: "Géoplateforme IGN", operator: "Institut national de l'information géographique et forestière", use: "Fonds de carte, altitudes, cadastre, chemins, zonages protégés", country: "France", outsideEU: "Non", domains: ["data.geopf.fr"] },
  { name: "API Carto", operator: "IGN", use: "Parcelles cadastrales (analyse cadastrale)", country: "France", outsideEU: "Non", domains: ["apicarto.ign.fr"] },
  { name: "API Géo", operator: "État français (Etalab)", use: "Recherche de communes", country: "France", outsideEU: "Non", domains: ["geo.api.gouv.fr"] },
  { name: "OpenTopoMap", operator: "Projet OpenTopoMap", use: "Fond de carte topographique (au choix)", country: "Allemagne", outsideEU: "Non", domains: ["tile.opentopomap.org"] },
  { name: "Overpass API", operator: "FOSSGIS e.V., Private.coffee, Kumi Systems", use: "Commerces, points d'eau et itinéraires le long d'un parcours", country: "Allemagne, Autriche", outsideEU: "Non", domains: ["overpass-api.de", "overpass.private.coffee", "overpass.kumi.systems"] },
  { name: "Valhalla", operator: "FOSSGIS e.V.", use: "Calcul d'itinéraires sur les chemins", country: "Allemagne", outsideEU: "Non", domains: ["valhalla1.openstreetmap.de"] },
  { name: "Waymarked Trails", operator: "Projet Waymarked Trails", use: "Itinéraires de randonnée balisés (analyse cadastrale)", country: "Allemagne", outsideEU: "Non", domains: ["hiking.waymarkedtrails.org"] },
  { name: "OpenStreetMap (tuiles et Nominatim)", operator: "OpenStreetMap Foundation", use: "Fond de carte hors de France, recherche d'adresse", country: "Royaume-Uni", outsideEU: "Oui — pays reconnu adéquat par la Commission européenne", domains: ["tile.openstreetmap.org", "nominatim.openstreetmap.org"] },
  { name: "Thunderforest", operator: "Gravitystorm Ltd", use: "Fonds Outdoors / OpenCycleMap, uniquement si vous saisissez votre propre clé", country: "Royaume-Uni", outsideEU: "Oui — pays reconnu adéquat par la Commission européenne", domains: ["api.thunderforest.com", "tile.thunderforest.com"] },
  { name: "Open-Meteo", operator: "Open-Meteo", use: "Météo et vent le long du parcours, altitudes de secours", country: "Suisse", outsideEU: "Oui — pays reconnu adéquat par la Commission européenne", domains: ["api.open-meteo.com"] },
  { name: "Terrain Tiles (Amazon S3)", operator: "Amazon Web Services (données ouvertes)", use: "Relief de la vue 3D, uniquement quand vous l'activez", country: "États-Unis", outsideEU: "Oui — cadre UE–États-Unis de protection des données (Data Privacy Framework)", domains: ["s3.amazonaws.com"] },
];
