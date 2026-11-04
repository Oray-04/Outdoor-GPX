-- Tests des règles d'accès. Chaque ligne affichée commence par PASS ou FAIL.
create function public.t_try(q text) returns text language plpgsql as $$
begin execute q; return 'ok'; exception when others then return sqlstate; end $$;
create function public.t_rows(q text) returns int language plpgsql as $$
declare n int; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $$;
create function public.t_scalar(q text) returns text language plpgsql as $$
declare r text; begin execute q into r; return r; exception when others then return 'ERR:' || sqlstate; end $$;
grant execute on function public.t_try(text), public.t_rows(text), public.t_scalar(text) to anon, authenticated;
create function public.chk(name text, ok boolean) returns text language sql as $$ select case when ok then 'PASS ' || name else 'FAIL ' || name end $$;
grant execute on function public.chk(text, boolean) to anon, authenticated;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.org'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.org'),
  ('cccccccc-0000-0000-0000-000000000003', 'admin@example.org');
update public.profiles set is_admin = true where id = 'cccccccc-0000-0000-0000-000000000003';

select chk('profils créés automatiquement à l''inscription', (select count(*) from public.profiles) = 3);
select chk('nom d''affichage par défaut tiré de l''e-mail', (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'alice');

-- ───── Alice ─────
set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select chk('alice modifie son nom', public.t_rows($$update public.profiles set display_name = 'Alice' where id = auth.uid()$$) = 1);
select chk('alice ne peut pas se promouvoir admin', public.t_try($$update public.profiles set is_admin = true where id = auth.uid()$$) = '42501');
select chk('alice ne modifie pas le profil de bob', public.t_rows($$update public.profiles set display_name = 'x' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$) = 0);
select chk('alice crée un document', public.t_try($$insert into public.documents (owner_id, kind, id, data) values (auth.uid(), 'routes', 'r1', '{"name":"Boucle"}')$$) = 'ok');
select chk('type de document inconnu refusé', public.t_try($$insert into public.documents (owner_id, kind, id, data) values (auth.uid(), 'pirate', 'r1', '{}')$$) = '23514');
select chk('alice ne peut pas écrire chez bob', public.t_try($$insert into public.documents (owner_id, kind, id, data) values ('bbbbbbbb-0000-0000-0000-000000000002', 'routes', 'r9', '{}')$$) = '42501');
select chk('horodatage futur ramené à maintenant', public.t_scalar($$with x as (insert into public.documents (owner_id, kind, id, data, updated_at) values (auth.uid(), 'routes', 'r2', '{}', '2999-01-01') returning updated_at) select (updated_at <= now())::text from x$$) = 'true');
select chk('alice publie un parcours', public.t_try($$insert into public.public_routes (id, owner_id, name, sport, distance_m, geom) values ('route-alice-1', auth.uid(), 'Crête publique', 'trail', 1500, 'SRID=4326;LINESTRING Z (6.87 45.92 1000, 6.88 45.93 1100, 6.89 45.94 1200)')$$) = 'ok');
select chk('alice ne publie pas au nom de bob', public.t_try($$insert into public.public_routes (id, owner_id, name, sport, distance_m, geom) values ('route-x', 'bbbbbbbb-0000-0000-0000-000000000002', 'x', 'trail', 1, 'SRID=4326;LINESTRING Z (0 0 0, 1 1 1)')$$) = '42501');
select chk('géométrie 2D refusée (altitude obligatoire)', public.t_try($$insert into public.public_routes (id, owner_id, name, sport, distance_m, geom) values ('route-2d', auth.uid(), 'x', 'trail', 1, 'SRID=4326;LINESTRING (0 0, 1 1)')$$) <> 'ok');

-- ───── Bob ─────
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select chk('bob ne voit aucun document d''alice', (select count(*) from public.documents) = 0);
select chk('bob ne modifie pas un document d''alice', public.t_rows($$update public.documents set data = '{}' where id = 'r1'$$) = 0);
select chk('bob ne supprime pas un document d''alice', public.t_rows($$delete from public.documents where id = 'r1'$$) = 0);
select chk('bob voit le parcours publié d''alice', (select count(*) from public.public_routes) = 1);
select chk('bob ne modifie pas le parcours d''alice', public.t_rows($$update public.public_routes set name = 'piraté' where id = 'route-alice-1'$$) = 0);
select chk('bob ne supprime pas le parcours d''alice', public.t_rows($$delete from public.public_routes where id = 'route-alice-1'$$) = 0);

-- ───── Anonyme ─────
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select chk('anonyme : documents interdits', public.t_try($$select * from public.documents$$) = '42501');
select chk('anonyme : lecture des parcours publiés', (select count(*) from public.public_routes) = 1);
select chk('anonyme : écriture interdite', public.t_try($$insert into public.public_routes (id, owner_id, name, sport, distance_m, geom) values ('route-anon', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'trail', 1, 'SRID=4326;LINESTRING Z (0 0 0, 1 1 1)')$$) = '42501');
select chk('emprise : trouve le parcours', (select count(*) from public.public_routes_in_bbox(6.8, 45.9, 6.95, 45.99)) = 1);
select chk('emprise : exclut un parcours éloigné', (select count(*) from public.public_routes_in_bbox(2.0, 48.0, 2.5, 48.5)) = 0);
select chk('emprise : géométrie GeoJSON LineString', (select (geometry->>'type') from public.public_routes_in_bbox(6.8, 45.9, 6.95, 45.99) limit 1) = 'LineString');
select chk('fiche : coordonnées avec altitude (3 valeurs)', (select jsonb_array_length(geometry->'coordinates'->0) from public.public_route_geojson('route-alice-1')) = 3);
select chk('anonyme : profils lisibles (auteur affichable)', (select count(*) from public.profiles) = 3);
select chk('anonyme : ne peut pas modifier un profil', public.t_rows($$update public.profiles set display_name = 'x'$$) = -1);

-- ───── Contenus publics : événements et collections ─────
reset role; set role authenticated; select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select chk('alice publie un événement', public.t_try($$insert into public.public_events (id, owner_id, name, organizer, date, races) values ('ev-alice-1', auth.uid(), 'Trail du Test', 'Asso', '2027-05-01', '[{"id":"r1","label":"10 km","routeId":"route-alice-1"}]')$$) = 'ok');
select chk('alice publie une collection', public.t_try($$insert into public.public_collections (id, owner_id, title, route_ids, event_id) values ('col-alice-1', auth.uid(), 'Parcours du Trail', array['route-alice-1','route-alice-2'], 'ev-alice-1')$$) = 'ok');
select chk('alice ne publie pas au nom de bob (événement)', public.t_try($$insert into public.public_events (id, owner_id, name, date) values ('ev-x', 'bbbbbbbb-0000-0000-0000-000000000002', 'x', '2027-01-01')$$) = '42501');
select chk('lien d''inscription non http(s) refusé', public.t_try($$insert into public.public_events (id, owner_id, name, date, registration_url) values ('ev-js', auth.uid(), 'x', '2027-01-01', 'javascript:alert(1)')$$) = '23514');
select chk('plus de 100 parcours dans une collection refusé', public.t_try($$insert into public.public_collections (id, owner_id, title, route_ids) values ('col-big', auth.uid(), 'x', (select array_agg('r' || g) from generate_series(1, 101) g))$$) = '23514');
select chk('races doit être un tableau', public.t_try($$insert into public.public_events (id, owner_id, name, date, races) values ('ev-bad', auth.uid(), 'x', '2027-01-01', '{"a":1}')$$) = '23514');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select chk('bob lit l''événement et la collection d''alice', (select count(*) from public.public_events) = 1 and (select count(*) from public.public_collections) = 1);
select chk('bob ne modifie pas l''événement d''alice', public.t_rows($$update public.public_events set name = 'piraté'$$) = 0);
select chk('bob ne supprime pas la collection d''alice', public.t_rows($$delete from public.public_collections$$) = 0);
reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);
select chk('anonyme : lecture des événements et collections', (select count(*) from public.public_events) = 1 and (select count(*) from public.public_collections) = 1);
select chk('anonyme : écriture refusée', public.t_try($$insert into public.public_collections (id, owner_id, title) values ('col-anon', 'aaaaaaaa-0000-0000-0000-000000000001', 'x')$$) = '42501');
select chk('parcours d''une collection par identifiants', (select count(*) from public.public_routes_by_ids(array['route-alice-1','route-inconnu'])) = 1);
select chk('géométrie simplifiée renvoyée', (select geometry->>'type' from public.public_routes_by_ids(array['route-alice-1'])) = 'LineString');

-- ───── Administrateur ─────
reset role; set role authenticated; select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select chk('admin : ne voit toujours pas les documents privés', (select count(*) from public.documents) = 0);
select chk('admin : supprime un événement publié (modération)', public.t_rows($$delete from public.public_events where id = 'ev-alice-1'$$) = 1);
select chk('admin : supprime une collection publiée (modération)', public.t_rows($$delete from public.public_collections where id = 'col-alice-1'$$) = 1);
select chk('admin : supprime un parcours publié (modération)', public.t_rows($$delete from public.public_routes where id = 'route-alice-1'$$) = 1);
reset role;
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select chk('suppression d''un compte supprime ses documents et parcours', (select count(*) from public.documents) = 0 and (select count(*) from public.public_routes) = 0);
