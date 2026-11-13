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

### Modifier le tracé à la souris — `/creer`
Cliquez-glissez **sur le tracé** : un point intermédiaire se crée sous le curseur ; un aperçu en pointillés se recalcule quand le pointeur marque une pause (pas à chaque mouvement), et au relâchement seuls les **deux tronçons voisins** sont retracés (mode Chemins ou Libre conservé, pratique conservée). Départ et arrivée restent fixes ; les points intermédiaires se déplacent, se suppriment (double-clic, ou sélection + Suppr). Annuler/Rétablir fonctionnent. Un simple clic sur le tracé insère toujours un point sans retracer.

### Clôturer le parcours — `/creer`
Bouton « Clôturer » (barre d'outils et onglet Tracé) : le retour au départ est calculé par le moteur d'itinéraire selon la pratique (jamais une ligne droite, même en mode Libre) ; l'arrivée a exactement les coordonnées du départ ; distance, D+ et D− sont recalculés. Le retour se modifie comme tout tronçon (clic-glisser sur le tracé). Si aucun chemin n'existe, rien n'est ajouté et un message l'explique.

### Départ, arrivée et points d'intérêt
Départ : drapeau vert ; arrivée : drapeau à damier ; boucle : les deux drapeaux en V sur un même pied (`src/lib/route-markers.ts`). Ce ne sont pas des POI. POI : 7 catégories en épingles à pictogramme (`src/lib/poi-icons.ts`) ; l'ancienne catégorie « Départ » est supprimée, les POI enregistrés avec ce type redeviennent des « Parking » à la lecture (aucune donnée perdue).

### Baguette magique (simplification) — `/creer`, onglet Tracé
Réduit le nombre de points d'un tracé importé : tolérance adaptée à la sinuosité (3 / 5 / 8 m en automatique, ou niveaux Léger / Équilibré / Fort), **virages > 45° et demi-tours toujours conservés**, points trop proches retirés, extrémités inchangées. L'écart maximal réel est mesuré et affiché ; annulable (Ctrl+Z) ; les points restants sont déplaçables.

### Générateur de parcours — `/generer`
Départ (clic, adresse ou position), pratique (trail / randonnée / VTT / vélo de route), curseur de distance et case « Maximiser le dénivelé » : jusqu'à 4 propositions classées par écart à la distance (ou par dénivelé utile si la case est cochée), avec D+ mesuré, part de chemins, part d'**aller-retour** (affichée et pénalisée), profil, comparaison, ouverture dans l'éditeur. **Qualité des boucles** : les points de passage sont traversés sans demi-tour (`through`) ; les antennes aller-retour restantes sont retirées avant toute mesure (`removeSpurs` : symétrie autour du point de rebroussement, jamais plus de 20 % du parcours, extrémités intactes) ; si l'aller et le retour partagent plus de 15 % du chemin, un retour par d'autres chemins est cherché (tronçons de l'aller interdits) et le tracé le moins répétitif est gardé. Les statistiques affichées sont toujours celles du tracé final. **Fiabilité** : les altitudes passent par la Géoplateforme avec cadence limitée (≤ 5 requêtes/s), reprises espacées sur 429/5xx/erreur réseau et **secours Open-Meteo** (signalé) ; les échecs sont typés — service de calcul d'itinéraires, service d'altitudes, hors ligne — et le message dit lequel et pourquoi (code, limite de requêtes…), au lieu d'un texte générique. Une direction en échec n'arrête plus les autres. **Maximiser le dénivelé** (remplace l'ancien objectif de D+) : le relief est mesuré dans 24 directions autour du départ, les boucles sont tracées vers les plus montantes puis classées par **dénivelé utile** (D+ mesuré, minoré de la part d'aller-retour, pour ne pas récompenser les détours artificiels) ; distance tenue entre −15 % et +10 % de la cible ; une variante un peu plus longue n'est gardée que si elle apporte réellement du D+ ; les boucles nettement moins montantes que la meilleure sont écartées. Le D+ affiché est toujours celui du tracé réellement généré (altitudes IGN, même calcul que partout) : sur terrain plat, il reste faible et c'est dit. Limites : le résultat dépend du réseau de chemins (en vallée ou sur le littoral, les vraies boucles sont rares : 40-60 % d'aller-retour mesurés ; en forêt dense, 10-20 %) ; le maximum trouvé est celui des directions explorées, pas un maximum mathématique absolu.

### Météo et vent — fiche d'un parcours
Open-Meteo : conditions à l'heure de passage **en chaque point**, vent de face / de côté / dans le dos par rapport au sens de déplacement (un aller-retour inverse automatiquement), exposition en %, bilan, rafales, pluie, bande des **meilleurs créneaux de départ** sur 24 h, tracé coloré et flèches sur la carte. Indicatif : vent à 10 m, sans relief local.

### Hors ligne — `/hors-ligne`
Service worker + Cache Storage : préparation de l'application, **téléchargement de zones de tuiles IGN** (autour de parcours ou zone visible, plafond de 3 000 tuiles, estimation de taille, reprise, suppression sans casser les zones partagées), parcours « prêts pour la sortie », bannière hors ligne. Les parcours sont déjà stockés sur l'appareil ; le suivi GPS fonctionne sans réseau. Seuls les fonds IGN sont téléchargeables (conditions des autres fournisseurs). Couverture : France. Le suivi s'arrête si la page n'est plus active (limite d'un site web).

### Éditeur — `/creer`
Clic pour poser des points, tracé automatique **sur les chemins** (service d'itinéraire piéton de l'IGN, repli en ligne droite signalé), mode libre, déplacement/suppression/insertion de points, annuler/rétablir (Ctrl+Z / Ctrl+Y), inversion, fermeture de boucle, changement du départ, division, fusion, duplication, points d'intérêt, enregistrement automatique. Distance, D+, D−, altitudes min/max, durée estimée et profil en direct (altitudes IGN RGE ALTI).
Limites : le routage utilise le profil piéton (pas de profil vélo) ; les types de terrain sont déclarés par l'auteur, pas détectés.

### Fichiers GPS — `/fichiers`
GPX, KML, GeoJSON, TCX : détection du format, validation (XML/JSON mal formé, coordonnées invalides, tracé trop court, fichier > 25 Mo), avertissements, prévisualisation sur carte avant enregistrement, altitudes recalculées si absentes, conversion et export dans les 4 formats, partage (Web Share si disponible, sinon téléchargement).

### Points d'intérêt
8 catégories à pictogramme (Ravitaillement, Point d'eau, Contrôle, Point de vue, Passage, Poste de secours, Parking, Départ) : marqueurs lisibles dézoomés, fenêtre d'information au clic, ajout/renommage/suppression dans l'onglet POI. `Passage` reprend l'ancien type « passage délicat » (identifiant `danger`) : les données existantes restent valides.

### Recherche géographique
Bibliothèque : champ « Commune ou code postal » (suggestions, rayon réglable ; un code postal partagé liste toutes ses communes + « tout le code postal »). Espace organisateur : lieu par code postal ou nom, région avec autocomplétion ; rien n'est choisi automatiquement. Source : API Géo officielle (geo.api.gouv.fr).

### Champs obligatoires
Astérisque rouge + légende « * Champ obligatoire » ; la validation correspond (espaces seuls refusés, message sous le champ, envoi bloqué). Dans l'édition d'un événement (enregistrement automatique), un champ obligatoire vidé n'écrase pas la dernière valeur valide.

### Navigation et périmètre
Trois univers : **Parcours** (Explorer, Créer, Générer, Itinéraires, Itinérance, Bibliothèque), **Événements** (calendrier, espace organisateur), **Nutrition** (page « Bientôt disponible »). Plus aucune donnée de démonstration ni offre payante : tout est gratuit. Les tracés synthétiques ne subsistent que comme jeux d'essai (`tests/fixtures/`).

### Organisation Trail : parcours guidé en six étapes — `/organisateurs`
L'espace organisateur est un circuit : **1 Parcours → 2 Trail → 3 Analyse → 4 Documents → 5 Logistique → 6 Vérification finale**. Chaque étape ouvre la suivante (`src/lib/trail-flow.ts` : états, verrous et pourcentage déduits des données, jamais saisis) ; une étape verrouillée dit ce qui la débloque. Un événement préparé avant ce circuit (postes ou bénévoles déjà saisis) n'est jamais verrouillé.
- **Deux clics** une fois les parcours enregistrés, la course associée et l'effectif donné : « Lancer l'analyse » (relevé du tracé en une requête : goudron, chemins, **traversées et passages sur route**, départements) puis « Tout générer » (règlement s'il n'existe pas, **postes proposés** : départ, arrivée, points d'intérêt du parcours repris, ravitaillements espacés, secours, barrière horaire au-delà du marathon, signaleurs aux routes détectées). Rien d'existant n'est écrasé ; relancer ne duplique rien.
- **Validation humaine** : règlement, dossier administratif, dispositif de secours, traversées de routes, accords des propriétaires, dépassement du plafond de goudron. Le site prépare, l'organisateur coche.
- **Logistique** : épingles et pictogrammes des points d'intérêt du site (drapeaux pour départ et arrivée), numéro de poste et pastille « bénévoles affectés / nécessaires » ; postes proposés marqués « à vérifier » jusqu'à confirmation.
- **Vérification finale** : à compléter / à valider / terminé, chaque ligne renvoyant à son étape.
Limites : les traversées viennent du graphe OpenStreetMap (à confirmer sur le terrain) ; les emplacements proposés ne tiennent pas compte des accès véhicule.

### Recherche de lieux (Overpass) : robustesse
Quatre serveurs publics essayés tour à tour (celui qui a répondu passe en tête), délai d'attente par serveur, deux nouvelles séries d'essais espacées (3 s puis 8 s), requêtes allégées (une clause par clé OSM au lieu d'une par valeur), tronçons bornés en longueur selon le rayon (10 km à 500 m, 5 km à 2 km, 4 km au-delà) et recoupés en deux quand le serveur les interrompt ou les tronque. Une réponse « 200 » contenant une erreur du serveur n'est plus prise pour un résultat vide. Un tronçon en échec n'annule plus toute la recherche : résultat partiel signalé avec les kilomètres manquants (non mis en cache). Le message d'erreur dit la cause la plus parlante (limite de requêtes, erreur du serveur, délai, injoignable, hors connexion) et liste les serveurs essayés. Mesuré sur un serveur Overpass réel : 302 km, 7 catégories, 500 m → 28 requêtes, 3 415 lieux, aucun échec.

### Espace organisateur : courses, bénévoles
- **Courses** : le parcours est obligatoire pour créer une course ; distance, D+, D−, altitudes min/max, discipline et durée estimée sont repris du tracé (plus de saisie), et réalignés automatiquement si le parcours est modifié. Les anciennes courses sans parcours restent modifiables et invitent à en choisir un.
- **Bénévoles ↔ carte** : une seule affectation (`postId` de la fiche), lue partout. Depuis la carte (onglet Logistique) : pastille « affectés / nécessaires » sur chaque poste, fenêtre listant les bénévoles, affectation d'une fiche existante, ajout d'un bénévole par son nom (réaffecté si la fiche existe déjà : pas de doublon), retrait. Depuis la fiche (onglet Bénévoles) : liste « Poste n — nom (km) » avec les mêmes numéros que sur la carte. Poste ou course supprimés : fiches conservées, « non affecté ».

### Mon espace : suppression des parcours
Bouton de suppression sur chaque carte, mode « Sélectionner plusieurs parcours » (tout sélectionner, supprimer la sélection), confirmation qui liste les parcours et signale les courses d'événements qui en dépendent.

### Préparation d'une épreuve — espace organisateur, onglet « Préparation »
Calculé à partir des courses, postes et bénévoles déjà saisis, d'après un guide fédéral de l'organisateur de trail (ancien : un avertissement demande de vérifier délais, justificatif médical et catégories) : nature de chaque épreuve (course nature, trail découverte, trail, ultra) et plafond de goudron comparé à la part **mesurée** sur le tracé ; catégories d'âge admises ; matériel à exiger (nuit comprise) ; horaires du jour J ; contrôles de la logistique (signaleurs pourvus, secours, ravitaillements, barrières horaires) ; dispositif médical selon l'effectif ; échéancier daté ; dossier administratif (pièces « auto » et pièces à cocher) ; budget prévisionnel ; projet de règlement ; affichage d'urgence ; signalétique ; export PDF. Départements traversés détectés par le géocodage inverse de la Géoplateforme. Données de préparation gardées sur l'appareil (`prep`), non publiées.

### Interface : tablette, états vides, cibles tactiles
À partir de 768 px de large, la navigation complète est dans l'en-tête (plus de barre basse) et les pages « panneau + carte » (Générer, Itinéraires, Itinérance) s'affichent côte à côte. Barre basse opaque sur téléphone, états vides avec actions (bibliothèque, événements), pastilles et petits boutons d'au moins 40 px au doigt, titres équilibrés.

### Itinérance — `/itinerance`
Commerces alimentaires, restauration et points d'eau à moins de 100 m – 5 km d'un parcours (OpenStreetMap via Overpass, 3 serveurs de secours) : recherches rapides (Essentiel, Eau seulement, Courses, Repas, Tout) ou catégories au choix ; épingles à pictogramme avec fenêtre d'information ; **autonomie** (plus long tronçon sans eau / sans courses) ; résultats regroupés par **étapes** de 5 à 50 km ; filtres (catégorie, nom ou village, « sans détour ») ; distance au tracé, position kilométrique, détour aller-retour à vol d'oiseau, adresse, horaires et téléphone déclarés ; repères sur le profil ; ajout d'un lieu ou de tous comme POI ; export CSV ; résultats gardés pour la session. Lieux « potentiellement disponibles », jamais garantis.

### Baguette magique à jauge, sections, nouveau départ — `/creer`
Jauge 0–90 % de points à supprimer (aperçu en pointillés, compte exact, avertissement et réglage conseillé si l'écart dépasse 15 m). Extraction d'une **section A–B** posée librement sur le tracé (coupes interpolées, altitudes conservées, export GPX, enregistrement, étape suivante). **Nouveau départ** par clic droit ou appui long sur un point (boucle : rotation ; parcours ouvert : confirmation de la portion retirée).

### Vue 3D, espaces naturels — fiche d'un parcours
Bouton « Vue 3D » : relief (Terrain Tiles), photo aérienne IGN, rotation/inclinaison, survol animé du tracé, exagération réglable. Surcouches INPN activables une à une (Natura 2000, parcs, réserves…) avec fiche (nom, type, surface, gestionnaire, lien officiel).

### Partage et intégration
Visibilité Privé / Public par parcours. Un parcours public donne un **lien de partage** (`/partage/#…`) et un **code iframe** (`/integrer/#…`) : le tracé allégé (≤ 600 points), ses statistiques exactes et ses POI sont encodés dans le fragment de l'adresse — aucun serveur, aucune autre donnée. Le destinataire peut télécharger le GPX ou créer sa copie ; l'original n'est jamais modifiable.

### Enregistrement, sport, légende, plein écran (passe du 13/11)
- **Enregistrer** : l'éditeur n'écrit plus rien tout seul dans la bibliothèque. Bouton « Enregistrer » (ou Ctrl+S), état « Non enregistré » visible, avertissement en quittant (fermeture, rechargement, liens du site). Bloqué pendant le calcul des altitudes.
- **Type de sport** (onglet Tracé) : Vélo de route, VTT, Trail, Randonnée. Profils de routage mesurés sur des trajets réels (`COSTING` dans `src/lib/routing.ts`) : route = 100 % revêtu ; limite connue : le profil piéton du moteur public n'a pas de pénalité pour les routes.
- **Générateur** : pratique Vélo de route (jusqu'à 200 km, part de revêtu affichée). Avec « Maximiser le dénivelé », la distance peut dépasser la cible de **10 % au plus**. Longues boucles : classement au pas large, propositions retenues re-mesurées au pas fin.
- **Légende** des surcouches (pentes, cadastre, espaces naturels) sous le bouton des fonds de carte.
- **Plein écran** : l'espace de travail entier (carte + panneau d'outils) passe en plein écran, sans l'en-tête ni la barre du site.
- **Supprimé** : suivi GPS et navigation (`/suivi`). Les activités déjà enregistrées restent visibles dans Mon espace.

### Itinéraires de référence — `/itineraires`
GR/GRP, véloroutes, traversées VTT, cols : tracés OpenStreetMap (ODbL) intégrés avec source, licence, contrôle de validité, statistiques recalculées. Voir `docs/bibliotheque.md` (sources, anti-doublons, ajout d'un itinéraire).

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
