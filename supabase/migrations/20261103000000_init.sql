-- Crête — schéma initial (Supabase / PostgreSQL + PostGIS)
-- Principes : accès refusé par défaut, chaque utilisateur ne voit que ses données (RLS),
-- seuls les parcours explicitement publiés sont lisibles par tous.

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ───────────────────────── Profils ─────────────────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  bio          text not null default '' check (char_length(bio) <= 300),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Création automatique du profil à l'inscription
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Aide aux politiques : l'utilisateur courant est-il administrateur ?
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
-- Un utilisateur ne peut modifier que son nom et sa présentation (jamais is_admin).
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name, bio) on public.profiles to authenticated;

-- ───────────────── Documents privés synchronisés ─────────────────
-- Un document = un élément de l'application (parcours, activité, collection, événement, favoris…)
create table public.documents (
  owner_id   uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('routes','activities','collections','reviews','reports','events','favorites','profile','layers','terrains')),
  id         text not null check (char_length(id) between 1 and 80),
  data       jsonb not null check (pg_column_size(data) < 8000000),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (owner_id, kind, id)
);
create index documents_owner_updated on public.documents (owner_id, updated_at);

-- Horodatage fourni par le client (résolution des conflits), mais jamais dans le futur.
create function public.clamp_updated_at() returns trigger language plpgsql as $$
begin
  if new.updated_at is null or new.updated_at > now() then new.updated_at := now(); end if;
  return new;
end $$;
create trigger documents_clamp before insert or update on public.documents
  for each row execute function public.clamp_updated_at();

alter table public.documents enable row level security;
create policy documents_owner on public.documents for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.documents from anon, authenticated;
grant select, insert, update, delete on public.documents to authenticated;

-- ───────────────── Parcours publiés (lisibles par tous) ─────────────────
create table public.public_routes (
  id          text primary key check (char_length(id) between 3 and 80),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  sport       text not null,
  region      text not null default '',
  country     text not null default '',
  distance_m  real not null check (distance_m >= 0),
  gain_m      real not null default 0,
  loss_m      real not null default 0,
  min_ele     real not null default 0,
  max_ele     real not null default 0,
  description text not null default '' check (char_length(description) <= 2000),
  geom        extensions.geometry(LineStringZ, 4326) not null check (extensions.st_npoints(geom) between 2 and 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index public_routes_geom_gix on public.public_routes using gist (geom);
create index public_routes_owner on public.public_routes (owner_id);

alter table public.public_routes enable row level security;
create policy public_routes_read on public.public_routes for select using (true);
create policy public_routes_insert on public.public_routes for insert with check (owner_id = auth.uid());
create policy public_routes_update on public.public_routes for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy public_routes_delete on public.public_routes for delete using (owner_id = auth.uid() or public.is_admin());
revoke all on public.public_routes from anon, authenticated;
grant select on public.public_routes to anon, authenticated;
grant insert, update, delete on public.public_routes to authenticated;

-- Parcours publiés dans une emprise (géométrie simplifiée pour l'affichage sur carte)
create function public.public_routes_in_bbox(west double precision, south double precision, east double precision, north double precision, max_rows int default 200)
returns table (id text, name text, sport text, distance_m real, gain_m real, owner_id uuid, geometry jsonb)
language sql stable security invoker set search_path = public, extensions as $$
  select r.id, r.name, r.sport, r.distance_m, r.gain_m, r.owner_id,
         st_asgeojson(st_simplifypreserveTopology(r.geom, 0.0002))::jsonb
  from public.public_routes r
  where r.geom && st_makeenvelope(west, south, east, north, 4326)
  order by r.updated_at desc
  limit least(greatest(max_rows, 1), 500)
$$;
grant execute on function public.public_routes_in_bbox(double precision, double precision, double precision, double precision, int) to anon, authenticated;

-- Parcours publié complet (avec altitudes) pour la fiche
create function public.public_route_geojson(route_id text)
returns table (id text, name text, sport text, region text, country text, description text, distance_m real, gain_m real, loss_m real, min_ele real, max_ele real, owner_id uuid, geometry jsonb)
language sql stable security invoker set search_path = public, extensions as $$
  select r.id, r.name, r.sport, r.region, r.country, r.description, r.distance_m, r.gain_m, r.loss_m, r.min_ele, r.max_ele, r.owner_id, st_asgeojson(r.geom)::jsonb
  from public.public_routes r where r.id = route_id
$$;
grant execute on function public.public_route_geojson(text) to anon, authenticated;
