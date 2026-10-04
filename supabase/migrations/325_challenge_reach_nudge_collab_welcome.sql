-- 325 (4 Oct 2026): WHO HAS NOT POSTED YET, A NUDGE FOR THEM, COLLAB BONUS POINTS THAT CAN BE CHECKED, AND A WELCOME VOUCHER.
--
-- Ethan, on getting the global challenge past 50 creators:
--   * "check what creators have actually been on the platform, how many have been on since this challenge started and have not
--     posted, and how many haven't been on at all" -> challenge_reach (admin): the funnel from the audience to people who posted,
--     by market, with the lists behind each number. challenge_nudge sends a push to one of those groups.
--   * "a bonus point for creators that collab ... how we could track it" -> challenge_collabs: one creator says which of their
--     entries was made with a creator they are CONNECTED to on the platform, that creator confirms (they must have an entry in the
--     challenge too), and both earn the new `collab` point rule. The pair can only count once per challenge.
--   * "a 5 voucher for every new person that joins this challenge, posts, and gets over 5K views" -> the challenge's
--     welcome voucher: off until the team sets an amount, then a first-time entrant whose entry passes the views gets a voucher
--     reward by itself (the voucher pipeline then issues the code as for any other voucher).
-- recalc_challenge_points_internal below is the LIVE function with the collab section added before the results rebuild.

alter table public.point_rules drop constraint if exists point_rules_kind_check;
alter table public.point_rules add constraint point_rules_kind_check check (kind = any (array[
  'per_post', 'views_threshold', 'bonus', 'total_views_threshold', 'platform_spread', 'consistency', 'collab']));

create table if not exists public.challenge_collabs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete set null,
  note text,
  status text not null default 'asked' check (status in ('asked', 'confirmed', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> partner_id)
);
create unique index if not exists challenge_collabs_one_pair on public.challenge_collabs
  (challenge_id, least(requester_id, partner_id), greatest(requester_id, partner_id)) where status <> 'declined';
create index if not exists challenge_collabs_partner on public.challenge_collabs (partner_id, status);
alter table public.challenge_collabs enable row level security;
drop policy if exists "collabs: involved read" on public.challenge_collabs;
create policy "collabs: involved read" on public.challenge_collabs for select to authenticated
  using (requester_id = auth.uid() or partner_id = auth.uid() or public.is_admin());
drop policy if exists "collabs: admin remove" on public.challenge_collabs;
create policy "collabs: admin remove" on public.challenge_collabs for delete to authenticated using (public.is_admin());
revoke all on public.challenge_collabs from anon;
revoke insert, update, delete on public.challenge_collabs from authenticated;
grant select on public.challenge_collabs to authenticated;
grant delete on public.challenge_collabs to authenticated;

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
  join public.submissions s on s.challenge_id = p_challenge
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
    where s.challenge_id = p_challenge;
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
      where s.challenge_id = p_challenge
    ) ranked
    where rn = 1;
  end if;

  -- Total-views milestones, per creator.
  if v_mode = 'cumulative' then
    insert into public.point_awards (community_id, challenge_id, creator_id, rule_id, points, reason, is_auto)
    select v_community, p_challenge, t.creator_id, r.id, r.points, r.label, true
    from (
      select s.creator_id, coalesce(sum(s.logged_views), 0) as views
      from public.submissions s where s.challenge_id = p_challenge
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
        from public.submissions s where s.challenge_id = p_challenge
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
  join public.submissions s on s.challenge_id = p_challenge
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
         and s.challenge_id = p_challenge
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
       where s.challenge_id = p_challenge
       group by s.creator_id
    ) t on t.covered >= np.n
    where r.challenge_id = p_challenge and r.kind = 'consistency' and r.is_active
      and coalesce(r.period_days, 0) > 0 and r.points > 0;
  end if;

  -- COLLABS (325): two creators who made a video together and both said so. Each side of every confirmed pair earns the rule's
  -- points, capped per creator by the rule's maximum. A pair is confirmed by the partner, on the platform (challenge_collabs).
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
  where r.challenge_id = p_challenge and r.kind = 'collab' and r.is_active and r.points > 0
    and exists (select 1 from public.submissions s where s.challenge_id = p_challenge and s.creator_id = t.creator_id);

  if v_scoring = 'points' then
    perform public.rebuild_challenge_results(p_challenge);
  end if;
