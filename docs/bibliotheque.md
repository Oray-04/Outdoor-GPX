# Bibliothèque d'itinéraires de référence

Page `/itineraires` : GR/GRP, grandes traversées, véloroutes, VTT, cols… avec carte, profil, GPX, ajout à « Mes parcours » et ouverture dans l'éditeur.

## Origine des données et licences

| Donnée | Source | Licence |
|---|---|---|
| Tracés | API OpenStreetMap (relations d'itinéraires, une par entrée de `scripts/library/routes.json`) | ODbL 1.0 — attribution « © contributeurs OpenStreetMap », bases dérivées sous la même licence |
| Altitudes | IGN Géoplateforme (RGE ALTI / modèle mondial) | Licence Ouverte Etalab 2.0 |

**Non retenu, volontairement** : les fichiers GPX officiels des fédérations (FFRandonnée, etc.), de EuroVelo ou de sites commerciaux (communautés de traces, plateformes d'activités). Leurs conditions n'autorisent pas la redistribution de leurs fichiers ni leur copie dans une base tierce. Les tracés d'OpenStreetMap sont des **tracés communautaires non officiels** : ils peuvent différer du balisage réel ; l'interface le rappelle.

La mention « GR® » est une marque de la FFRandonnée : elle n'est utilisée que pour nommer les itinéraires.

## Contenu de chaque entrée (`public/library/index.json`)

`id`, nom, catégorie, pratique, région, pays, départ/arrivée (`from`/`to`), distance, D+, D−, altitudes min/max, points de début/fin, emprise, nombre de points, **source** (relation OSM, licence, attribution, date), **empreinte** `hash` (anti-doublon) et **qualité** (trous d'assemblage, altitudes manquantes, longueur déclarée par la source). Le tracé complet est dans `public/library/routes/<id>.json` (chargé à la demande).

Les statistiques sont **recalculées à l'affichage** à partir du tracé stocké, avec les mêmes règles que le reste du site (D+ = cumul des montées > 3 m).

## Contrôles automatiques

- Construction (`build.mjs`) : relation introuvable ou géométrie trop courte → échec explicite ; trous entre tronçons (> 15 m) comptés et signalés (`quality.gaps`, `maxGapM`).
- Affichage : points invalides, sauts > 3 km, tracé trop court, trous d'assemblage > 2 km, altitudes manquantes, longueur très différente de la valeur déclarée → « points d'attention » visibles.
- Tests (`tests/library.test.ts`) : chaque fichier est valide et continu, ses statistiques correspondent à l'index, aucun doublon.
- Doublons : même nom normalisé, même relation OSM, même empreinte, ou mêmes extrémités et même longueur. L'ajout à « Mes parcours » est refusé si l'itinéraire y est déjà (même source).

## Ajouter des itinéraires

1. Trouver la relation OpenStreetMap de l'itinéraire (page OSM de la relation ou Waymarked Trails).
2. Ajouter une entrée dans `scripts/library/routes.json` : `slug`, `osm`, `category` (`randonnee`, `gr`, `route`, `vtt`, `gravel`, `traversee`, `montagne`, `europe`), `practice` (`randonnee`, `vtt`, `route`, `gravel`, `velo-route`), `name`, `region`, `country`.
3. `node scripts/library/build.mjs --only <slug>` (réseau requis ; l'API OSM est interrogée avec un agent identifié et des pauses — ne pas lancer en boucle).
4. `npm test` puis commit de `public/library/`.

## Limites connues

- L'assemblage des tronçons suit l'ordre des membres de la relation ; les itinéraires avec nombreuses variantes peuvent avoir de petits trous (indiqués) ou être plus courts que la longueur officielle.
- Les catégories « Gravel » et la plupart des circuits de cols ne sont pas représentés : OpenStreetMap n'en tient pas de relations fiables ; ils pourront être ajoutés depuis une source dont la licence le permet.
- Les itinéraires hors de France (portions EuroVelo) sont couverts par l'altimétrie mondiale de la Géoplateforme, moins précise qu'en France.
