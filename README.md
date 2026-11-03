# Crête — plateforme outdoor

Plateforme web pour le trail, la course, la randonnée, le vélo et les organisateurs d'événements.
Stack cible : Next.js · Tailwind CSS · MapLibre GL · Supabase (PostgreSQL + PostGIS).

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
npm run typecheck
```

## Livraison par étapes

| # | Étape | Statut |
|---|-------|--------|
| 1 | Identité visuelle et interface | **Livrée** |
| 2 | Authentification et base de données | Reportée |
| 3 | Cartographie interactive | **Livrée** |
| 4 | Éditeur de parcours GPS | À venir |
| 5 | Import / export GPS | À venir |
| 6 | Fiches parcours et profils altimétriques | À venir |
| 7 | Événements et espace organisateurs | À venir |
| 8 | Communauté et abonnements | À venir |
| 9 | Administration | À venir |
| 10 | Tests, sécurité, performance, production | À venir |

## Étape 1 — contenu

- **Charte** (`/charte`) : jetons de couleurs, typographies (Sora, Inter), boutons, badges, cartes. Définis dans `src/app/globals.css`.
- **Page d'accueil** (`/`) : header responsive, recherche géographique, hero avec carte MapLibre, disciplines, parcours à la une, recommandations par position, fonctionnalités, compétitions, destinations, statistiques, offres, footer.
- `/tarifs`, `/feuille-de-route`, `/licences` : pages de contenu.
- Modules des étapes 2 à 9 (`/explorer`, `/creer`, `/parcours`, `/evenements`, `/organisateurs`, `/communaute`, `/connexion`, `/compte`, `/admin`) : pages explicitement marquées « en développement », sans fonctionnalité simulée. Source : `src/lib/site.ts`.

### Ce qui fonctionne réellement
- Recherche de lieux (géocodage Nominatim, sur envoi du formulaire) qui déplace la carte.
- Géolocalisation (« Autour de moi », « Utiliser ma position ») sur action explicite ; la position reste dans le navigateur. Elle classe les parcours de démo par distance.
- Carte interactive avec tracés de démo cliquables.
- Statistiques (distance, D+, durée, difficulté) calculées depuis les coordonnées (`src/lib/geo.ts`, `src/lib/sports.ts`).
- Menu mobile, navigation clavier, lien d'accès au contenu, `prefers-reduced-motion`.

### Données de démonstration
`src/lib/demo-data.ts` génère des tracés **synthétiques** autour de régions réelles. Ils ne sont pas des sentiers, parcours officiels ou événements réels et sont badgés « Démo » dans l'interface. Ils seront remplacés par la base de données à l'étape 2.

### Licences et limites connues
- Le fond OpenStreetMap utilise les tuiles publiques, **non autorisées en production** : un fournisseur sous contrat sera configuré aux étapes 3 et 10. Détails dans `/licences`.
- Le worker MapLibre est copié dans `public/maplibre/` par `scripts/copy-maplibre-worker.mjs` (postinstall/dev/build).

## Étape 3 — explorateur cartographique (`/explorer`)

- Carte plein écran : zoom, déplacement, échelle, fonds **Plan** et **Relief** (basculables). Satellite : en attente d'un fournisseur sous licence.
- Recherche d'adresses et de lieux (Nominatim) avec cadrage sur la zone trouvée ; géolocalisation sur clic.
- Traces des parcours (démo), clic pour sélectionner, **comparaison de 1 à 3 parcours** (tableau + profils), marqueurs de départ/arrivée (D, A, D/A pour une boucle), masquage individuel d'une trace.
- Filtres : discipline, distance max, « seulement dans la zone visible ».
- Points d'intérêt **réels** (points d'eau, sommets, abris, points de vue) via Overpass/OpenStreetMap, chargés sous zoom 11+.
- `/explorer?lng=..&lat=..` centre la carte (utilisé par les destinations de l'accueil).
- Non fait : affichage de reliefs 3D (nécessite un fournisseur de modèle d'élévation) ; sentiers/routes sont ceux du fond de carte.
- Les tuiles publiques OSM/OpenTopoMap restent réservées au développement.
