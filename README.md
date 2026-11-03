# Crête — plateforme outdoor

Plateforme web pour le trail, la course, la randonnée, le vélo et les organisateurs d'événements.
Next.js 16 · Tailwind CSS 4 · MapLibre GL · cartes et services de la Géoplateforme (IGN).

## Démarrer

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
npm test             # tests unitaires (vitest)
npm run typecheck
```

Aucune clé ni variable d'environnement n'est nécessaire.

## Où sont les données ?

L'étape 2 (comptes + base de données) est **reportée**. En attendant, tout est enregistré **dans le navigateur** (localStorage) derrière une couche unique (`src/lib/store.ts`, `src/lib/repo.ts`) : l'application est utilisable seule, et la base de données pourra remplacer cette couche sans réécrire les écrans.

Conséquences à connaître :
- les données sont propres à un appareil et un navigateur ; les vider efface tout → **Administration > Données** permet d'exporter/restaurer une sauvegarde JSON ;
- pas de partage entre utilisateurs, pas de profils publics, pas de rôles réellement appliqués ;
- le stockage local est limité (~5 Mo) : les très gros fichiers ou beaucoup de photos peuvent le saturer (message d'erreur explicite).

Les paiements et abonnements sont volontairement hors périmètre ; `/tarifs` décrit seulement les trois niveaux.

## Fonctionnalités par étape

| # | Étape | Statut |
|---|-------|--------|
| 1 | Identité visuelle, design system, accueil | Livrée |
| 2 | Comptes et base de données | **Reportée** |
| 3 | Cartographie (`/explorer`) | Livrée |
| 4 | Éditeur de parcours (`/creer`) | Livrée |
| 5 | Import/export GPS (`/fichiers`) | Livrée |
| 6 | Bibliothèque et fiches (`/parcours`) | Livrée |
| 7 | Événements et organisateurs (`/evenements`, `/organisateurs`) | Livrée |
| 8 | Espace perso, communauté locale, suivi GPS (`/compte`, `/communaute`, `/suivi`) | Livrée (version locale) |
| 9 | Administration (`/admin`) | Livrée (version locale, sans authentification) |
| 10 | Tests, sécurité, performance | En cours : voir ci-dessous |

### Cartographie — `/explorer`
Fonds Plan IGN, Photo aérienne, OpenStreetMap (hors France), surcouche pentes de montagne ; recherche de lieux (géocodage Géoplateforme, repli Nominatim) ; géolocalisation sur clic ; traces (vos parcours + démo), comparaison de 3 parcours, filtres ; points d'intérêt réels (eau, sommets, abris, points de vue) via Overpass.

### Éditeur — `/creer`
Clic pour poser des points, tracé automatique **sur les chemins** (service d'itinéraire piéton de l'IGN, repli en ligne droite signalé), mode libre, déplacement/suppression/insertion de points, annuler/rétablir (Ctrl+Z / Ctrl+Y), inversion, fermeture de boucle, changement du départ, division, fusion, duplication, points d'intérêt, enregistrement automatique. Distance, D+, D−, altitudes min/max, durée estimée et profil en direct (altitudes IGN RGE ALTI).
Limites : le routage utilise le profil piéton (pas de profil vélo) ; les types de terrain sont déclarés par l'auteur, pas détectés.

### Fichiers GPS — `/fichiers`
GPX, KML, GeoJSON, TCX : détection du format, validation (XML/JSON mal formé, coordonnées invalides, tracé trop court, fichier > 25 Mo), avertissements, prévisualisation sur carte avant enregistrement, altitudes recalculées si absentes, conversion et export dans les 4 formats, partage (Web Share si disponible, sinon téléchargement).

### Fiches et profil — `/parcours`, `/parcours/[id]`
Filtres (discipline, pays, région, distance, D+, difficulté, durée, terrain, boucle, catalogue), vue liste et vue carte. Fiche : statistiques, carte, profil altimétrique avec pente, km, points de passage, POI ; **survol du profil ↔ position sur la carte** ; export du profil en PNG et PDF ; favoris, notes, commentaires, signalement d'erreur, photos, téléchargement multi-formats.
La « difficulté » est une estimation (km + D+/100), les durées sont indicatives.

### Événements — `/evenements`, `/organisateurs`
Calendrier filtrable (date, sport, région, distance). Espace organisateurs : événements, courses/variantes liées à vos parcours (distance et D+ repris), postes (ravitos, contrôles, secours, signaleurs…) posés sur la trace avec **kilomètre calculé**, barrières horaires, fiches bénévoles, couverture des postes, tableau des temps de passage par scénario (réparti selon l'effort) avec détection des dépassements de barrière ; exports PDF (carte, fiches bénévoles, passages). Rôles définis mais **non appliqués** sans comptes.

### Suivi GPS — `/suivi`
Position temps réel, enregistrement (filtre de précision), guidage sur parcours (distance restante, indication de direction), **alerte de sortie de parcours** (vibration, bip, bandeau), écran maintenu allumé (Wake Lock), enregistrement d'activités. Installable comme application (manifeste).
**Limites physiques d'un site web** : le suivi s'arrête si la page n'est plus visible/active et ne tourne pas écran éteint ; une application mobile native serait nécessaire pour cela. Cartes hors ligne et synchronisation entre appareils : non disponibles.

## Sécurité
- En-têtes : CSP stricte avec liste blanche des services (IGN, OSM, Nominatim, Overpass), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (géolocalisation limitée au site).
- Contenus utilisateur affichés via React (échappés) ; liens d'inscription limités à http(s) avec `rel="noopener noreferrer nofollow"`.
- Fichiers GPS : taille limitée, analyse défensive, aucune exécution.
- **À faire avant une mise en ligne publique** : comptes + règles d'accès côté serveur (étape 2), protection de `/admin`, fournisseur de tuiles sous contrat pour le repli OSM, relecture des licences des couches IGN utilisées.

## Qualité
`npm test` : 48 tests (formats GPS aller-retour et cas d'erreur, calculs de distance/D+/pente, opérations de l'éditeur, navigation et alerte hors parcours, temps de passage, filtres). Les parcours ont aussi été testés de bout en bout dans un navigateur (éditeur, import/export, fiches, organisateurs, suivi GPS simulé, administration), sur ordinateur et mobile.

## Données de démonstration
`src/lib/demo-data.ts` génère des tracés et événements **synthétiques** (badge « Démo »), sans lien avec des sentiers ou événements réels.

## Services externes utilisés
Géoplateforme IGN (`data.geopf.fr`) : tuiles, altimétrie, itinéraire piéton, géocodage. OpenStreetMap : tuiles de repli (usage développement), Nominatim, Overpass. Voir `/licences`.
