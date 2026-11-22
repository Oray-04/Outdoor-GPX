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
Trois univers : **Parcours** (Explorer — avec les itinéraires de référence —, Créer, Générer, Bibliothèque — avec l'itinérance de chaque parcours), **Événements** (calendrier, espace organisateur), **Nutrition** (page « Bientôt disponible »). Plus aucune donnée de démonstration ni offre payante : tout est gratuit. Les tracés synthétiques ne subsistent que comme jeux d'essai (`tests/fixtures/`).

### Éditeur : calque de référence
Onglet Tracé > « Calque de référence » : un autre parcours enregistré s'affiche en arrière-plan (bleu transparent, axe pointillé, sous le tracé en cours) pour le recalquer, idéalement en mode « Libre ». Bandeau sur la carte pour le masquer ou le retirer ; « Centrer » cadre la carte dessus. Le parcours de référence n'est jamais modifié ; le choix est gardé pendant la session.

### Planificateur nutritionnel — `/nutrition`
Outil de planification pour la route, le trail et l'ultra (la page d'attente « bientôt disponible » est remplacée).
- **Parcours en 5 étapes** : profil (poids, niveau, expérience, tolérance digestive, habitudes), course (type, distance, D+, durée — estimable —, intensité, heure de départ, ravitaillements ; import possible d'un parcours enregistré avec ses points de ravitaillement), météo (température, humidité, ciel, sudation), préférences (produits, objectifs, caféine, test de sudation, sodium de la sueur), plan.
- **Moteur indépendant de l'interface** (`src/lib/nutrition/`) : `constants.ts` (tous les seuils et coefficients, réglables), `carbs.ts`, `hydration.ts`, `sodium.ts`, `caffeine.ts`, `plan.ts` (plan de course), `engine.ts` (validation et calcul complet), `products.ts`, `references.ts` (références, recommandations établies et hypothèses), `pdf.ts`, `storage.ts`.
- **Garde-fous** : 90 g/h seulement avec intestin entraîné + bonne tolérance + niveau confirmé ; eau jamais au niveau des pertes (65 % par défaut, 300–800 ml/h, < 90 % des pertes) ; sodium plafonné ; caféine prudente par défaut, alertes au-delà de 3 mg/kg par prise, 400 mg/jour, 6 mg/kg ; caféine résiduelle au coucher ; fiabilité affichée (mesuré / estimé).
- **Catalogue personnel** de produits : valeurs saisies depuis l'emballage, aucune valeur pré-remplie ; le plan donne le nombre exact par prise, par tronçon et au total, et signale les stocks insuffisants et la capacité de liquide dépassée.
- Résultats : 4 indicateurs, graphiques cumulés (objectif / prévu), courbe de caféine, timeline, planning chronologique, tronçons, produits ; plans enregistrés sur l'appareil ; fiche PDF.
- **Course d'un événement** (étape 2) : sélection directe d'une course de l'Organisation Trail dont le parcours est enregistré ; parcours, distance, dénivelé, heure de départ et ravitaillements (postes ravitaillement et point d'eau) sont repris.
- **Objectifs non atteints** (`shortfalls`, `gaps.ts`) : indicateurs bordés de rouge avec « Manque X », bloc « à corriger » avec une piste concrète (nombre de produits à ajouter), cellules du planning en rouge là où le retard cumulé dépasse la tolérance (10 % et une demi-portion), tronçons et fiche PDF signalés.
- Palette : caféine en laiton doré (plus de violet), glucides cuivre, eau bleu glacier, sodium vert sapin ; rouge réservé aux manques et alertes.
- Tests : `tests/nutrition.test.ts` (formules et cas limites).

### Météo du parcours : activable
Sur la fiche d'un parcours, la section « Météo et vent le long du parcours » a un interrupteur. Désactivée par défaut : aucune requête au service météo et aucune flèche de vent sur la carte. Activée, elle affiche prévisions à l'heure de passage, créneaux de départ et vent sur la carte ; le choix est mémorisé sur l'appareil pour toutes les fiches (`crete:meteo`).

