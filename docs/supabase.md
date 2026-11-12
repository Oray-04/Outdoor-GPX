# Activer les comptes et la synchronisation (Supabase)

Sans cette étape, le site fonctionne **en local** : tout est enregistré dans le navigateur. Avec Supabase, vous obtenez : comptes, synchronisation entre appareils (ordinateur, téléphone), publication de parcours visibles de tous, calque « Communauté ».

Supabase a une offre gratuite suffisante pour un usage personnel. (Un projet gratuit inactif peut être mis en pause : il se réactive depuis le tableau de bord.)

## 1. Créer le projet

1. Allez sur **supabase.com**, créez un compte (le plus simple : « Continue with GitHub »).
2. **New project** : choisissez un nom (ex. `crete`), un mot de passe de base de données (notez-le, vous n'en aurez normalement pas besoin), une région proche (ex. `West EU (Paris)` ou `Frankfurt`), puis **Create new project**. Attendez 1 à 2 minutes.

## 2. Créer les tables

1. Dans le menu de gauche, ouvrez **SQL Editor** > **New query**.
2. Ouvrez le fichier `supabase/migrations/20261103000000_init.sql` de ce dépôt, copiez **tout** son contenu, collez-le dans l'éditeur et cliquez sur **Run** (message attendu : « Success. No rows returned »).
3. Faites de même, **dans cet ordre**, avec `supabase/migrations/20261104000000_public_content.sql` (nouvelle requête, coller, Run).

Ces scripts créent : les profils, les documents privés synchronisés, les parcours publiés (avec PostGIS), les événements et collections publics, et toutes les règles d'accès (RLS) : chaque utilisateur ne voit que ses données ; seuls les contenus explicitement publiés sont lisibles par tous.

## 3. Configurer les adresses de connexion

Dans **Authentication > URL Configuration** :
- **Site URL** : `https://oray-04.github.io/Outdoor-GPX/`
- **Redirect URLs** : ajoutez `https://oray-04.github.io/Outdoor-GPX/**` (et `http://localhost:3000/**` si vous développez en local).

Dans **Authentication > Providers > Email** : laissez l'e-mail activé. « Confirm email » activé est le plus sûr ; désactivé, l'inscription est immédiate (pratique pour un usage perso).

## 4. Récupérer les deux valeurs du site

Dans **Project Settings > API** (ou « Data API ») :
- **Project URL** : `https://xxxxxxxx.supabase.co`
- **anon public** key (longue clé commençant par `eyJ…`)

> La clé **anon** est faite pour être publique : elle est visible dans le site. La sécurité vient des règles d'accès de la base. **Ne copiez jamais la clé `service_role`**, qui donne tous les pouvoirs.

## 5. Les donner au site publié (GitHub Pages)

1. Dans le dépôt GitHub : **Settings > Secrets and variables > Actions**.
2. Ouvrez l'onglet **Variables** (pas « Secrets ») > **New repository variable**.
3. Créez deux variables :
   - `NEXT_PUBLIC_SUPABASE_URL` = votre Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = votre clé anon
4. Onglet **Actions** > « Publier sur GitHub Pages » > **Run workflow**.

Une fois le déploiement terminé, le site affiche un bouton **Connexion** et la page **Mon espace** montre l'état de synchronisation.

## 6. Premier compte et administrateur

1. Sur le site, **Connexion > Créer un compte**.
2. À la première connexion, vos données locales sont envoyées vers votre compte ; sur un autre appareil, connectez-vous pour les retrouver.
3. Pour devenir **administrateur** (modération des parcours publics), dans le **SQL Editor** :
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'VOTRE_EMAIL');
   ```

## En local (développement)

Créez un fichier `.env.local` à la racine (voir `.env.example`) avec les deux variables, puis `npm run dev`.

## Ce qui est synchronisé

Parcours, activités, collections, avis, signalements, événements, favoris, profil, calques, types de terrain. **Non synchronisés** : photos (stockage local uniquement), bandeau d'annonce et réglages d'administration locale.
Règle de conflit : la modification la plus récente gagne (horloge de l'appareil).

## Tests

- `bash supabase/tests/rls.sh` : applique la migration sur une base PostgreSQL + PostGIS locale jetable et vérifie 45 règles d'accès (isolation entre utilisateurs, protection de `is_admin`, lecture publique, recherche par emprise, événements et collections publics, modération…).
- `npm test` : logique de synchronisation (conflits, suppressions, deux appareils) et requêtes du client contre une API simulée.

Limite connue : le code n'a pas encore été essayé contre un vrai projet Supabase (création de compte, e-mails de confirmation, requêtes réelles). Les premières connexions sont donc à vérifier ; en cas d'erreur, le message s'affiche dans **Mon espace > Compte et synchronisation**.


## Migration du 12/11 (audit)

`20261112000000_profiles_columns.sql` : la colonne `is_admin` des profils n'est plus lisible publiquement (lecture limitée à `id`, `display_name`, `bio`, `created_at`) ; l'application lit le statut de l'utilisateur connecté par `rpc("is_admin")`. Aucune donnée modifiée. Retour arrière : `grant select on public.profiles to anon, authenticated;`. À appliquer après les deux premières. Tests : `bash supabase/tests/rls.sh` (48 vérifications).
