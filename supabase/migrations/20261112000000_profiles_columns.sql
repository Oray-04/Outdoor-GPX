-- Audit du 12/11 : la colonne is_admin des profils était lisible par tout le monde (y compris sans compte).
-- On restreint la lecture publique aux colonnes d'affichage ; chacun connaît son propre statut via public.is_admin().
-- Aucune donnée n'est modifiée ni supprimée.
-- Retour arrière : grant select on public.profiles to anon, authenticated;
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, bio, created_at) on public.profiles to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
