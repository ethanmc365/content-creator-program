-- REWRITE STORED FILE ADDRESSES AFTER A MOVE (docs/MOVING_TO_TRYP_INFRASTRUCTURE.md, section 5).
--
-- Photos, thumbnails and chat media are stored as absolute URLs that start with the OLD project's address. After the
-- files have been copied to the new project, run this against the NEW database to point them at the new address.
--
-- It finds the columns itself: every text/varchar/json/jsonb/array column in `public` that holds the old address, so a
-- column added after this was written is not missed (21 Oct 2026: 12 columns, ~3,100 rows; the biggest are
-- creator_photos.photo_url, submissions.thumbnail_url, vip_videos.thumbnail_url, profiles.photo_url).
--
-- Usage (psql):
--   psql "$NEW_DB_URL" -v old='https://heuhqqoxyggawuckxocp.supabase.co' -v new='https://<new-ref>.supabase.co' \
--        -v apply=0 -f scripts/rewrite-storage-urls.sql      -- dry run: lists what it would change, changes nothing
--   ... -v apply=1 ...                                         -- does it
--
-- Triggers are off for the session (session_replication_role = replica), so no notification, rescoring or audit row
-- fires for an address change. Everything runs in one transaction: it either all lands or none of it does.

\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
select set_config('rewrite.old', :'old', true), set_config('rewrite.new', :'new', true), set_config('rewrite.apply', :'apply', true);

do $$
declare
  old_host text := current_setting('rewrite.old');
  new_host text := current_setting('rewrite.new');
  apply boolean := current_setting('rewrite.apply') = '1';
  r record;
  n bigint;
  total bigint := 0;
begin
  if old_host = '' or new_host = '' or old_host = new_host then
    raise exception 'Pass -v old=... and -v new=... (two different addresses)';
  end if;
  for r in
    select c.table_name, c.column_name, c.data_type, c.udt_name
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'character varying', 'json', 'jsonb', 'ARRAY')
     order by 1, 2
  loop
    execute format('select count(*) from public.%I where %I::text like %L', r.table_name, r.column_name, '%' || old_host || '%')
      into n;
    continue when n = 0;
    total := total + n;
    raise notice '% %.% rows=%', case when apply then 'rewrote' else 'would rewrite' end, r.table_name, r.column_name, n;
    if apply then
      -- Cast to text, replace, cast back to the column's own type (text[], jsonb ... all round-trip through text).
      execute format('update public.%I set %I = replace(%I::text, %L, %L)::%s where %I::text like %L',
        r.table_name, r.column_name, r.column_name, old_host, new_host,
        case when r.data_type = 'ARRAY' then quote_ident(substr(r.udt_name, 2)) || '[]'
             when r.data_type = 'character varying' then 'text'
             else r.data_type end,
        r.column_name, '%' || old_host || '%');
    end if;
  end loop;
  raise notice '% rows in total (%)', total, case when apply then 'applied' else 'dry run, nothing changed' end;
end $$;

commit;
