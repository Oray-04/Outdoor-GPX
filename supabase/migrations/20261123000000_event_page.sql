-- Crête — page publique personnalisée d'un événement (bandeau, couleurs, blocs).
-- Modifiable uniquement par le propriétaire (politique d'écriture existante de public_events) ; taille bornée (image de bandeau incluse).
alter table public.public_events add column if not exists page jsonb
  check (page is null or (jsonb_typeof(page) = 'object' and pg_column_size(page) <= 800000));
