-- 337 (5 Oct 2026): AN INSTAGRAM COLLAB POST IS ENTERED BY BOTH CREATORS.
--
-- Ethan: "I think it would be better if they both submit it rather than just one. You can tell if both of them submit it and verify it that way
-- as well, but obviously, if it's a collab post, you only count the views once." So the second creator to enter the SAME Instagram post in a
-- challenge with a collab bonus is no longer refused as a duplicate: their entry is linked to the first (`collab_of`), the pair is recorded as a
-- confirmed collab (both entered the same post, which is the verification), the first creator is told, and both earn the collab points.
-- The linked entry is the partner's own entry - it counts for the challenge, shows on their profile and their daily streak - but its VIEWS and
-- everything computed from them (view points, per-video points, boosts) count once, on the first entry.
alter table public.submissions add column if not exists collab_of uuid references public.submissions(id) on delete set null;
create index if not exists submissions_collab_of_idx on public.submissions (collab_of) where collab_of is not null;

create or replace function public.submission_one_video_one_entry()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_hit record;
begin
  v_key := public.video_identity(new.platform, new.video_url);
  if (v_key is null or v_key = '') and new.platform_video_id is null then return new; end if;

  select s.id, s.challenge_id, s.creator_id, s.platform, s.collab_of, c.title,
         (s.challenge_id = new.challenge_id) as same_challenge
    into v_hit
    from public.submissions s
    join public.challenges c on c.id = s.challenge_id
   where s.id is distinct from new.id
     and (s.challenge_id = new.challenge_id or s.creator_id = new.creator_id)
     and (
          (v_key is not null and v_key <> '' and (public.video_identity(s.platform, s.video_url) = v_key
                                                  or s.platform_video_id = v_key))
          or (new.platform_video_id is not null and s.platform_video_id = new.platform_video_id)
         )
   order by (s.challenge_id = new.challenge_id) desc, s.submitted_at
   limit 1;

  if found then
    -- THE COLLAB CASE: the same Instagram post, in the same challenge, by a different creator, where it has no partner yet.
    if v_hit.same_challenge and v_hit.creator_id <> new.creator_id and v_hit.collab_of is null
       and new.platform = 'Instagram' and v_hit.platform = 'Instagram'
       and exists (select 1 from public.point_rules r where r.challenge_id = new.challenge_id and r.kind = 'collab' and r.is_active)
       and not exists (select 1 from public.submissions o where o.collab_of = v_hit.id) then
      new.collab_of := v_hit.id;
      return new;
    end if;
    raise exception 'This video has already been submitted.' using
      errcode = '23505',
      detail  = v_hit.title,
      hint    = case when v_hit.same_challenge then 'same' else 'other' end;
  end if;
  return new;
end;
$$;

-- Once the linked entry is in: record the pair as confirmed and tell the first creator.
create or replace function public.submission_collab_linked()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.submissions; v_name text; v_title text;
begin
  select * into o from public.submissions where id = new.collab_of;
  if o.id is null then return null; end if;
  insert into public.challenge_collabs (challenge_id, requester_id, partner_id, submission_id, status, responded_at)
  values (new.challenge_id, o.creator_id, new.creator_id, o.id, 'confirmed', now())
  on conflict do nothing;
  select name into v_name from public.profiles where id = new.creator_id;
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(o.creator_id, 'collab', coalesce(v_name, 'A creator') || ' entered your collab post too',
    'You both entered the same Instagram post in ' || coalesce(v_title, 'the challenge') || ', so you both earn the collab points. Its views count once.',
    '/challenges/' || new.challenge_id || '?tab=leaderboard');
  return null;
end $$;
revoke execute on function public.submission_collab_linked() from public, anon, authenticated;
drop trigger if exists trg_submission_collab_linked on public.submissions;
create trigger trg_submission_collab_linked after insert on public.submissions
  for each row when (new.collab_of is not null) execute function public.submission_collab_linked();

-- Taking the partner's entry out takes the pair out.
create or replace function public.submission_collab_unlinked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.challenge_collabs where submission_id = old.collab_of and partner_id = old.creator_id;
  return null;
end $$;
revoke execute on function public.submission_collab_unlinked() from public, anon, authenticated;
drop trigger if exists trg_submission_collab_unlinked on public.submissions;
create trigger trg_submission_collab_unlinked after delete on public.submissions
  for each row when (old.collab_of is not null) execute function public.submission_collab_unlinked();