end $function$;

create or replace function public.trg_recalc_points_on_collab()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_challenge uuid := coalesce(new.challenge_id, old.challenge_id);
begin
  if exists (select 1 from public.challenges where id = v_challenge and scoring = 'points') then
    perform pg_advisory_xact_lock(hashtext('recalc_points:' || v_challenge::text));
    perform public.recalc_challenge_points_internal(v_challenge);
  end if;
  return coalesce(new, old);
end $function$;
revoke execute on function public.trg_recalc_points_on_collab() from public, anon, authenticated;
drop trigger if exists trg_points_on_collab on public.challenge_collabs;
create trigger trg_points_on_collab after insert or update of status or delete on public.challenge_collabs
  for each row execute function public.trg_recalc_points_on_collab();

create or replace function public.collab_request(p_challenge uuid, p_submission uuid, p_partner uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_me uuid := auth.uid(); v_id uuid; v_name text; v_title text;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if p_partner = v_me then raise exception 'Pick somebody else.'; end if;
  select title into v_title from public.challenges where id = p_challenge and status = 'active';
  if v_title is null then raise exception 'This challenge is not open.'; end if;
  if not exists (select 1 from public.point_rules r where r.challenge_id = p_challenge and r.kind = 'collab' and r.is_active) then
    raise exception 'There is no collab bonus on this challenge.';
  end if;
  if not exists (select 1 from public.submissions s where s.id = p_submission and s.challenge_id = p_challenge and s.creator_id = v_me) then
    raise exception 'Pick one of your own entries in this challenge.';
  end if;
  if not exists (select 1 from public.connections c where c.status = 'accepted'
                  and ((c.creator_id = v_me and c.connected_creator_id = p_partner) or (c.creator_id = p_partner and c.connected_creator_id = v_me))) then
    raise exception 'You need to be connected on the platform first. Send them a connection request, then come back.';
  end if;
  if not exists (select 1 from public.submissions s where s.challenge_id = p_challenge and s.creator_id = p_partner) then
    raise exception 'They need an entry in this challenge too. Ask them to post one, then try again.';
  end if;
  if exists (select 1 from public.challenge_collabs c where c.challenge_id = p_challenge and c.status <> 'declined'
              and least(c.requester_id, c.partner_id) = least(v_me, p_partner) and greatest(c.requester_id, c.partner_id) = greatest(v_me, p_partner)) then
    raise exception 'You two already have a collab on this challenge.';
  end if;
  insert into public.challenge_collabs (challenge_id, requester_id, partner_id, submission_id) values (p_challenge, v_me, p_partner, p_submission)
  returning id into v_id;
  select name into v_name from public.profiles where id = v_me;
  perform public.notify_user(p_partner, 'collab', coalesce(v_name, 'A creator') || ' says you made a video together',
    'Confirm it on ' || v_title || ' and you both earn the collab bonus points.', '/challenges/' || p_challenge || '?tab=brief');
  return v_id;
end $function$;
revoke execute on function public.collab_request(uuid, uuid, uuid) from public, anon;
grant execute on function public.collab_request(uuid, uuid, uuid) to authenticated;

create or replace function public.collab_respond(p_id uuid, p_accept boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c public.challenge_collabs; v_name text;
begin
  select * into c from public.challenge_collabs where id = p_id for update;
  if c.id is null or c.partner_id <> auth.uid() then raise exception 'That request is not yours to answer.'; end if;
  if c.status <> 'asked' then raise exception 'Already answered.'; end if;
  if p_accept and not exists (select 1 from public.submissions s where s.challenge_id = c.challenge_id and s.creator_id = c.partner_id) then
    raise exception 'Post your own entry in this challenge first, then confirm.';
  end if;
  update public.challenge_collabs set status = case when p_accept then 'confirmed' else 'declined' end, responded_at = now() where id = p_id;
  select name into v_name from public.profiles where id = c.partner_id;
  perform public.notify_user(c.requester_id, 'collab',
    case when p_accept then coalesce(v_name, 'Your partner') || ' confirmed your collab' else coalesce(v_name, 'Your partner') || ' did not confirm the collab' end,
    case when p_accept then 'You both earned the collab bonus points.' else 'No points were added.' end, '/challenges/' || c.challenge_id || '?tab=leaderboard');
end $function$;
revoke execute on function public.collab_respond(uuid, boolean) from public, anon;
grant execute on function public.collab_respond(uuid, boolean) to authenticated;

create or replace function public.collab_cancel(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  delete from public.challenge_collabs where id = p_id and requester_id = auth.uid() and status = 'asked';
end $function$;
revoke execute on function public.collab_cancel(uuid) from public, anon;
grant execute on function public.collab_cancel(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------- reach and nudges
create or replace function public.challenge_reach(p_challenge uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare ch public.challenges; v_start timestamptz; v_net boolean; v_out jsonb;
begin
  if not public.is_admin() then raise exception 'Only the team can see this.'; end if;
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null then return null; end if;
  v_start := coalesce(ch.start_date, now());
  v_net := ch.community_id is null or exists (select 1 from public.communities c where c.id = ch.community_id and c.kind = 'network');
  with aud as (
    select p.id, p.name, p.photo_url, p.last_seen_at, p.created_at,
           coalesce((select c.name from public.community_members h join public.communities c on c.id = h.community_id
                      where h.profile_id = p.id and h.is_home and h.status = 'active' limit 1), 'No home market') as market,
           exists (select 1 from public.submissions s where s.creator_id = p.id and s.challenge_id = p_challenge) as posted,
           exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id) as push
      from public.profiles p
     where p.status = 'active' and not p.is_admin and not p.is_test
       and (v_net or exists (select 1 from public.community_members cm where cm.profile_id = p.id and cm.community_id = ch.community_id and cm.status = 'active'))
  ), seg as (
    select a.*, case when posted then 'posted' when last_seen_at >= v_start then 'seen' when last_seen_at is not null then 'dormant' else 'never' end as seg from aud a
  )
  select jsonb_build_object(
    'started', v_start,
    'audience', count(*),
    'posted', count(*) filter (where seg = 'posted'),
    'seen', count(*) filter (where last_seen_at >= v_start),
    'seen_not_posted', count(*) filter (where seg = 'seen'),
    'dormant', count(*) filter (where seg = 'dormant'),
    'never', count(*) filter (where seg = 'never'),
    'push', count(*) filter (where push),
    'push_not_posted', count(*) filter (where push and not posted),
    'joined_since', count(*) filter (where created_at >= v_start),
    'markets', (select coalesce(jsonb_agg(jsonb_build_object('name', market, 'audience', n, 'seen', seen, 'posted', posted) order by n desc), '[]'::jsonb)
                  from (select market, count(*) n, count(*) filter (where last_seen_at >= v_start) seen, count(*) filter (where posted) posted from seg group by market) m),
    'people', jsonb_build_object(
      'seen', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'photo', photo_url, 'market', market, 'last_seen', last_seen_at, 'push', push) order by last_seen_at desc), '[]'::jsonb)
                 from (select * from seg where seg.seg = 'seen' order by last_seen_at desc limit 150) x),
      'dormant', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'photo', photo_url, 'market', market, 'last_seen', last_seen_at, 'push', push) order by last_seen_at desc), '[]'::jsonb)
                 from (select * from seg where seg.seg = 'dormant' order by last_seen_at desc limit 150) x),
      'never', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'photo', photo_url, 'market', market, 'joined', created_at, 'push', push) order by created_at desc), '[]'::jsonb)
                 from (select * from seg where seg.seg = 'never' order by created_at desc limit 150) x)))
    into v_out from seg;
  return v_out;
