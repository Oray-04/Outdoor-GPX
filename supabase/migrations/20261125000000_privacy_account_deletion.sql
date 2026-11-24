-- Crête — conformité RGPD
-- 1) Le profil public ne reprend plus la partie de l'adresse e-mail avant « @ » (elle était lisible par tous) :
--    nom affiché vide par défaut, et vidé pour les profils existants qui l'avaient reçu automatiquement.
-- 2) Suppression de son compte par l'utilisateur lui-même (droit à l'effacement, art. 17 RGPD) :
--    supprime l'utilisateur ; profils, documents synchronisés, parcours, événements et collections publiés
--    sont effacés en cascade (clés étrangères « on delete cascade »).

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, '') on conflict (id) do nothing;
  return new;
end $$;

update public.profiles p set display_name = ''
from auth.users u
where u.id = p.id and p.display_name <> '' and p.display_name = split_part(u.email, '@', 1);

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Non authentifié' using errcode = '28000'; end if;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
