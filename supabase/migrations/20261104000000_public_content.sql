-- Crête — contenus publics : événements et collections de parcours
-- Lisibles par tous ; modifiables uniquement par leur propriétaire (suppression aussi par un administrateur).

create table public.public_events (
  id               text primary key check (char_length(id) between 3 and 80),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 160),
  organizer        text not null default '' check (char_length(organizer) <= 160),
  date             date not null,
  place            text not null default '' check (char_length(place) <= 160),
  region           text not null default '' check (char_length(region) <= 120),
  description      text not null default '' check (char_length(description) <= 5000),
  rules            text not null default '' check (char_length(rules) <= 10000),
  practical        text not null default '' check (char_length(practical) <= 5000),
  registration_url text not null default '' check (registration_url = '' or registration_url ~* '^https?://'),
  -- formats de course : [{id,label,sport,distanceKm,gainM,startTime,maxHours,routeId,fee}]
  races            jsonb not null default '[]' check (jsonb_typeof(races) = 'array' and jsonb_array_length(races) <= 30),
  collection_id    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index public_events_date on public.public_events (date);
create index public_events_owner on public.public_events (owner_id);

create table public.public_collections (
  id          text primary key check (char_length(id) between 3 and 80),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  route_ids   text[] not null default '{}' check (coalesce(array_length(route_ids, 1), 0) <= 100),
  event_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index public_collections_owner on public.public_collections (owner_id);

alter table public.public_events enable row level security;
create policy public_events_read   on public.public_events for select using (true);
create policy public_events_insert on public.public_events for insert with check (owner_id = auth.uid());
create policy public_events_update on public.public_events for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy public_events_delete on public.public_events for delete using (owner_id = auth.uid() or public.is_admin());

alter table public.public_collections enable row level security;
create policy public_collections_read   on public.public_collections for select using (true);
create policy public_collections_insert on public.public_collections for insert with check (owner_id = auth.uid());
create policy public_collections_update on public.public_collections for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy public_collections_delete on public.public_collections for delete using (owner_id = auth.uid() or public.is_admin());

revoke all on public.public_events, public.public_collections from anon, authenticated;
grant select on public.public_events, public.public_collections to anon, authenticated;
grant insert, update, delete on public.public_events, public.public_collections to authenticated;

-- Parcours publiés d'une liste d'identifiants (sans géométrie : pour les listes et les cartes de collection, version simplifiée)
create function public.public_routes_by_ids(ids text[])
returns table (id text, name text, sport text, region text, country text, distance_m real, gain_m real, loss_m real, min_ele real, max_ele real, owner_id uuid, geometry jsonb)
language sql stable security invoker set search_path = public, extensions as $$
  select r.id, r.name, r.sport, r.region, r.country, r.distance_m, r.gain_m, r.loss_m, r.min_ele, r.max_ele, r.owner_id,
         st_asgeojson(st_simplifypreserveTopology(r.geom, 0.0002))::jsonb
  from public.public_routes r
  where r.id = any(ids)
  limit 100
$$;
grant execute on function public.public_routes_by_ids(text[]) to anon, authenticated;
