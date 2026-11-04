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

## Publier sur GitHub Pages

Le site est exporté en fichiers statiques (`output: "export"`) : aucun serveur n'est nécessaire.

1. Poussez sur la branche par défaut (le workflow se déclenche sur `master`, `main` et `claude/etape-1-interface`, qui est la branche par défaut actuelle du dépôt).
2. Dans le dépôt GitHub : **Settings > Pages > Build and deployment > Source : GitHub Actions** (à faire une seule fois).
3. L'onglet **Actions** lance « Publier sur GitHub Pages » (tests, build, déploiement). Le site est ensuite à `https://<compte>.github.io/<nom-du-dépôt>/`.

Construire et tester en local comme sur GitHub Pages :
```bash
NEXT_PUBLIC_BASE_PATH=/<nom-du-dépôt> npm run build   # produit le dossier out/
```
Sans `NEXT_PUBLIC_BASE_PATH`, le site est construit pour la racine d'un domaine (`npm run build` puis servir `out/`).

Particularités de l'hébergement statique :
- les fiches utilisent des paramètres d'adresse : `/parcours/voir/?id=…`, `/evenements/voir/?id=…`, `/organisateurs/gerer/?id=…` ;
- la politique de sécurité (CSP) est posée par une balise `<meta>` (`src/lib/csp.ts`), car GitHub Pages n'autorise pas d'en-têtes HTTP personnalisés. Conséquence : pas de protection anti-intégration en iframe (`frame-ancestors`) ;
- les données restent dans le navigateur, **séparées pour chaque adresse** (localhost, GitHub Pages…).

## Comptes et base de données (étape 2)

Le code est prêt, mais **inactif tant que vous n'avez pas connecté un projet Supabase** (voir [docs/supabase.md](docs/supabase.md), pas à pas). Sans cela, le site reste en mode local.
Une fois activé : comptes (e-mail + mot de passe, lien magique), synchronisation entre appareils (la modification la plus récente gagne), publication des parcours « Public » visibles de tous, calque « Communauté », modération par un administrateur.
- Schéma et règles d'accès : `supabase/migrations/` (PostgreSQL + PostGIS, RLS). Vérifiés par `bash supabase/tests/rls.sh` (30 contrôles sur une base locale).
- Logique de synchronisation testée (`npm test`) ; requêtes du client testées contre une API **simulée**. **Pas encore essayé contre un vrai projet Supabase** : à valider lors de la première connexion.

## Où sont les données ?

Sans Supabase connecté, tout est enregistré **dans le navigateur** (localStorage) derrière une couche unique (`src/lib/store.ts`, `src/lib/repo.ts`) : l'application est utilisable seule, et la base de données pourra remplacer cette couche sans réécrire les écrans.

Conséquences à connaître :
- les données sont propres à un appareil et un navigateur ; les vider efface tout → **Administration > Données** permet d'exporter/restaurer une sauvegarde JSON ;
- pas de partage entre utilisateurs, pas de profils publics, pas de rôles réellement appliqués ;
- le stockage local est limité (~5 Mo) : les très gros fichiers ou beaucoup de photos peuvent le saturer (message d'erreur explicite).

Les paiements et abonnements sont volontairement hors périmètre ; `/tarifs` décrit seulement les trois niveaux.

## Fonctionnalités par étape

| # | Étape | Statut |
|---|-------|--------|
| 1 | Identité visuelle, design system, accueil | Livrée |
| 2 | Comptes et base de données | **Préparée** : à activer avec [docs/supabase.md](docs/supabase.md) (sinon mode local) |
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

### Fonds de carte, surcouches et calques
- **Sélecteur compact** (un bouton, une petite fenêtre) sur toutes les cartes ; le choix est mémorisé.
- **Fonds** : Plan IGN, Photo aérienne, **Topographique** (OpenTopoMap, monde), OpenStreetMap (repli hors France) et trois fonds **Thunderforest** retenus pour l'outdoor : **Outdoors** (randonnée/trail : sentiers, courbes de niveau, refuges), **OpenCycleMap** (itinéraires cyclables et VTT) et **Landscape** (relief, forêts, roches). Les autres cartes Thunderforest (Transport, Pioneer, Spinal Map, Neighbourhood, Atlas…) n'apportent rien en outdoor et ne sont pas proposées. Ces trois fonds demandent une **clé gratuite** (thunderforest.com/pricing), saisie dans le sélecteur (conservée dans le navigateur) ou fournie au build par `NEXT_PUBLIC_THUNDERFOREST_KEY`.
- **Surcouches** : **Cadastre** (parcelles IGN, visible à fort zoom), pentes de montagne.
- **Calques de parcours** : « Mes parcours », « Parcours d'organisations », « Démonstration », « Communauté » (si comptes actifs) et **vos propres calques** (nom + couleur), affichables/masquables dans l'explorateur. Filtre par calque dans la bibliothèque, lien « source » optionnel.
- Le calque « FKT » et la carte d'état-major ont été retirés. (Les conditions d'utilisation du site FKT interdisent la collecte automatisée de ses parcours : aucune donnée n'en a été aspirée.)
- **Plein écran** sur chaque carte, avec un **bandeau sous la carte** (distance, D+, D−, altitudes, durée) ; repli CSS sur iPhone.

### Calcul des tracés — `/creer`
Le calcul **ne dépend pas du fond de carte affiché**. Il interroge deux graphes : l'**IGN (BD TOPO)** et **OpenStreetMap** (serveur Valhalla public de FOSSGIS), puis retient le résultat le plus direct : un chemin absent d'une source est retrouvé dans l'autre. Profils trail / rando / VTT / gravel / route (la difficulté de sentier autorisée est relevée pour les profils de montagne : par défaut le moteur écarte les sentiers de montagne). Les points de passage sont ramenés **sur le chemin** (plus de faux raccords). « **Aligner sur les chemins** » recale une trace existante ou importée par map-matching ; toute portion non alignable est conservée telle quelle (jamais d'interruption). Limites : le serveur OSM est public (usage raisonnable, non commercial) ; la qualité dépend des données OpenStreetMap/IGN.

