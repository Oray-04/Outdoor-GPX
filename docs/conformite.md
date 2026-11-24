# Conformité légale — état au 24 novembre 2026

Cas retenu : **particulier en France, site non professionnel, gratuit, sans vente ni publicité**, éditeur **anonyme** (LCEN art. 1-1 III), hébergement des pages chez **OVHcloud** (prévu), comptes et synchronisation chez **Supabase (région Paris)**, ouvert aux agents IA, 0 salarié / 0 € de chiffre d'affaires.

Toutes les informations d'identification sont centralisées dans `src/lib/legal.ts` ; les services externes dans `src/lib/third-parties.ts` (à tenir alignés avec `src/lib/csp.ts`).

## À faire par un humain avant la mise en ligne

1. **Adresse e-mail de contact** : remplacer `contactEmail` dans `src/lib/legal.ts` (adresse réellement consultée : elle reçoit les demandes RGPD et les signalements de contenus illicites).
2. **Hébergeur des pages** : le dépôt publie aujourd'hui sur **GitHub Pages** (GitHub Inc., États-Unis). Tant que le site n'est pas sur OVHcloud, les mentions légales sont inexactes : soit déployer chez OVHcloud, soit remplacer l'hébergeur dans `legal.ts` par GitHub (GitHub Inc., 88 Colin P. Kelly Jr Street, San Francisco, CA 94107, États-Unis) et ajouter le transfert hors UE dans la politique de confidentialité. Vérifier aussi l'adresse et le téléphone d'OVH SAS (renseignés : 2 rue Kellermann, 59100 Roubaix ; 1007).
3. **Anonymat** : communiquer son identité complète à l'hébergeur (c'est la condition de l'anonymat) ; l'anonymat ne vaut que tant que le site reste non professionnel (pas de revenus, pas de publicité).
4. **Supabase** : créer le projet en **région Paris (eu-west-3)** ; compléter l'adresse postale de Supabase, Inc. dans `legal.ts` ; vérifier que l'accord de traitement des données (DPA, avec clauses contractuelles types) est accepté dans le tableau de bord ; appliquer la migration `20261125000000_privacy_account_deletion.sql`.
5. **Mesure d'audience** (vous en souhaitez une) : choisir un outil **exempté de consentement** selon la CNIL (par exemple Matomo auto-hébergé ou en Europe, configuré selon la liste CNIL : IP anonymisée, pas de recoupement, cookies ≤ 13 mois), ce qui évite tout bandeau. Un outil non exempté (Google Analytics…) imposerait un bandeau « Tout accepter / Tout refuser » avant tout chargement et la mise à jour des pages Cookies et Confidentialité.
6. **Durée de conservation des comptes inactifs** : décider d'une purge (ex. suppression après 3 ans sans connexion, avec e-mail d'avertissement) ; elle n'est pas automatisée aujourd'hui (comptes conservés jusqu'à suppression par l'utilisateur).
7. **Libellé « Officiel vérifié »** (bibliothèque, fiche parcours) : risque de laisser croire à un label d'une fédération ou d'un gestionnaire. Proposition : « Vérifié par l'éditeur ».
8. **Conditions des services gratuits** : relire les politiques d'usage d'OpenStreetMap (tuiles, Nominatim : 1 requête/s, pas d'usage intensif), d'Open-Meteo (gratuit pour usage non commercial, attribution CC BY 4.0), de FOSSGIS (Valhalla, Overpass) et de Thunderforest (clé personnelle) ; en cas de fréquentation importante, prévoir des serveurs propres ou payants.
9. **Relecture** : faire relire l'ensemble par un juriste si le site devient professionnel (revenus, publicité, offres payantes) — CGV, médiateur et identité complète deviendraient alors obligatoires.

## Points jugés non applicables

- **CGV** : aucune vente.
- **Médiateur de la consommation** : obligatoire seulement en cas de vente à des consommateurs.
- **Bandeau cookies** : aucun traceur non nécessaire (pas d'analytics, pas de publicité, pas de vidéo ni de police externe) ; seul le stockage strictement nécessaire est utilisé.
- **Déclaration d'accessibilité** : depuis le 28 juin 2025 (Acte européen d'accessibilité transposé), obligatoire pour les services de commerce en ligne, sauf micro-entreprises (moins de 10 salariés et moins de 2 M€) ; ici, ni vente ni entreprise : recommandée seulement. Audit axe-core (WCAG 2.1 A/AA) : 0 violation sur 14 pages.

## Contrôles

- `bash supabase/tests/rls.sh` : 52 vérifications (dont suppression de compte et profil sans fragment d'e-mail).
- `npx vitest run` : tests unitaires.
