import { LEGAL } from "@/lib/legal";

export const dynamic = "force-static";

/** Description du site pour les agents IA (format llms.txt). */
export function GET() {
  const u = (p: string) => `${LEGAL.siteUrl}${p}`;
  const body = `# Crête

> Plateforme web gratuite, sans publicité ni mesure d'audience, pour créer, explorer et partager des parcours GPS de trail, course à pied, randonnée et vélo, préparer sa nutrition d'effort et organiser des événements sportifs (trails). Interface en français ; cartes IGN et OpenStreetMap ; données des utilisateurs gardées dans leur navigateur sauf compte facultatif.

Public : sportifs (traileurs, randonneurs, cyclistes) et organisateurs d'événements (associations, clubs, organisateurs bénévoles ou professionnels). Édité par un particulier, service non commercial.

## Pages principales

- [Explorer la carte](${u("/explorer/")}) : parcours, itinéraires de grande randonnée et points d'intérêt sur une carte.
- [Créer un parcours](${u("/creer/")}) : tracer un itinéraire qui suit les chemins, importer et modifier un GPX, extraire une section, profil altimétrique.
- [Générer une boucle](${u("/generer/")}) : propositions de boucles selon un départ, une distance et un dénivelé.
- [Événements](${u("/evenements/")}) : calendrier des événements publiés par des organisateurs.
- [Organisation Trail](${u("/organisateurs/")}) : préparer un trail étape par étape (courses, logistique, bénévoles, analyse cadastrale et réglementaire, documents, page publique).
- [Planificateur nutritionnel](${u("/nutrition/")}) : quoi manger et boire pendant une course, prise par prise.
- [Itinéraires de référence](${u("/itineraires/")}) : GR, grandes traversées et véloroutes issus d'OpenStreetMap.
- [Itinérance](${u("/itinerance/")}) : commerces, points d'eau et restaurants le long d'un tracé.

## Informations

- [Données et licences](${u("/licences/")}) : sources cartographiques et leurs licences.
- [Conditions d'utilisation](${u("/cgu/")})
- [Politique de confidentialité](${u("/confidentialite/")})
- [Mentions légales](${u("/mentions-legales/")})

## Notes pour les agents

- Distances, dénivelés, durées, météo et repères nutritionnels fournis par le site sont indicatifs.
- Les documents générés pour les organisateurs (règlement, dossier, analyse cadastrale) sont des aides à la préparation, pas des avis juridiques ni des autorisations.
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
