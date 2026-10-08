-- 363 (8 Oct 2026): THE DAY AFTER THE OUTAGE. Two things.
--
-- 1. RESCORING WRITES ONLY WHAT CHANGED. Measured over the 14 hours after the 7 Oct restart: point_awards took
--    29,070 inserts and 29,042 deletes for ~460 live rows, and results 3,528 / 3,526 for ~55, because every
--    rescore wiped a challenge and wrote it again. Realtime's WAL poll (wal2json) has to decode every one of those
--    records and was 57% of all database time. Bodies below are the LIVE ones (pg_get_functiondef), edited, not
--    retyped: the award steps fill a temp table, and only the difference reaches point_awards / results.
--
-- 2. AN EARLY WARNING. ops_health_check() every five minutes measures what failed on 7 Oct (database busy time,
--    connections, stuck queries, lock waits, replication slot lag, cache hit rate, disk, the pg_net queue) and
--    opens a system fault per problem (source 'ops') that "On your desk" shows and that clears itself on recovery.
--    The owner gets one notification when a warning opens, not one every five minutes.

CREATE OR REPLACE FUNCTION public.recalc_challenge_points_internal(p_challenge uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_community uuid;
  v_mode      text;
  v_scoring   text;
  v_start     timestamptz;
  v_end       timestamptz;
  v_removed   integer := 0;
  v_added     integer := 0;
begin
  select community_id, threshold_mode, scoring, start_date, end_date
    into v_community, v_mode, v_scoring, v_start, v_end
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  -- 363: WORK OUT THE AWARDS FIRST, THEN WRITE ONLY THE DIFFERENCE. Every rescore used to delete and reinsert
  -- every auto award (29,000 rows in 14 hours for ~460 live awards), and realtime has to decode every one of
  -- those WAL records. The steps below are unchanged except that they fill pg_temp._pa_new.
  create temp table if not exists _pa_new (
    community_id uuid, challenge_id uuid, creator_id uuid, rule_id uuid, submission_id uuid,
    points numeric, reason text, is_auto boolean
  ) on commit delete rows;
  delete from pg_temp._pa_new;

  -- Per video posted, capped.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge and s.collab_of is null
  where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(s.id) * r.points, coalesce(r.max_points, count(s.id) * r.points)) > 0;

  -- View milestones, per video.
  if v_mode = 'cumulative' then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, s.creator_id, r.id, s.id, r.points, r.label, true
    from public.submissions s
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
     and coalesce(s.logged_views, 0) >= r.threshold
    where s.challenge_id = p_challenge and s.collab_of is null;
  else
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, submission_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, s.creator_id,
             r.id as rule_id, s.id as submission_id, r.points, r.label,
             row_number() over (partition by s.id order by r.threshold desc) as rn
      from public.submissions s
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
       and coalesce(s.logged_views, 0) >= r.threshold
      where s.challenge_id = p_challenge and s.collab_of is null
    ) ranked
    where rn = 1;
  end if;

  -- Total-views milestones, per creator.
  if v_mode = 'cumulative' then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from (
      select s.creator_id, coalesce(sum(s.logged_views), 0) as views
      from public.submissions s where s.challenge_id = p_challenge and s.collab_of is null
      group by s.creator_id
    ) t
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
     and t.views >= r.threshold;
  else
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select community_id, challenge_id, creator_id, rule_id, points, label, true
    from (
      select v_community as community_id, p_challenge as challenge_id, t.creator_id,
             r.id as rule_id, r.points, r.label,
             row_number() over (partition by t.creator_id order by r.threshold desc) as rn
      from (
        select s.creator_id, coalesce(sum(s.logged_views), 0) as views
        from public.submissions s where s.challenge_id = p_challenge and s.collab_of is null
        group by s.creator_id
      ) t
      join public.point_rules r
        on r.challenge_id = p_challenge and r.kind = 'total_views_threshold' and r.is_active
       and t.views >= r.threshold
    ) ranked
    where rn = 1;
  end if;

  -- Per platform posted on, capped.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
  select v_community, p_challenge, s.creator_id, r.id,
         least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)),
         r.label, true
  from public.point_rules r
  join public.submissions s on s.challenge_id = p_challenge and s.collab_of is null
  where r.challenge_id = p_challenge and r.kind = 'platform_spread' and r.is_active
    and coalesce(s.platform, '') <> ''
  group by v_community, s.creator_id, r.id, r.points, r.max_points, r.label
  having least(count(distinct s.platform) * r.points,
               coalesce(r.max_points, count(distinct s.platform) * r.points)) > 0;

  -- BONUSES: every claim, whoever made it (the creator's tick box or an admin
  -- on their behalf), gated on the entry's views and capped per creator per
  -- rule in submission order. A legacy hand-given award for the same rule
  -- counts towards the cap first.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, q.creator_id, q.rule_id, q.submission_id, q.award, q.label, true
  from (
    select b.*,
           case
             when b.max_points is null then b.points
             else greatest(0, least(b.points, b.max_points - b.manual - coalesce(b.prior, 0)))
           end as award
    from (
      select c.creator_id, r.id as rule_id, c.submission_id, r.label, r.points, r.max_points,
             coalesce((
               select sum(a.points) from public.point_awards a
                where a.challenge_id = p_challenge and a.rule_id = r.id
                  and a.creator_id = c.creator_id and not a.is_auto
             ), 0) as manual,
             sum(r.points) over (
               partition by c.creator_id, r.id
               order by s.submitted_at, s.id
               rows between unbounded preceding and 1 preceding
             ) as prior
        from public.submission_bonus_claims c
        join public.point_rules r on r.id = c.rule_id
        join public.submissions s on s.id = c.submission_id
       where c.challenge_id = p_challenge
         and s.challenge_id = p_challenge and s.collab_of is null
         and r.challenge_id = p_challenge
         and r.kind = 'bonus'
         and r.is_active
         and coalesce(s.logged_views, 0) >= coalesce(r.min_views, 0)
         -- 256: a bonus can run for part of the challenge. It counts for the
         -- entries SUBMITTED inside its window; ending it keeps every point
         -- already earned inside it.
         and (r.starts_at is null or s.submitted_at >= r.starts_at)
         and (r.ends_at is null or s.submitted_at <= r.ends_at)
    ) b
  ) q
  where q.award > 0;

  -- BOOSTS (334): "double points for everything related to that specific video" inside a window. For every video entered while a boost
  -- is on, the extra is (multiplier - 1) times what that video earned: the per-video points and every award tied to the video (its view
  -- milestones and the bonuses claimed on it). Summed per creator and capped by the boost's own maximum, so an exploit has a ceiling.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, t.creator_id, null, null,
         least(t.extra, coalesce(b.max_extra_points, t.extra)),
         left(b.label, 80) || ' (x' || regexp_replace(b.multiplier::text, '\.?0+$', '') || ')', true
  from public.challenge_boosts b
  join lateral (
    select s.creator_id,
           round(sum((b.multiplier - 1) * (coalesce(pp.pts, 0) + coalesce(av.pts, 0)))) as extra
      from public.submissions s
      left join lateral (select sum(r.points) as pts from public.point_rules r
                          where r.challenge_id = p_challenge and r.kind = 'per_post' and r.is_active) pp on true
      left join lateral (select sum(a.points) as pts from pg_temp._pa_new a
                          where a.challenge_id = p_challenge and a.submission_id = s.id and a.is_auto) av on true
     where s.challenge_id = p_challenge and s.collab_of is null and s.submitted_at >= b.starts_at and s.submitted_at < b.ends_at
     group by s.creator_id
  ) t on true
  where b.challenge_id = p_challenge and b.is_active and b.multiplier > 1 and t.extra > 0;

  -- CONSISTENCY: an entry in every window between the start and the deadline.
  -- An entry outside the range (published early, or in the minutes before the
  -- archive cron) is counted in the nearest window rather than dropped.
  if v_start is not null and v_end is not null and v_end > v_start then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from public.point_rules r
    cross join lateral (
      select greatest(1, ceil(extract(epoch from (v_end - v_start)) / (r.period_days * 86400.0)))::int as n
    ) np
    join lateral (
      select s.creator_id,
             count(distinct least(greatest(
               floor(extract(epoch from (s.submitted_at - v_start)) / (r.period_days * 86400.0))::int, 0), np.n - 1)) as covered
        from public.submissions s
       where s.challenge_id = p_challenge and s.collab_of is null
       group by s.creator_id
    ) t on t.covered >= np.n
    where r.challenge_id = p_challenge and r.kind = 'consistency' and r.is_active
      and coalesce(r.period_days, 0) > 0 and r.points > 0;
  end if;

  -- COLLABS (325, reshaped 334): an INSTAGRAM COLLAB POST. One creator enters it and names the other; the other confirms. Each side of every
  -- confirmed post earns the rule's points, capped per creator by the rule's maximum. The partner needs no entry of their own - the
  -- post is entered once, by one of them, and the views count once.
  insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select v_community, p_challenge, t.creator_id, r.id, null,
         least(t.n * r.points, coalesce(r.max_points, t.n * r.points)), r.label, true
  from public.point_rules r
  join lateral (
    select x.creator_id, count(*)::int as n from (
      select c.requester_id as creator_id from public.challenge_collabs c where c.challenge_id = p_challenge and c.status = 'confirmed'
      union all
      select c.partner_id from public.challenge_collabs c where c.challenge_id = p_challenge and c.status = 'confirmed'
    ) x group by x.creator_id
  ) t on true
  where r.challenge_id = p_challenge and r.kind = 'collab' and r.is_active and r.points > 0;

  -- THE DIFFERENCE. Rows are matched on everything that makes an award what it is; row_number() keeps two
  -- identical awards (two boosts with one label) counted as two.
  delete from public.point_awards d
   using (
     select a.id, a.creator_id, a.rule_id, a.submission_id, a.points, a.reason,
            row_number() over (partition by a.creator_id, a.rule_id, a.submission_id, a.points, a.reason order by a.id) as rn
       from public.point_awards a where a.challenge_id = p_challenge and a.is_auto
   ) o
   where d.id = o.id
     and not exists (
       select 1 from (
         select n.*, row_number() over (partition by n.creator_id, n.rule_id, n.submission_id, n.points, n.reason) as rn
           from pg_temp._pa_new n
       ) n
       where n.creator_id = o.creator_id and n.rule_id is not distinct from o.rule_id
         and n.submission_id is not distinct from o.submission_id and n.points = o.points
         and n.reason is not distinct from o.reason and n.rn = o.rn);
  get diagnostics v_removed = row_count;

  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
  select n.community_id, n.challenge_id, n.creator_id, n.rule_id, n.submission_id, n.points, n.reason, true
    from (
      select n.*, row_number() over (partition by n.creator_id, n.rule_id, n.submission_id, n.points, n.reason) as rn
        from pg_temp._pa_new n
    ) n
   where not exists (
     select 1 from (
       select a.creator_id, a.rule_id, a.submission_id, a.points, a.reason,
              row_number() over (partition by a.creator_id, a.rule_id, a.submission_id, a.points, a.reason order by a.id) as rn
         from public.point_awards a where a.challenge_id = p_challenge and a.is_auto
     ) o
     where n.creator_id = o.creator_id and n.rule_id is not distinct from o.rule_id
       and n.submission_id is not distinct from o.submission_id and n.points = o.points
       and n.reason is not distinct from o.reason and n.rn = o.rn);
  get diagnostics v_added = row_count;

  -- The participation marks used to ride the reinsert of every row on every pass. With nothing inserted
  -- the statement trigger does not fire, so ask once here (it is idempotent: first-N, never unmarks).
  if v_added = 0 then
    perform public.mark_points_participation(p_challenge);
  end if;

  if v_scoring = 'points' then
    perform public.rebuild_challenge_results(p_challenge);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.rebuild_challenge_results(p_challenge uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mode      text;
  v_community uuid;
  v_rows      integer;
  v_changed   integer;
begin
  select scoring, community_id into v_mode, v_community
  from public.challenges where id = p_challenge;

  if v_mode is null then
    return 0;
  end if;

  -- 363: same scoring and ranking as before; the write is a diff (delete the gone, update the moved, insert the new).
  with scored as (
    select
      s.creator_id,
      gm.group_id,
      case
        when v_mode = 'points' then
          round(coalesce((
            select sum(a.points) from public.point_awards a
             where a.challenge_id = p_challenge and a.creator_id = s.creator_id
          ), 0))
        when v_mode = 'total_views' then sum(coalesce(s.logged_views, 0))
        else max(coalesce(s.logged_views, 0))
      end::integer as score,
      sum(coalesce(s.logged_views, 0))::integer as total_views,
      min(s.submitted_at) as first_at
    from public.submissions s
    left join public.challenge_group_members gm
      on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
    where s.challenge_id = p_challenge
      and (v_mode = 'points' or s.logged_views is not null)
    group by s.creator_id, gm.group_id
  ),
  ranked as (
    select creator_id, group_id, score, total_views,
           (row_number() over (
             partition by group_id
             order by score desc, total_views desc, first_at asc nulls last, creator_id
           ))::integer as rank
    from scored
  ),
  gone as (
    delete from public.results r
     where r.challenge_id = p_challenge
       and not exists (select 1 from ranked k where k.creator_id = r.creator_id)
    returning 1
  ),
  moved as (
    update public.results r
       set final_views = k.score, total_views = k.total_views, rank = k.rank,
           community_id = v_community, group_id = k.group_id
      from ranked k
     where r.challenge_id = p_challenge and r.creator_id = k.creator_id
       and (r.final_views, r.total_views, r.rank, r.community_id, r.group_id)
           is distinct from (k.score, k.total_views, k.rank, v_community, k.group_id)
    returning 1
  ),
  added as (
    insert into public.results (challenge_id, creator_id, final_views, total_views, rank, community_id, group_id)
    select p_challenge, k.creator_id, k.score, k.total_views, k.rank, v_community, k.group_id
      from ranked k
     where not exists (select 1 from public.results r where r.challenge_id = p_challenge and r.creator_id = k.creator_id)
    returning 1
  )
  select (select count(*) from ranked),
         (select count(*) from gone) + (select count(*) from moved) + (select count(*) from added)
    into v_rows, v_changed;

  -- The stamp is what reconcile_stale_leaderboards compares synced views against, so non-points challenges
  -- always take it. A points challenge only takes it when the board moved: challenges is on the realtime
  -- feed, and an update that changes nothing would wake every open leaderboard for nothing.
  update public.challenges
     set results_updated_at = now(),
         results_status = case when results_status = 'none' then 'interim' else results_status end
   where id = p_challenge
     and (v_mode <> 'points' or v_changed > 0 or results_status = 'none' or results_updated_at is null);

  return coalesce(v_rows, 0);
end;
$function$;

-- Milestones: ~200 profiles x six evaluations each was 1.6 s every ten minutes (13% of database time). A creator
-- opening Milestones runs their own check anyway; the sweep only catches people who are not looking.
select cron.alter_job(jobid, schedule := '*/30 * * * *') from cron.job where jobname = 'reconcile-milestones';

-- ---------------------------------------------------------------------------------------------- health watch
create table if not exists public.ops_health_samples (
  taken_at   timestamptz primary key default now(),
  stats_since timestamptz,
  exec_ms    double precision,
  blks_hit   bigint,
  blks_read  bigint,
  conns      integer,
  max_conns  integer,
  readings   jsonb not null default '{}'::jsonb
);
alter table public.ops_health_samples enable row level security;
revoke all on public.ops_health_samples from anon, authenticated;

create or replace function public.ops_health_check()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_prev     public.ops_health_samples;
  v_since    timestamptz;
  v_exec     double precision;
  v_hit      bigint;
  v_read     bigint;
  v_conns    integer;
  v_max      integer;
  v_long     integer;
  v_long_q   text;
  v_locks    integer;
  v_slot     bigint;
  v_db       bigint;
  v_queue    integer := 0;
  v_minutes  double precision;
  v_busy     double precision;   -- seconds of query time per minute of clock
  v_cache    double precision;
  v_read_out jsonb;
  v_open     text[] := '{}';
  w          record;
begin
  select * into v_prev from public.ops_health_samples
   where taken_at < now() - interval '2 minutes' order by taken_at desc limit 1;

  select stats_reset into v_since from extensions.pg_stat_statements_info;
  select coalesce(sum(total_exec_time), 0) into v_exec from extensions.pg_stat_statements;
  select blks_hit, blks_read into v_hit, v_read from pg_stat_database where datname = current_database();
  select count(*) into v_conns from pg_stat_activity where backend_type = 'client backend';
  select setting::int into v_max from pg_settings where name = 'max_connections';
  select count(*), left(max(regexp_replace(query, '\s+', ' ', 'g')), 200) into v_long, v_long_q
    from pg_stat_activity
   where backend_type = 'client backend' and state = 'active'
     and now() - query_start > interval '60 seconds'
     and query not ilike '%pg_logical_slot%' and query not ilike '%realtime.list_changes%'
     and query not ilike 'START_REPLICATION%' and query not ilike '%pg_sleep%';
  select count(*) into v_locks from pg_stat_activity where wait_event_type = 'Lock';
  select coalesce(max(pg_wal_lsn_diff(pg_current_wal_lsn(), coalesce(confirmed_flush_lsn, restart_lsn))), 0)::bigint
    into v_slot from pg_replication_slots;
  v_db := pg_database_size(current_database());
  begin
    execute 'select count(*) from net.http_request_queue' into v_queue;
  exception when others then v_queue := 0;
  end;

  -- Rates need a previous sample from the same statistics epoch (a restart resets the counters).
  if v_prev.taken_at is not null and v_prev.stats_since is not distinct from v_since
     and now() - v_prev.taken_at between interval '2 minutes' and interval '30 minutes' then
    v_minutes := extract(epoch from now() - v_prev.taken_at) / 60.0;
    v_busy := greatest(0, (v_exec - v_prev.exec_ms) / 1000.0) / v_minutes;
    if (v_hit - v_prev.blks_hit) + (v_read - v_prev.blks_read) > 20000 then
      v_cache := 100.0 * (v_hit - v_prev.blks_hit) / ((v_hit - v_prev.blks_hit) + (v_read - v_prev.blks_read));
    end if;
  end if;

  v_read_out := jsonb_build_object(
    'busy_s_per_min', round(v_busy::numeric, 1), 'connections', v_conns, 'max_connections', v_max,
    'long_queries', v_long, 'lock_waits', v_locks, 'slot_lag_mb', round(v_slot / 1048576.0),
    'db_mb', round(v_db / 1048576.0), 'net_queue', v_queue, 'cache_hit_pct', round(v_cache::numeric, 1));

  insert into public.ops_health_samples (taken_at, stats_since, exec_ms, blks_hit, blks_read, conns, max_conns, readings)
  values (now(), v_since, v_exec, v_hit, v_read, v_conns, v_max, v_read_out)
  on conflict (taken_at) do nothing;
  delete from public.ops_health_samples where taken_at < now() - interval '3 days';

  -- THE THRESHOLDS. Baseline on Micro after the fixes: ~1-2 s of query time per clock minute, ~10-20
  -- connections. On 7 Oct trivial queries took 12-19 s; any of these would have fired well before that.
  for w in
    select * from (values
      ('ops:busy', v_busy is not null and v_busy >= 20,
         'Supabase is getting overloaded: the database is busy',
         format('The database spent %s seconds working per minute over the last few minutes (normal is 1 to 2). '
                'If it keeps climbing, pages start loading without data. Look at Analytics > Error monitoring and the '
                'heaviest queries in ops_stat_snapshots, or move the project up a compute size.', round(v_busy::numeric, 1))),
      ('ops:connections', v_conns >= v_max * 0.75,
         'Supabase is running out of connections',
         format('%s of %s database connections are in use. At the limit, new requests are refused.', v_conns, v_max)),
      ('ops:stuck', v_long > 0,
         'A database query has been running for over a minute',
         format('%s quer%s running for more than 60 seconds. The longest: %s', v_long,
                case when v_long = 1 then 'y has been' else 'ies have been' end, coalesce(v_long_q, ''))),
      ('ops:locks', v_locks >= 5,
         'Database queries are queuing behind each other',
         format('%s queries are waiting on a lock. This is what the 7 October outage looked like from inside.', v_locks)),
      ('ops:slot', v_slot >= 512 * 1048576::bigint,
         'Realtime is falling behind',
         format('The realtime replication slot is %s MB behind. A slot that never catches up fills the disk.', round(v_slot / 1048576.0))),
      ('ops:cache', v_cache is not null and v_cache < 95,
         'Supabase is short of memory',
         format('Only %s%% of reads were served from memory in the last few minutes (normal is over 99%%). '
                'The working set no longer fits; the next compute size up fixes it.', round(v_cache::numeric, 1))),
      ('ops:disk', v_db >= 6 * 1024 * 1048576::bigint,
         'The database is close to its disk size',
         format('The database is %s MB. The included disk is 8 GB.', round(v_db / 1048576.0))),
      ('ops:netqueue', v_queue >= 500,
         'Outgoing requests are backing up',
         format('%s outgoing HTTP calls (push, email, media cleanup) are waiting in the pg_net queue.', v_queue))
    ) t(key, firing, title, detail)
  loop
    if w.firing then
      v_open := v_open || w.key;
      if not exists (select 1 from public.client_errors e
                      where e.fingerprint = md5('ops|' || w.key) and e.resolved_at is null) then
        -- Newly open: tell the owner once. Fails soft; a warning must never break the check.
        begin
          perform public.notify_user(p.id, 'report', w.title, left(w.detail, 300), '/admin')
             from public.profiles p where p.platform_role = 'owner';
        exception when others then null;
        end;
      end if;
      perform public.report_system_error('ops', w.key, w.title, w.detail, '/admin/analytics?tab=errors');
    else
      perform public.clear_system_error('ops', w.key);
    end if;
  end loop;

  return v_read_out || jsonb_build_object('open', to_jsonb(v_open));
end;
$function$;
revoke all on function public.ops_health_check() from public, anon, authenticated;

select cron.schedule('ops-health-check', '*/5 * * * *', 'select public.ops_health_check();');
