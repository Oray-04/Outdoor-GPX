-- Crête — carte des coureurs publiée avec l'événement : points utiles aux participants (déjà filtrés sur l'appareil
-- de l'organisateur : aucun poste interne, effectif ni consigne) et éventuelle carte importée. Taille bornée.
alter table public.public_events add column if not exists runner_map jsonb
  check (runner_map is null or (jsonb_typeof(runner_map) = 'object' and pg_column_size(runner_map) <= 1400000));
