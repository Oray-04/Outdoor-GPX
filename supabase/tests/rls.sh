#!/usr/bin/env bash
# Teste la migration et les règles d'accès (RLS) sur une base PostgreSQL + PostGIS LOCALE jetable.
# Usage : bash supabase/tests/rls.sh      (nécessite postgresql-16 et postgresql-16-postgis-3)
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d); chmod 755 "$DIR"; chown postgres "$DIR" 2>/dev/null || true
PORT=${PGPORT:-54329}
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
as_pg "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
as_pg "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'as_pg "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true; rm -rf "$DIR"' EXIT
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q -X"
as_pg "$PSQL -d postgres -c 'create database crete'" >/dev/null
RUN="as_pg"
run() { as_pg "$PSQL -d crete -f $1"; }

# Simulation minimale de l'environnement Supabase (auth.users, auth.uid(), rôles)
cat > "$DIR/stub.sql" <<'SQL'
create schema auth; create schema if not exists extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  create role anon nologin; create role authenticated nologin;
end $$;
grant usage on schema public, extensions to anon, authenticated;
grant usage on schema auth to anon, authenticated;
alter database crete set search_path = "$user", public, extensions;
SQL
chmod 644 "$DIR/stub.sql"; cat supabase/migrations/*.sql > "$DIR/mig.sql"; cp supabase/tests/rls.sql "$DIR/rls.sql"; chmod 644 "$DIR"/*.sql
as_pg "$PSQL -d crete -f $DIR/stub.sql"
as_pg "psql -h $DIR -p $PORT -U postgres -d crete -v ON_ERROR_STOP=1 -q -X -c 'select 1'" >/dev/null
as_pg "$PSQL -d crete -f $DIR/mig.sql"
as_pg "psql -h $DIR -p $PORT -U postgres -d crete -v ON_ERROR_STOP=0 -X -A -t -f $DIR/rls.sql" 2>&1 | tee "$DIR/out.txt"
echo "----"
if grep -qE '^FAIL|ERROR' "$DIR/out.txt"; then echo "ÉCHEC : voir les lignes FAIL / ERROR"; exit 1; fi
echo "OK : $(grep -c '^PASS' "$DIR/out.txt") vérifications réussies"
