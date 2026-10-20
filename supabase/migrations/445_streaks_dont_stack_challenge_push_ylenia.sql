-- 445 (20 Oct 2026): three fixes from the team's round.
--
-- 1. STREAK BONUSES DO NOT STACK. The Autumn Edition has "post every day" (30) and "post in all 4 weeks" (10). Posting
--    every day also covers every week, so a creator who completes both kept 40. Now a creator keeps only the biggest
--    streak they complete; recalc_challenge_points_internal is patched in place (asserted replace of the live body).
--
-- 2. "PERMISSION DENIED FOR FUNCTION notify_community" (Marta, sending a challenge push). ChallengePush called
--    notify_community / notify_all straight from the browser; both are owner-only (they write a row per creator, so
--    a creator must never reach them). admin_send_challenge_push is the admin door: team only, never the sandbox, the
--    challenge's link built here rather than trusted from the client.
--
-- 3. Ylenia Pelaez (VIP Spain) joins the Tryp.com team as a manager of Spain, staying a VIP. Admins are already
--    exempt from every VIP fence (vip_fenced, is_active_vip policies, room keys), so she sees the Spanish community,
--    its challenges and rooms, and keeps her own /vip page (she is not a VIP manager).

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
  v_join_pts  numeric;
  v_join_from timestamptz;
  v_removed   integer := 0;
  v_added     integer := 0;
  v_tz        text;
  v_d0        date;
  v_days      integer;
begin
  select community_id, threshold_mode, scoring, start_date, end_date, join_bonus_points, join_bonus_from
    into v_community, v_mode, v_scoring, v_start, v_end, v_join_pts, v_join_from
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;
  -- 442: the challenge's calendar (its clock, first day, number of days).
  select x.tz, x.d0, x.days into v_tz, v_d0, v_days from public.challenge_days(p_challenge) x;

  -- 363: WORK OUT THE AWARDS FIRST, THEN WRITE ONLY THE DIFFERENCE. Every rescore used to delete and reinsert
  -- every auto award (29,000 rows in 14 hours for ~460 live awards), and realtime has to decode every one of
  -- those WAL records. The steps below are unchanged except that they fill pg_temp._pa_new.
  create temp table if not exists _pa_new (
    community_id uuid, challenge_id uuid, creator_id uuid, rule_id uuid, submission_id uuid,
    points numeric, reason text, is_auto boolean
  ) on commit delete rows;
  delete from pg_temp._pa_new where true;

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
  -- 442: windows of N CALENDAR days in the challenge's clock, counted by the day a video was POSTED; a remainder
  -- shorter than half a window joins the last one.
  if v_d0 is not null and coalesce(v_days, 0) > 0 then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from public.point_rules r
    cross join lateral (
      select greatest(1, v_days / r.period_days
        + case when v_days >= r.period_days and (v_days % r.period_days) * 2 >= r.period_days then 1 else 0 end)::int as n
    ) np
    join lateral (
      select s.creator_id,
             count(distinct least(greatest(
               ((coalesce(s.posted_at, s.submitted_at) at time zone v_tz)::date - v_d0) / r.period_days, 0), np.n - 1)) as covered
        from public.submissions s
       where s.challenge_id = p_challenge and s.collab_of is null
       group by s.creator_id
    ) t on t.covered >= np.n
    where r.challenge_id = p_challenge and r.kind = 'consistency' and r.is_active
      and coalesce(r.period_days, 0) > 0 and r.points > 0;
  end if;

  -- 445: STREAK BONUSES DO NOT STACK. Posting every day also covers every week, so a creator who completes more than one
  -- streak keeps only the biggest (ties: one of them, by rule id). Points move automatically as streaks are completed.
  delete from pg_temp._pa_new n
   where n.rule_id in (select r.id from public.point_rules r where r.challenge_id = p_challenge and r.kind = 'consistency')
     and exists (
       select 1 from pg_temp._pa_new m
        where m.creator_id = n.creator_id and m.rule_id <> n.rule_id
          and m.rule_id in (select r.id from public.point_rules r where r.challenge_id = p_challenge and r.kind = 'consistency')
          and (m.points > n.points or (m.points = n.points and m.rule_id < n.rule_id)));

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

  -- JOINING BONUS (383): a creator whose FIRST entry in this challenge came after the bonus was switched on gets it once.
  -- Not tied to a video, so a boost never multiplies it.
  if coalesce(v_join_pts, 0) > 0 and v_join_from is not null then
    insert into pg_temp._pa_new (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, f.creator_id, null, null, v_join_pts, 'Joining bonus', true
      from (
        select s.creator_id, min(s.submitted_at) as first_at
          from public.submissions s
         where s.challenge_id = p_challenge and s.collab_of is null
         group by s.creator_id
      ) f
     where f.first_at >= v_join_from;
  end if;

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

create or replace function public.admin_send_challenge_push(p_challenge uuid, p_market uuid, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.is_admin() then
    raise exception 'Only the Tryp.com team can send this';
  end if;
  if exists (select 1 from public.profiles where id = v_me and coalesce(is_sandbox, false)) then
    raise exception 'The demo account cannot send notifications';
  end if;
  if not exists (select 1 from public.challenges where id = p_challenge) then
    raise exception 'No such challenge';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null or nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'A title and a message are both needed';
  end if;
  if p_market is not null then
    perform public.notify_community(p_market, v_me, 'challenge', btrim(p_title), btrim(p_body), '/challenges/' || p_challenge);
  else
    perform public.notify_all(v_me, 'challenge', btrim(p_title), btrim(p_body), '/challenges/' || p_challenge);
  end if;
  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  select v_me, (select name from public.profiles where id = v_me), 'Sent a challenge notification', null,
         (select title from public.challenges where id = p_challenge);
end;
$function$;
revoke all on function public.admin_send_challenge_push(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_send_challenge_push(uuid, uuid, text, text) to authenticated;

-- Ylenia: manager of Spain + on the team (what Admin > Team > Spain > Add manager does).
do $$
declare
  v_y uuid := '96a658c1-b5f0-45bb-845c-13ef6151f79c';
  v_es uuid := (select id from public.communities where kind = 'chapter' and name = 'Spain');
begin
  if v_es is null then raise exception 'Spain market not found'; end if;
  update public.community_members set role = 'manager', status = 'active' where community_id = v_es and profile_id = v_y;
  if not found then
    insert into public.community_members (community_id, profile_id, role, status) values (v_es, v_y, 'manager', 'active');
  end if;
  update public.profiles set is_admin = true, platform_role = 'global_admin' where id = v_y and platform_role <> 'owner';
  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  values (null, 'Migration 445', 'Promoted to Tryp.com team (manager of Spain, stays VIP)', v_y, 'Ylenia Peláez');
end $$;