-- Scoring: every query over submissions now leaves the linked entry out, so its views count once (on the first entry).
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
begin
  select community_id, threshold_mode, scoring, start_date, end_date
    into v_community, v_mode, v_scoring, v_start, v_end
  from public.challenges where id = p_challenge;
  if v_community is null then return; end if;

  delete from public.point_awards where challenge_id = p_challenge and is_auto;

  -- Per video posted, capped.
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
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
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
    select v_community, p_challenge, s.creator_id, r.id, s.id, r.points, r.label, true
    from public.submissions s
    join public.point_rules r
      on r.challenge_id = p_challenge and r.kind = 'views_threshold' and r.is_active
     and coalesce(s.logged_views, 0) >= r.threshold
    where s.challenge_id = p_challenge and s.collab_of is null;
  else
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
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
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
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
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
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
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
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
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
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
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
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
      left join lateral (select sum(a.points) as pts from public.point_awards a
                          where a.challenge_id = p_challenge and a.submission_id = s.id and a.is_auto) av on true
     where s.challenge_id = p_challenge and s.collab_of is null and s.submitted_at >= b.starts_at and s.submitted_at < b.ends_at
     group by s.creator_id
  ) t on true
  where b.challenge_id = p_challenge and b.is_active and b.multiplier > 1 and t.extra > 0;

  -- CONSISTENCY: an entry in every window between the start and the deadline.
  -- An entry outside the range (published early, or in the minutes before the
  -- archive cron) is counted in the nearest window rather than dropped.
  if v_start is not null and v_end is not null and v_end > v_start then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
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
  insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, submission_id, points, reason, is_auto)
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

  if v_scoring = 'points' then
    perform public.rebuild_challenge_results(p_challenge);
  end if;
end $function$;

-- A collab pair is not a clash for the late duplicate detector.
CREATE OR REPLACE FUNCTION public.submission_drop_resolved_duplicate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_keep    uuid;
  v_owner   uuid;
  v_title   text;
  v_others  int;
  r         record;
begin
  if new.platform_video_id is null or new.platform_video_id = '' then return new; end if;

  select s.id, s.creator_id into v_keep, v_owner
    from public.submissions s
   where s.challenge_id = new.challenge_id
     and s.platform_video_id = new.platform_video_id
   order by s.submitted_at, s.id
   limit 1;

  if v_keep is null then return new; end if;

  select count(*) into v_others
    from public.submissions s
   where s.challenge_id = new.challenge_id
     and s.platform_video_id = new.platform_video_id
     and s.creator_id is distinct from v_owner;

  -- A COLLAB PAIR IS NOT A CLASH (337): the second creator's entry of the same Instagram post is linked to the first by collab_of.
  if exists (select 1 from public.submissions x where x.challenge_id = new.challenge_id and x.platform_video_id = new.platform_video_id and x.collab_of is not null) then
    return new;
  end if;

  if v_others > 0 then
    begin
      perform public.report_system_error(
        'submissions',
        'duplicate_across_creators:' || new.challenge_id || ':' || new.platform_video_id,
        'Two creators have entered the same video',
        'Video ' || new.platform_video_id || ' is entered by more than one creator in this '
          || 'challenge. Nothing has been removed. Open the entries and decide which stands.',
        '/admin/challenges/' || new.challenge_id || '/results');
    exception when others then
      raise warning 'could not report duplicate across creators for %: %', new.platform_video_id, sqlerrm;
    end;
    return new;
  end if;

  select title into v_title from public.challenges where id = new.challenge_id;

  for r in
    select * from public.submissions s
     where s.challenge_id = new.challenge_id
       and s.platform_video_id = new.platform_video_id
       and s.id <> v_keep
       and s.creator_id is not distinct from v_owner
  loop
    insert into public.submission_duplicates
      (id, challenge_id, creator_id, platform_video_id, kept_submission_id, snapshot)
    values (r.id, r.challenge_id, r.creator_id, r.platform_video_id, v_keep, to_jsonb(r))
    on conflict (id) do nothing;

    begin
      insert into public.notifications (recipient_id, type, title, body, link)
      values (
        r.creator_id,
        'submission',
        'We removed a repeated entry',
        'One of your videos was entered twice in ' || coalesce(v_title, 'a challenge')
          || '. TikTok makes a new share link every time you press Share, so the two links '
          || 'looked different but pointed at the same video. Your original entry is still '
          || 'in and still scoring - only the repeat was removed.',
        '/challenges/' || r.challenge_id);
    exception when others then
      raise warning 'could not notify % about duplicate %: %', r.creator_id, r.id, sqlerrm;
    end;
  end loop;

  delete from public.submissions s
   where s.challenge_id = new.challenge_id
     and s.platform_video_id = new.platform_video_id
     and s.id <> v_keep
     and s.creator_id is not distinct from v_owner;

  return new;
end;
$function$;