end $function$;
revoke execute on function public.challenge_reach(uuid) from public, anon;
grant execute on function public.challenge_reach(uuid) to authenticated;

-- A notification (and so a push, for anybody who has them on) to one group who have not entered: 'seen' (on the platform since it
-- started), 'dormant' (on before, not since), 'never' (never opened it) or 'all' of those. Returns how many were notified.
create or replace function public.challenge_nudge(p_challenge uuid, p_segment text, p_title text, p_body text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare ch public.challenges; v_start timestamptz; v_net boolean; v_n int;
begin
  if not public.is_admin() then raise exception 'Only the team can send this.'; end if;
  if p_segment not in ('seen', 'dormant', 'never', 'all') then raise exception 'Unknown group.'; end if;
  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_body, '')) = '' then raise exception 'Write a title and a message.'; end if;
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null then raise exception 'No such challenge.'; end if;
  v_start := coalesce(ch.start_date, now());
  v_net := ch.community_id is null or exists (select 1 from public.communities c where c.id = ch.community_id and c.kind = 'network');
  with who as (
    select p.id from public.profiles p
     where p.status = 'active' and not p.is_admin and not p.is_test
       and (v_net or exists (select 1 from public.community_members cm where cm.profile_id = p.id and cm.community_id = ch.community_id and cm.status = 'active'))
       and not exists (select 1 from public.submissions s where s.creator_id = p.id and s.challenge_id = p_challenge)
       and case p_segment
             when 'seen' then p.last_seen_at >= v_start
             when 'dormant' then p.last_seen_at < v_start
             when 'never' then p.last_seen_at is null
             else true end
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select id, 'challenge', left(btrim(p_title), 70), left(btrim(p_body), 300), '/challenges/' || p_challenge from who returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $function$;
revoke execute on function public.challenge_nudge(uuid, text, text, text) from public, anon;
grant execute on function public.challenge_nudge(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------- welcome voucher
alter table public.challenges add column if not exists welcome_amount numeric check (welcome_amount is null or welcome_amount >= 0);
alter table public.challenges add column if not exists welcome_views integer not null default 5000 check (welcome_views >= 0);
alter table public.challenges add column if not exists welcome_limit integer check (welcome_limit is null or welcome_limit > 0);

create or replace function public.challenge_welcome_rewards(p_challenge uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare ch public.challenges; v_given int; v_room int; v_n int := 0; r record;
begin
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null or ch.status <> 'active' or coalesce(ch.welcome_amount, 0) <= 0 then return 0; end if;
  select count(*) into v_given from public.rewards where challenge_id = p_challenge and prize_slot = 'welcome';
  v_room := case when ch.welcome_limit is null then 1000000 else greatest(0, ch.welcome_limit - v_given) end;
  for r in
    select s.creator_id, max(s.logged_views) as best
      from public.submissions s
      join public.profiles p on p.id = s.creator_id and p.status = 'active' and not p.is_admin and not p.is_test
     where s.challenge_id = p_challenge
       and not exists (select 1 from public.submissions o where o.creator_id = s.creator_id and o.challenge_id <> p_challenge and o.submitted_at < ch.start_date)
       and not exists (select 1 from public.rewards w where w.creator_id = s.creator_id and w.challenge_id = p_challenge and w.prize_slot = 'welcome')
     group by s.creator_id
    having coalesce(max(s.logged_views), 0) >= ch.welcome_views
     order by min(s.submitted_at)
     limit v_room
  loop
    insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency, status, community_id, source, prize_slot, payment_notes)
    values (r.creator_id, p_challenge, 'voucher', ch.welcome_amount, coalesce(ch.prize_currency, 'EUR'), 'pending', ch.community_id, 'challenge', 'welcome',
            'Welcome voucher: a first entry that passed ' || ch.welcome_views || ' views');
    perform public.notify_user(r.creator_id, 'reward', 'A welcome voucher for you',
      'Your first video passed ' || to_char(ch.welcome_views, 'FM999,999,999') || ' views, so a Tryp.com voucher is on its way. It appears under Rewards.', '/rewards');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;
revoke execute on function public.challenge_welcome_rewards(uuid) from public, anon, authenticated;