### Identité visuelle « Frosted Touch »
Verre dépoli doux : cartes, conteneurs, panneaux, barre de navigation et menus translucides (flou 12 px, rebord lumineux de 1 px, rayons de 16 à 22 px, ombres larges et diffuses) sur un fond de dégradés pastel (sauge, glacier, ivoire, cuivre) sous les courbes de niveau. Micro-interactions : légère élévation et rebord qui s'illumine au survol. Lisibilité : texte secondaire assombri (contraste ≥ 4,5:1), champs presque opaques, pas de second flou dans un panneau déjà flouté, ni derrière une carte ; panneaux opaques si le navigateur ne gère pas le flou ou si la transparence réduite est demandée. Tout est dans `globals.css` (aucune structure de page modifiée).

### Navigation simplifiée
Menu Parcours : Explorer, Créer, Générer, Bibliothèque. Menu Événements : la rubrique « Randonnée » est retirée.

### Ergonomie sur ordinateur : défilement et superpositions
- **Éditeur** : la grille bornait mal sa hauteur, si bien que le panneau de droite (et le profil altimétrique sous la carte) étaient coupés en bas et ne défilaient pas. Ligne de grille bornée, panneau qui défile jusqu'au dernier bouton, profil visible et à pleine largeur.
- **Cartes intégrées dans une page** (fiche parcours, accueil, bibliothèque en carte, logistique, analyse, hors ligne) : la molette fait défiler la page ; **Ctrl/⌘ + molette** zoome (aide affichée), deux doigts sur mobile. En plein écran, et sur les espaces de travail (Explorer, Créer, Générer, Itinéraires, Itinérance), la molette zoome comme avant.
- **Espaces de travail plein écran** : plus de pied de page caché sous l'application, donc plus de second défilement.
- **Organisation Trail** : menu des six étapes en colonne latérale fixe sur ordinateur, liste de contrôle de chaque étape repliable.

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

### Itinérance — dans la fiche de chaque parcours (`/parcours/voir/?id=…#itinerance`)
L'onglet « Itinérance » du menu a été retiré : l'outil se lance depuis la fiche d'un parcours (bouton « Itinérance ») ou depuis l'éditeur (onglet Fichiers), et calcule les lieux sur ce tracé. L'ancienne adresse `/itinerance` redirige vers la bibliothèque (ou vers la fiche si `?id=` est donné). Ajout des lieux comme POI réservé aux parcours enregistrés sur l'appareil.

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

### Itinéraires de référence — onglet « Itinéraires » de l'Explorer (`/explorer/?itineraire=gr20`)
L'onglet « Itinéraires » du menu a été retiré : liste, recherche, catégories, détail, profil, contrôle du tracé, GPX et ajout à « Mes parcours » sont dans l'Explorer, avec un interrupteur « Afficher les itinéraires sur la carte » (visibles aussi depuis les autres onglets). L'ancienne adresse `/itineraires/?id=…` redirige.

