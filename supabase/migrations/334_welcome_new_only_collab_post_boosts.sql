-- 334 (4 Oct 2026): A WELCOME VOUCHER FOR NEW CREATORS ONLY, AN INSTAGRAM COLLAB POST, AND POINT BOOSTS.
--
-- 1. WELCOME VOUCHER. Ethan: "I could add this in the middle of the challenge. Creators who have already entered won't get it. It's just for new
--    creators that have joined in the challenge late ... it doesn't make sense because it's not rewarding the creators that actually did
--    participate first." So it now needs: the account made after the challenge began, no entry in any other challenge, and a first entry
--    posted after the voucher was switched on (`welcome_from`, stamped when an amount is first set).
--
-- 2. COLLAB, REBUILT AS AN INSTAGRAM COLLAB POST. "Two creators connect on the platform and make a video together in any way" could not be
--    checked. A collab POST can: one creator enters the post and names the other, the other confirms, and both earn the collab points. It
--    counts once - the video is entered by one of them - so it is never "using us twice", and a video can only have one partner. The partner
--    needs no entry of their own.
--
-- 3. BOOSTS. "Double points for a specific day and time frame, like 3 hours ... triple points ... a maximum points gain in case people exploit
--    it." `challenge_boosts` is a window, a multiplier and an optional cap on the extra points one creator can gain from it. Every video
--    entered inside the window earns (multiplier - 1) times what that video earns, and rescoring is automatic.

alter table public.challenges add column if not exists welcome_from timestamptz;
create or replace function public.trg_challenge_welcome_from() returns trigger language plpgsql as $$
begin
  if coalesce(new.welcome_amount, 0) > 0 then
    if tg_op = 'INSERT' or coalesce(old.welcome_amount, 0) <= 0 then new.welcome_from := now(); end if;
  else
    new.welcome_from := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_challenge_welcome_from on public.challenges;
create trigger trg_challenge_welcome_from before insert or update of welcome_amount on public.challenges
  for each row execute function public.trg_challenge_welcome_from();
update public.challenges set welcome_from = now() where coalesce(welcome_amount, 0) > 0 and welcome_from is null;

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
       -- NEW CREATORS ONLY (334): the account was made after this challenge began, and it has no entry in any other challenge.
       and p.created_at >= ch.start_date
       and not exists (select 1 from public.submissions o where o.creator_id = s.creator_id and o.challenge_id <> p_challenge)
       and not exists (select 1 from public.rewards w where w.creator_id = s.creator_id and w.challenge_id = p_challenge and w.prize_slot = 'welcome')
     group by s.creator_id
    -- ...and the first entry came after the voucher was switched on: a creator who had already entered is not rewarded for it.
    having coalesce(max(s.logged_views), 0) >= ch.welcome_views
       and min(s.submitted_at) >= coalesce(ch.welcome_from, ch.start_date)
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

-- ---------------------------------------------------------------------------------------------- collab as an Instagram post
drop index if exists public.challenge_collabs_one_pair;
create unique index if not exists challenge_collabs_one_per_post on public.challenge_collabs (submission_id) where status <> 'declined' and submission_id is not null;
-- A collab belongs to the post it was claimed on: when the entry goes, so does the collab.
alter table public.challenge_collabs drop constraint if exists challenge_collabs_submission_id_fkey;
alter table public.challenge_collabs add constraint challenge_collabs_submission_id_fkey foreign key (submission_id) references public.submissions(id) on delete cascade;

create or replace function public.collab_request(p_challenge uuid, p_submission uuid, p_partner uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_me uuid := auth.uid(); v_id uuid; v_name text; v_title text; v_plat text;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if p_partner = v_me then raise exception 'Pick the other creator on the post, not yourself.'; end if;
  select title into v_title from public.challenges where id = p_challenge and status = 'active';
  if v_title is null then raise exception 'This challenge is not open.'; end if;
  if not exists (select 1 from public.point_rules r where r.challenge_id = p_challenge and r.kind = 'collab' and r.is_active) then
    raise exception 'There is no collab bonus on this challenge.';
  end if;
  select platform into v_plat from public.submissions s where s.id = p_submission and s.challenge_id = p_challenge and s.creator_id = v_me;
  if not found then raise exception 'Pick one of your own entries in this challenge.'; end if;
  if v_plat <> 'Instagram' then raise exception 'A collab post is an Instagram feature, so it has to be an Instagram entry.'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_partner and p.status = 'active' and not p.is_admin) then
    raise exception 'That creator is not on the platform.';
  end if;
  if exists (select 1 from public.challenge_collabs c where c.submission_id = p_submission and c.status <> 'declined') then
    raise exception 'That post already has a collab partner.';
  end if;
  insert into public.challenge_collabs (challenge_id, requester_id, partner_id, submission_id) values (p_challenge, v_me, p_partner, p_submission)
  returning id into v_id;
  select name into v_name from public.profiles where id = v_me;
  perform public.notify_user(p_partner, 'collab', coalesce(v_name, 'A creator') || ' says you made an Instagram collab post together',
    'Confirm it on ' || v_title || ' and you both earn the collab bonus points. You do not need to enter it yourself.', '/challenges/' || p_challenge || '?tab=brief');
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
  update public.challenge_collabs set status = case when p_accept then 'confirmed' else 'declined' end, responded_at = now() where id = p_id;
  select name into v_name from public.profiles where id = c.partner_id;
  perform public.notify_user(c.requester_id, 'collab',
    case when p_accept then coalesce(v_name, 'Your partner') || ' confirmed your collab post' else coalesce(v_name, 'Your partner') || ' did not confirm the collab' end,
    case when p_accept then 'You both earned the collab bonus points.' else 'No points were added.' end, '/challenges/' || c.challenge_id || '?tab=leaderboard');
end $function$;
revoke execute on function public.collab_respond(uuid, boolean) from public, anon;
grant execute on function public.collab_respond(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------- boosts
create table if not exists public.challenge_boosts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  label text not null default 'Boost',
  multiplier numeric(4,2) not null check (multiplier > 1 and multiplier <= 10),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_extra_points integer check (max_extra_points is null or max_extra_points > 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists challenge_boosts_challenge on public.challenge_boosts (challenge_id, starts_at);
alter table public.challenge_boosts enable row level security;
drop policy if exists "boosts: read" on public.challenge_boosts;
create policy "boosts: read" on public.challenge_boosts for select to authenticated using (true);
drop policy if exists "boosts: admins write" on public.challenge_boosts;
create policy "boosts: admins write" on public.challenge_boosts for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.challenge_boosts from anon;
grant select, insert, update, delete on public.challenge_boosts to authenticated;

create or replace function public.trg_recalc_points_on_boost()
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
revoke execute on function public.trg_recalc_points_on_boost() from public, anon, authenticated;
drop trigger if exists trg_points_on_boost on public.challenge_boosts;
create trigger trg_points_on_boost after insert or update or delete on public.challenge_boosts
  for each row execute function public.trg_recalc_points_on_boost();


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
     where s.challenge_id = p_challenge and s.submitted_at >= b.starts_at and s.submitted_at < b.ends_at
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
       where s.challenge_id = p_challenge
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
revoke execute on function public.challenge_welcome_rewards(uuid) from public, anon, authenticated;