### Import, découpe, fusion
Import GPX/KML/GeoJSON/TCX ; **découpe en N parties** (mode ciseaux : clic sur le tracé) ; **fusion de plusieurs parcours** (Mes fichiers GPS : cocher, ordonner, fusionner). Les altitudes d'origine sont conservées (cache d'altitude semé par les données connues), la géométrie aussi : une découpe en 3 redonne exactement la même longueur.

### Générateur de parcours — `/generer`
Départ (clic, adresse ou position), pratique (trail / randonnée / VTT), curseurs de distance et de D+ : 4 propositions classées par écart aux cibles, avec D+ mesuré, part de chemins, part d'**aller-retour** (affichée et pénalisée), profil, comparaison, ouverture dans l'éditeur. Limites : le résultat dépend du réseau de chemins (en vallée ou sur le littoral, les vraies boucles sont rares : 40-60 % d'aller-retour mesurés ; en forêt dense, 10-20 %) ; aucun D+ exact n'est garanti.

### Météo et vent — fiche d'un parcours
Open-Meteo : conditions à l'heure de passage **en chaque point**, vent de face / de côté / dans le dos par rapport au sens de déplacement (un aller-retour inverse automatiquement), exposition en %, bilan, rafales, pluie, bande des **meilleurs créneaux de départ** sur 24 h, tracé coloré et flèches sur la carte. Indicatif : vent à 10 m, sans relief local.

### Hors ligne — `/hors-ligne`
Service worker + Cache Storage : préparation de l'application, **téléchargement de zones de tuiles IGN** (autour de parcours ou zone visible, plafond de 3 000 tuiles, estimation de taille, reprise, suppression sans casser les zones partagées), parcours « prêts pour la sortie », bannière hors ligne. Les parcours sont déjà stockés sur l'appareil ; le suivi GPS fonctionne sans réseau. Seuls les fonds IGN sont téléchargeables (conditions des autres fournisseurs). Couverture : France. Le suivi s'arrête si la page n'est plus active (limite d'un site web).

### Éditeur — `/creer`
Clic pour poser des points, tracé automatique **sur les chemins** (service d'itinéraire piéton de l'IGN, repli en ligne droite signalé), mode libre, déplacement/suppression/insertion de points, annuler/rétablir (Ctrl+Z / Ctrl+Y), inversion, fermeture de boucle, changement du départ, division, fusion, duplication, points d'intérêt, enregistrement automatique. Distance, D+, D−, altitudes min/max, durée estimée et profil en direct (altitudes IGN RGE ALTI).
Limites : le routage utilise le profil piéton (pas de profil vélo) ; les types de terrain sont déclarés par l'auteur, pas détectés.

### Fichiers GPS — `/fichiers`
GPX, KML, GeoJSON, TCX : détection du format, validation (XML/JSON mal formé, coordonnées invalides, tracé trop court, fichier > 25 Mo), avertissements, prévisualisation sur carte avant enregistrement, altitudes recalculées si absentes, conversion et export dans les 4 formats, partage (Web Share si disponible, sinon téléchargement).

### Fiches et profil — `/parcours`, `/parcours/[id]`
Filtres (discipline, pays, région, distance, D+, difficulté, durée, terrain, boucle, catalogue), vue liste et vue carte. Fiche : statistiques, carte, profil altimétrique avec pente, km, points de passage, POI ; **survol du profil ↔ position sur la carte** ; export du profil en PNG et PDF ; favoris, notes, commentaires, signalement d'erreur, photos, téléchargement multi-formats.
La « difficulté » est une estimation (km + D+/100), les durées sont indicatives.

### Événements, collections, organisateurs — `/evenements`, `/organisateurs`, `/collections`
Calendrier filtrable (date, sport, région, distance). Espace organisateurs : événements, courses/variantes liées à vos parcours (distance et D+ repris), postes (ravitos, contrôles, secours, signaleurs…) posés sur la trace avec **kilomètre calculé**, barrières horaires, fiches bénévoles, couverture des postes, tableau des temps de passage par scénario (réparti selon l'effort) avec détection des dépassements de barrière ; exports PDF (carte, fiches bénévoles, passages). Rôles définis mais **non appliqués** sans comptes.

**Chaque course est reliée à son tracé** : accès direct depuis la fiche de l'événement (carte, profil, GPX/KML/GeoJSON/TCX). Les événements de démonstration sont maintenant reliés à des parcours de démonstration (avant, ils n'avaient simplement aucun tracé). **Collections** : regroupent les parcours d'un événement (5, 10, 20, 40 km…), privées ou publiques, ZIP de GPX, page publique ; **page publique d'un organisateur** (collections + événements). La publication nécessite les comptes (sinon prévisualisation locale).

**Analyse cadastrale et réglementaire** (onglet « Analyse cadastrale » d'un événement) : parcelles traversées avec **références** (API Carto IGN), longueur de tracé par parcelle, nature et statut des chemins (BD TOPO : sentier, chemin, route ; « privé » selon la source), itinéraires de randonnée balisés et **GR** (repérés par leur nom ; liste des itinéraires de longue distance de la zone via OpenStreetMap), forêts publiques et parcs/réserves/Natura 2000, carte colorée, export CSV et PDF. **Aide à la préparation, jamais une validation** : le cadastre ne donne pas l'identité des propriétaires (à demander au service de la publicité foncière ou à la mairie avec les références), « non signalé privé » ne signifie pas « public ». Couverture : France.

### Suivi GPS — `/suivi`
Position temps réel, enregistrement (filtre de précision), guidage sur parcours (distance restante, indication de direction), **alerte de sortie de parcours** (vibration, bip, bandeau), écran maintenu allumé (Wake Lock), enregistrement d'activités. Installable comme application (manifeste).
**Limites physiques d'un site web** : le suivi s'arrête si la page n'est plus visible/active et ne tourne pas écran éteint ; une application mobile native serait nécessaire pour cela. Cartes hors ligne et synchronisation entre appareils : non disponibles.

## Sécurité
- CSP stricte avec liste blanche des services (IGN, OSM, Nominatim, Overpass), posée par balise `<meta>` et politique de référent. Les en-têtes HTTP (`X-Frame-Options`, `Permissions-Policy`…) ne sont pas disponibles sur GitHub Pages.
- Contenus utilisateur affichés via React (échappés) ; liens d'inscription limités à http(s) avec `rel="noopener noreferrer nofollow"`.
- Fichiers GPS : taille limitée, analyse défensive, aucune exécution.
- **À faire avant une mise en ligne publique** : comptes + règles d'accès côté serveur (étape 2), protection de `/admin`, fournisseur de tuiles sous contrat pour le repli OSM, relecture des licences des couches IGN utilisées.

## Qualité
`npm test` : plus de 130 tests (formats GPS aller-retour et cas d'erreur, calculs de distance/D+/pente, opérations de l'éditeur, navigation et alerte hors parcours, temps de passage, filtres). Les parcours ont aussi été testés de bout en bout dans un navigateur (éditeur, import/export, fiches, organisateurs, suivi GPS simulé, administration), sur ordinateur et mobile.

## Données de démonstration
`src/lib/demo-data.ts` génère des tracés et événements **synthétiques** (badge « Démo »), sans lien avec des sentiers ou événements réels.

## Services externes utilisés
Géoplateforme IGN (`data.geopf.fr`) : tuiles, altimétrie, itinéraire piéton, géocodage, BD TOPO (WFS). API Carto IGN (cadastre). OpenStreetMap : tuiles de repli, Nominatim, Overpass ; serveur Valhalla de FOSSGIS (tracé). Open-Meteo (météo). Waymarked Trails. Thunderforest (clé personnelle). OpenTopoMap. Voir `/licences`.
