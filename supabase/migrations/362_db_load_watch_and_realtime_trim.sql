-- 362 (7 Oct 2026): THE PLATFORM WENT DOWN FOR 25 MINUTES (17:20-17:44 UTC) AND NOTHING WAS LEFT TO SAY WHY.
-- Every request timed out for every user; the restart that brought it back also wiped pg_stat_statements, so the
-- query that tipped it over could not be named afterwards. The instance was a 0.5 GB Nano on a Pro organisation
-- (upgraded to Micro the same evening). This keeps the evidence and takes two idle tables off the realtime feed.

-- 1. AN HOURLY SNAPSHOT OF THE HEAVIEST STATEMENTS, kept 14 days. Cumulative counters since the last reset, so the
--    difference between two snapshots is what that hour did. Cheap: <=30 rows an hour, ~10k rows at the cap.
create table if not exists public.ops_stat_snapshots (
  taken_at timestamptz not null default now(),
  stats_since timestamptz,
  queryid bigint,
  query text,
  calls bigint,
  total_ms double precision,
  rows bigint,
  blks_read bigint,
  blks_dirtied bigint,
  blks_written bigint,
  temp_written bigint,
  wal_bytes numeric
);
create index if not exists ops_stat_snapshots_taken_idx on public.ops_stat_snapshots (taken_at desc);
alter table public.ops_stat_snapshots enable row level security;
revoke all on public.ops_stat_snapshots from anon, authenticated;

create or replace function public.ops_snapshot_stats()
returns integer language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare n integer;
begin
  insert into public.ops_stat_snapshots
    (stats_since, queryid, query, calls, total_ms, rows, blks_read, blks_dirtied, blks_written, temp_written, wal_bytes)
  select (select stats_reset from extensions.pg_stat_statements_info), s.queryid, left(s.query, 500), s.calls,
         s.total_exec_time, s.rows, s.shared_blks_read, s.shared_blks_dirtied, s.shared_blks_written,
         s.temp_blks_written, s.wal_bytes
    from extensions.pg_stat_statements s
   order by s.total_exec_time + (s.shared_blks_read + s.shared_blks_dirtied) * 0.1 desc
   limit 30;
  get diagnostics n = row_count;
  delete from public.ops_stat_snapshots where taken_at < now() - interval '14 days';
  return n;
end;
$function$;
revoke all on function public.ops_snapshot_stats() from public, anon, authenticated;

select cron.schedule('ops-snapshot-stats', '55 * * * *', 'select public.ops_snapshot_stats();');

-- 2. Realtime decodes every change to every table in the publication, subscribed to or not. Nothing in the app
--    listens to these two (checked: no postgres_changes on either), so their writes were work for nobody.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_invites') then
    alter publication supabase_realtime drop table public.conversation_invites;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_rsvps') then
    alter publication supabase_realtime drop table public.event_rsvps;
  end if;
end $$;