GR/GRP, véloroutes, traversées VTT, cols : tracés OpenStreetMap (ODbL) intégrés avec source, licence, contrôle de validité, statistiques recalculées. Voir `docs/bibliotheque.md` (sources, anti-doublons, ajout d'un itinéraire).

### Fiches et profil — `/parcours`, `/parcours/[id]`
Filtres (discipline, pays, région, distance, D+, difficulté, durée, terrain, boucle, catalogue), vue liste et vue carte. Fiche : statistiques, carte, profil altimétrique avec pente, km, points de passage, POI ; **survol du profil ↔ position sur la carte** ; **zone du profil** : clic gauche maintenu et glisser sur le profil pour sélectionner une portion — elle est surlignée sur la carte (recadrée si besoin) et le bandeau affiche le km de début et de fin, la distance, le D+, le D− et les altitudes min–max de la zone (un simple clic ou « Effacer la zone » la retire). Dans l'éditeur, la zone devient la section A–B (points A et B sur la carte) et peut être extraite en un clic ; export du profil en PNG et PDF ; favoris, notes, commentaires, signalement d'erreur, photos, téléchargement multi-formats.
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

### Calcul du dénivelé (révision)

Un même calcul partout (fiche, éditeur, générateur, zone du profil, bibliothèque) : `trackStats` / `rangeStats` dans `src/lib/geo.ts`.

- **Échantillonnage** : les altitudes sont demandées tous les ~20 m le long du tracé (`resampleLine`, 3 000 points max) — et plus seulement aux sommets du tracé. Avant, un tronçon droit (mode « Libre ») qui traversait une vallée n'était mesuré qu'à ses deux bouts : la vallée disparaissait du profil et du D+.
- **Altitudes manquantes** : interpolées entre les voisines valides (`fillGaps`) au lieu d'être remplacées par 0 m, qui créait de faux sauts de plusieurs centaines de mètres.
- **Pas de mélange** : après une modification dans l'éditeur, tout le tracé est réinterrogé sur le même modèle (IGN RGE ALTI) — plus de mélange entre altitudes GPS d'un fichier importé et altitudes IGN.
- **Bruit** : lissage centré sur 40 m puis seuil d'hystérésis de 3 m ; le reste en fin de trace est compté. Un bruit de ±4 m ne gonfle plus le D+, une vraie bosse de 30 m est comptée.
- Mesures réelles (IGN) : Chamonix → Montenvers 810/13 m → 809/15 m (stable) ; Annecy → Semnoz 1 253 → 1 247 m ; ligne droite « Libre » Planpraz → Montenvers 0 m D+ / 513 m D− → **830 m D+ / 1 323 m D−** (la vallée de Chamonix est enfin vue).

### POI partagés entre parcours et logistique

Une seule saisie : les points d'intérêt du parcours (`route.pois`) sont la source unique de l'emplacement, du type et du nom ; un poste de logistique lié (`post.poiId`) n'ajoute que les données d'organisation (bénévoles nécessaires, barrière horaire, consignes, bénévoles affectés). Moteur pur et testé : `src/lib/poi-sync.ts`.

- **Parcours → logistique** : chaque enregistrement d'un parcours (`routesRepo.upsert`) réaligne aussitôt les événements qui l'utilisent (`syncEventsWithRoutes`) — POI ajouté = poste créé, déplacé/renommé = poste mis à jour (bénévoles et consignes gardés), supprimé = poste retiré (bénévoles remis à « non affecté », fiches conservées).
- **Logistique → parcours** : ajouter, glisser, renommer ou supprimer un poste écrit le POI du parcours ; les autres événements utilisant ce parcours suivent.
- **Correspondance** : ravitaillement, point d'eau, contrôle, secours, parking, point de vue ↔ même type ; signaleur ↔ « Passage ». **Départ et arrivée** sont pris aux extrémités du parcours de base ; déplacés à la main, ils le restent (bouton « Recaler »).
- **Placement** : près du tracé (≤ 60 m), un poste s'aimante sur la trace ; plus loin il reste où l'on clique (badge « Hors tracé · x m ») ; le parking n'est jamais aimanté. Kilomètre toujours calculé sur le parcours.
- **Sans doublon ni perte** : identifiants déterministes (`course~poi`) ; synchronisation idempotente ; anciens postes saisis seulement dans la logistique versés une fois dans le parcours (ou rattachés à un POI du même type à moins de 60 m) ; éditeur ouvert pendant une modification de la logistique → fusion à trois voies (`mergePois`), mise à jour en direct.
- **Propositions automatiques** (« Proposer les postes », génération des documents) : chaque proposition devient un POI du parcours et un poste « à vérifier ».
- Dans l'éditeur, un parcours utilisé par un événement l'indique dans l'onglet POI. Ajouter, renommer ou déplacer un POI ne relance plus le calcul des altitudes (le tracé ne dépend que des segments).

### Logistique : page dédiée

- Étape 3 du parcours guidé, juste après Parcours et Votre trail (avant Analyse et Documents) ; l'étape affiche un résumé par course et ouvre la page `/organisateurs/logistique/?id=…`.
- Grande carte, palette de types, compteur de chaque équipement, liste des postes (bénévoles, barrière, consignes), onglets Bénévoles et Temps de passage, export PDF.
- **Zoom de la carte** : plus de mode « Plein écran » (ambigu). À la souris, la molette zoome et dézoome dès que le curseur est sur la carte, sans clic préalable et sans faire défiler la page ; hors de la carte, la molette fait défiler la page. Glisser : déplacer ; clic droit + glisser : tourner et incliner ; boussole : revenir au nord. Sur écran tactile (téléphone, tablette), un doigt fait défiler la page, deux doigts déplacent et zooment la carte (`data-workspace="touch"`, détection `pointer: coarse`).

### Boussole « Nord »

Sur toutes les cartes : dès que la carte est tournée ou inclinée, une boussole apparaît sous le zoom (aiguille vers le nord réel) ; un clic remet le nord en haut et la carte à plat. Rotation et inclinaison 3D restent possibles.

### Renommer un parcours

- Mon espace → Mes parcours : bouton crayon sur chaque carte, saisie en place (Entrée pour valider, Échap pour annuler). Également dans Fichiers et dans l'éditeur (Infos).
- Seul le nom change (`renameRoute`) : tracé, altitudes, statistiques et POI intacts ; courses, collections, bibliothèque et logistique lisent le parcours par son identifiant, le nouveau nom s'affiche partout.
- Correction : depuis la révision du dénivelé, l'éditeur ne marquait plus un parcours chargé comme « prêt » (instruction neutralisée par un commentaire) — aucune modification, nom compris, ne pouvait être enregistrée.

### POI communs à plusieurs parcours

Un ravitaillement, un poste de secours, un contrôle… utilisés par plusieurs courses (A, B, C) ne sont créés et gérés qu'une fois.

- Dans la logistique, sur chaque poste : **« Commun à plusieurs parcours »**, puis cocher les parcours concernés (deux courses sur le même parcours n'en font qu'un).
- Le même POI (même identifiant, marqué `common`) figure dans chaque parcours coché : il s'affiche sur leurs cartes, fiches et dans l'éditeur (badge « Commun »).
- **Un seul poste** dans l'événement (`post.shared` : autres courses et kilomètre sur chacune) : une seule équipe de bénévoles, un seul effectif, une seule barrière. Il apparaît dans la liste, la carte (pastille « ×2 », « ×3 »…), les temps de passage et la nutrition de chaque course, avec son kilomètre propre (« Commun : Course A (km 5,4) · Course B (km 12,1) »).
- Toute modification (nom, type, position), depuis la logistique ou l'éditeur d'un des parcours, est reportée sur tous (`propagateCommon` à l'enregistrement).
- Décocher un parcours retire le POI de ce seul parcours ; le poste et ses bénévoles restent sur les autres. Supprimer le poste le retire de tous les parcours (après confirmation qui les liste).
- Anciens postes en double (deux courses sur le même parcours, un poste chacune) : fusionnés en un seul poste commun, bénévoles reportés, effectif le plus grand conservé.
- Une copie de parcours (« Dupliquer », découpe) reçoit de nouveaux identifiants de POI : elle n'est pas liée à l'original.

### Logistique : postes communs, effectifs, documents de terrain

- **Postes communs à plusieurs courses** (ex. départ commun aux 10, 20 et 40 km) : détectés automatiquement (même type, moins de 80 m, courses différentes — `commonCandidates`) et proposés dans un bandeau ; « Mutualiser » réunit les postes en un seul (`mergeEndpoints` pour départ/arrivée, `mergePoiPlan` pour les POI) : effectif le plus grand retenu, consignes réunies, bénévoles reportés, aucun doublon. Un poste placé sur un seul parcours mais situé sur le tracé d'autres courses (tronc commun) est aussi proposé (« Rendre commun », `trackCandidates`). Une course peut être séparée d'un départ/arrivée commun (`splitEndpoint`).
- **Effectifs mutualisés** (`staffing`) : chaque poste et chaque bénévole sont comptés une seule fois au total de l'événement ; le panneau affiche aussi les bénévoles économisés par la mutualisation. Le poste commun reste visible sur chaque course (liste, carte avec pastille « ×3 », temps de passage), avec son kilomètre sur chacune.
- **Panneau latéral** : état de la course (bénévoles pourvus/nécessaires, barre complet/partiel/à pourvoir, filtres), puis chaque poste avec un liseré et un badge d'état (Complet, Partiel, À pourvoir), l'équipe détaillée (nom, téléphone cliquable, horaires, poste, courses, consignes modifiables sur place), les places libres matérialisées, et les réglages du poste repliés. Sur la carte, la pastille d'effectif prend la couleur de l'état.
- **Onglet Bénévoles** : e-mail facultatif, fiches détaillées (poste, courses, état, consignes du bénévole et du poste), recherche, chiffres clés.
- **Export CSV** (`volunteersCsv`) : une ligne par bénévole — nom, téléphone, e-mail, horaires, n° et nom du poste, type, course(s), km, barrière, consignes du bénévole et du poste, état du poste, coordonnées GPS. Séparateur « ; », UTF-8 avec BOM, CRLF : s'ouvre directement dans Excel ; champs protégés contre l'interprétation en formule.
- **PDF de logistique refaits** (`logistics-pdf.ts`, mise en page commune `pdf-kit.ts`) : bandeau au nom de l'événement, pictogrammes du site, tableaux à en-tête répété, pied de page (source, date, pagination).
  - *Carte logistique* (une course, ou toutes) : carte rendue hors écran (`map-snapshot.ts`) cadrée sur le tracé **et** tous les postes (aucun ne sort du cadre), page en portrait ou paysage selon la forme du parcours, même fond que la carte affichée, pastilles numérotées et état des effectifs, flèche du nord, légende latérale (pictogrammes, effectifs), puis tableau des postes (km, barrière, affectés, consignes).
  - *Bénévoles* : tableau d'affectation (une ligne par poste, postes communs une fois), puis une fiche par bénévole : coordonnées, poste et courses avec km, horaires, barrière, GPS, mini-carte centrée sur le poste, consignes, coéquipiers.
  - *Temps de passage* : même présentation.
- **Boussole « Nord »** : le sélecteur de calques et la légende font désormais partie de la pile des contrôles de la carte (zoom, boussole, calques) au lieu d'être posés par-dessus : la boussole n'est plus jamais masquée, y compris en 3D ; le panneau 3D de la fiche parcours laisse la colonne des contrôles libre.

### Nutrition simplifiée (débutants)

- **Rubrique « Préférences alimentaires » retirée** : ce texte libre n'entrait dans aucun calcul (il reste lu dans les anciens plans, sans effet).
- **Intervalle entre les prises calculé** (`src/lib/nutrition/interval.ts`, plus de saisie) : glucides à apporter par les produits = objectif horaire − glucides de la boisson principale ; intervalle = glucides d'une portion (moyenne des produits choisis) ÷ ce besoin × 60. Arrondi à 5 min si l'apport reste à ±10 % de l'objectif, sinon à la minute ; 10 à 90 min ; sous 10 min, plusieurs portions par prise. Le planning garde un moment pour boire toutes les 20 min au plus (la prise de glucides tombe alors une fois sur deux…). Exemple : 60 g/h et gels de 30 g → un gel toutes les 30 min, boire toutes les 15 min. Le calcul est affiché pas à pas à l'étape « Produits » et dans le plan.
- **Caféine simplifiée** : plus de demi-vie ni d'heure du coucher (ni courbe de caféine résiduelle) ; restent la stratégie (libellés clairs), la sensibilité, la consommation habituelle et les horaires des prises, avec les alertes de dose.
- **Plan lisible** : encart « L'essentiel » (manger, boire, sel, caféine en une phrase chacun), « Pourquoi ces quantités ? » (repère de durée, plafond personnel, démarrage progressif, rappel que rien n'est universel), planning « prise par prise » en cartes (heure, temps de course, km, quoi prendre), détails par nutriment en onglets avec des **graphiques grand format** dessinés à la largeur réelle (300 px de haut, 240 sur mobile, textes 12–13 px), tableau détaillé replié.
- **Assistant** : encart « Vous débutez ? » à l'étape 1, étape 4 renommée « Produits », réglages avancés et mesures personnelles repliés (facultatifs).
- **Bouton « Actualiser »** : relit la saisie, les produits et les plans enregistrés, reprend les dernières données du parcours ou de la course d'événement liée (distance, dénivelé, ravitaillements) et recalcule le plan, sans quitter la page.
- Mise à jour de sécurité : Next.js 16.4.6.

### Logistique : orienter le marqueur d'un poste

Chaque poste placé sur la carte peut être tourné, pour dégager deux postes proches ou indiquer une direction.
- **Sur la carte** : sélectionnez un poste, une poignée ⟳ apparaît à côté de son épingle ; faites-la glisser autour de l'épingle (souris ou doigt), par pas de 5°. Double-clic sur la poignée : marqueur redressé.
- **Dans la fiche du poste** (Réglages du poste) : curseur « Orientation sur la carte » de −180° à 180° et bouton « Redresser ».
- Le marqueur pivote autour de sa **pointe** : l'emplacement exact du poste ne change pas. L'orientation est enregistrée avec le poste (`post.rotation`), conservée par la synchronisation avec le parcours, et reprise dans les cartes PDF (pastilles comprises). Elle reste fixe à l'écran quand on tourne la carte.
- Sur petit écran, toucher un poste ne fait plus défiler la page vers sa fiche (la carte reste en place pour pouvoir l'orienter).

### Organisation Trail : une page, des rubriques, génération facultative

- **Une seule page par trail**, en mosaïque de tuiles (3 colonnes sur ordinateur, Logistique en tuile double, une colonne sur mobile ; la rubrique à traiter est marquée « Prochaine étape ») : Mon événement, Gérer mon trail, Parcours, Votre trail, Logistique, Analyse, Documents, Vérification finale. Chaque carte montre son titre, les informations principales, son état (Terminé, En cours, À faire, Facultatif, Verrouillé) et sa progression ; « Développer » ouvre le contenu sur place, la tuile prenant alors toute la largeur (plusieurs à la fois, « Tout développer ») ; `#rubrique-logistique` (lien de retour de la page Logistique) ouvre directement la bonne carte.
- **Génération automatique facultative**, regroupée dans « Analyse » : l'organisateur choisit « Le site prépare mes documents » ou « J'ai déjà mes documents » (ou décide plus tard). Les éléments générables sont listés avec leur état — à générer, généré, à compléter (ex. mentions entre crochets du règlement), après génération : analyse des parcours, signaleurs aux traversées, règlement, dossier administratif, échéancier, dossier de préparation PDF.
  - Non choisie : l'analyse et les documents sont facultatifs, hors du pourcentage, jamais bloquants.
  - « Le site prépare » : ils comptent dans la progression, comme avant.
  - « J'ai déjà mes documents » : deux confirmations (règlement, dossier administratif) suffisent ; l'organisateur passe directement à la logistique, la génération reste disponible.
  - La logistique s'ouvre dès que chaque course a son parcours ; la vérification finale dès que des postes sont placés — sans passer par l'analyse.
- **Ravitaillements** : plus aucun ravitaillement ajouté d'office au départ ni à l'arrivée par les propositions automatiques ; les contrôles n'en réclament plus à l'arrivée.
- **Analyse cadastrale** : l'erreur « Unexpected token … "# HELP jmx"… is not valid JSON » venait d'un serveur public qui renvoie parfois, avec un statut 200, une page de métriques au lieu des données ; le code appelait `res.json()` sans vérifier. Toutes les réponses des services IGN / Géoplateforme passent désormais par `readJson` (`src/lib/http.ts`) : le contenu est vérifié, une réponse qui n'est pas des données est traitée comme une panne passagère (nouvel essai, puis repli sur le WFS pour les parcelles), avec un message clair nommant le service.

- **Logistique, fiche d'un poste** : barrière horaire, bénévoles requis (boutons − / +) et consignes du poste sont toujours visibles, au-dessus des « Réglages du poste », qui ne gardent que le kilomètre et l'orientation sur la carte.

### Courses : ordre et effectifs

- **Ordre des courses** (rubrique « Votre trail ») : flèches ↑ ↓ ou glisser-déposer par la poignée ⠿ (souris et doigt, défilement automatique près des bords). L'ordre est enregistré dans l'événement (`moveRace`) et repris partout : logistique, bénévoles, PDF, CSV, documents.
- **Participants prévus par course** : champ avec boutons − / + (par dizaine), affiché en tête de chaque course à côté du nom et de la distance. Le total de l'événement est la somme des courses (`totalParticipants`) — il dimensionne le dispositif médical et le dossier administratif ; les anciens événements gardent leur effectif global tant qu'aucune course n'a d'effectif.
- **Réutilisation dans la logistique** : effectif de chaque course dans la sélection et le résumé ; sur chaque poste, « ≈ N coureurs » attendus = somme des courses qui y passent, poste commun compris (`runnersAt`) ; repris dans la couverture des postes, la colonne « Coureurs attendus au poste » du CSV, les fiches bénévoles et les cartes PDF. Aucun ratio de matériel ou de bénévoles n'est inventé : l'effectif est donné pour que l'organisateur dimensionne lui-même.
- La ligne « Signaleurs aux traversées » a été retirée de la génération automatique (rubrique Analyse), ainsi que ses mentions dans les textes associés.

### Analyse cadastrale et réglementaire (Organisation Trail › Analyse)

- **Individuelle ou globale** : chaque parcours de l'événement a son bouton « Analyser / Relancer » ; « Analyser tous les parcours » les enchaîne. Deux courses sur le même tracé sont regroupées (analysé et compté une seule fois). Un parcours hors événement reste analysable. Les résultats sont mémorisés par parcours (`crete:cadastre:<id>`, sans les contours) et signalés « à relancer » dès que le tracé change (`routeSig`).
- **Calcul exact** (`intervalsInside`) : chaque segment du tracé est coupé à chaque bord de parcelle ou de zone ; la distance sur une parcelle est sa vraie longueur (une bande de 1 m traversée compte 1 m). Les parcelles étant jointives, la somme des distances + la part « hors parcelles » (voirie, cours d'eau non cadastrés) = longueur du parcours, vérifiée dans les exports. Les parcelles seulement touchées (tracé sur la limite) sont listées à part, sans distance.
- **Zonages** : Natura 2000 (SIC/ZSC, ZPS), parcs nationaux (cœur / aire d'adhésion), PNR, réserves naturelles nationales et régionales, arrêtés de protection de biotope et d'habitat naturel, réserves biologiques, ZNIEFF 1 et 2 (INPN / PatriNat via le WFS de la Géoplateforme) et forêts publiques (BD TOPO). Requête large (tracé simplifié + 25 m), puis distance exacte sur le tracé d'origine. Trois niveaux, jamais présentés comme une interdiction : « réglementation spécifique à consulter », « démarche possible » (évaluation des incidences Natura 2000, accord ONF), « zone de vigilance ». Chaque zone renvoie à sa fiche officielle.
- **Par parcelle** : référence (INSEE, section, numéro, IDU, commune absorbée, feuille), commune, surface cadastrale, entrée (km), distance sur la parcelle, nombre de passages, zonages traversés sur la parcelle.
- **Synthèse de l'événement** (`synthesize`) : chaque parcelle une seule fois (clé IDU), parcours concernés et distance de chacun, distance cumulée, parcelles communes à plusieurs parcours, communes, zonages fusionnés.
- **Exports** : CSV et PDF détaillés par parcours (PDF : kilomètre d'entrée et distance sur chaque parcelle, sans colonne de zonage — les zonages ont leur propre tableau) ; CSV de synthèse (une colonne par parcours) et PDF de synthèse avec le détail de chaque parcours en annexe.
- **Robustesse** : délai maximal de 30 s par requête, 5 essais espacés (pages de métriques renvoyées par certains nœuds de la Géoplateforme), seconde tentative différée des couches de zonage ; une couche ou la BD TOPO indisponible est signalée sans bloquer le reste.
