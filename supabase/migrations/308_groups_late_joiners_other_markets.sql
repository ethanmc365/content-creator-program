-- 308: split challenges, made whole (1 Oct 2026).
--
-- The Spanish October challenge is the first to run two leaderboards for real,
-- and four things about a split challenge were not finished:
--
--   1. ITS SPEND WAS ZERO. A split challenge keeps its prizes on the GROUPS, so
--      `challenges.prize_amount` stayed null - and every analytics surface (the
--      programme metrics, the economics band, the CPM) reads that column. The
--      challenge row now carries the SUM of its boards' pots, kept true by
--      triggers on both tables, so every reader is right without knowing groups
--      exist.
--   2. SOMEBODY WHO JOINS HALF WAY THROUGH WAS ON NO BOARD. They are now dealt
--      onto the smallest board the moment they become an active creator in the
--      market (or, as a safety net, the moment they enter), and the market's
--      managers are told so they can move them.
--   3. A CREATOR COULD NOT SEE THAT OTHER MARKETS RUN CHALLENGES AT ALL. RLS
--      hides another market's live challenge, rightly; `other_market_challenges`
--      returns the shop window only (title, market, dates, counts).
--   4. A JOIN REQUEST CARRIED NO REASON AND TOLD NOBODY. It now carries the
--      challenge it came from, and the global admins and that market's
--      managers get a notification with the creator's own words in it.

-- ---------------------------------------------------------------------------
-- 1. The pot of a split challenge is the sum of its boards.
-- ---------------------------------------------------------------------------
create or replace function public.challenge_groups_pot()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_pot numeric;
  v_winners integer;
  v_types text[];
begin
  select sum(g.prize_amount), sum(g.winners_count), array_agg(distinct g.prize_type) filter (where g.prize_type is not null)
    into v_pot, v_winners, v_types
    from public.challenge_groups g
   where g.challenge_id = new.id;
  -- No groups (or groups that have stated no pot): the challenge's own numbers stand.
  if v_pot is not null then
    new.prize_amount := v_pot;
    new.winners_count := coalesce(v_winners, new.winners_count);
    if array_length(v_types, 1) = 1 then
      new.prize_type := v_types[1];
    elsif array_length(v_types, 1) > 1 then
      new.prize_type := 'cash_voucher';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_challenge_groups_pot on public.challenges;
create trigger trg_challenge_groups_pot
  before insert or update on public.challenges
  for each row execute function public.challenge_groups_pot();

-- A board changing re-runs the rule above on its challenge.
create or replace function public.challenge_groups_touch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid := coalesce(new.challenge_id, old.challenge_id);
begin
  update public.challenges set prize_amount = prize_amount where id = v_id;
  return null;
end $$;

drop trigger if exists trg_challenge_groups_touch on public.challenge_groups;
create trigger trg_challenge_groups_touch
  after insert or update of prize_amount, winners_count, prize_type or delete on public.challenge_groups
  for each row execute function public.challenge_groups_touch();

-- ---------------------------------------------------------------------------
-- 1b. The Spanish boards as their admin meant them. Group B's 4th-6th places
--     say "en voucher" and were saved as CASH, which would have drafted three
--     cash invoices; Group A's identical places are vouchers. Both groups'
--     taking-part reward is a 10 euro voucher that was stored as words only.
-- ---------------------------------------------------------------------------
update public.challenge_groups g
   set prize_structure = (
         select jsonb_agg(
                  case
                    when (p ->> 'prize') ~* 'voucher' then
                      p || jsonb_build_object('type', 'voucher',
                             'prize', case when (p ->> 'prize') ~ '€' then p ->> 'prize'
                                           else regexp_replace(p ->> 'prize', '^(\d+)', '\1€') end)
                    when coalesce(p ->> 'type', '') = '' then p || jsonb_build_object('type', 'cash')
                    else p
                  end order by ord)
           from jsonb_array_elements(g.prize_structure) with ordinality as e(p, ord)),
       participation_amount = coalesce(g.participation_amount, 10),
       participation_reward_type = coalesce(g.participation_reward_type, 'voucher')
 where g.challenge_id = '08b09b10-59b7-4eaf-b8b8-be2b6498594e';

-- Re-run the pot rule on every split challenge (Spain: 360 + 360).
update public.challenges c set prize_amount = prize_amount
 where exists (select 1 from public.challenge_groups g where g.challenge_id = c.id);

-- ---------------------------------------------------------------------------
-- 2. Late joiners are dealt onto the smallest board, and the managers told.
-- ---------------------------------------------------------------------------
create or replace function public.place_in_challenge_groups(p_profile uuid, p_challenge uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_p record;
  c record;
  v_group record;
  v_placed integer := 0;
  v_mgr record;
  v_notified integer;
begin
  select id, name, is_admin, is_test, coalesce(is_sandbox, false) as is_sandbox, status
    into v_p from public.profiles where id = p_profile;
  -- The same audience the group editor deals from: active creators, never staff or QA.
  if v_p.id is null or v_p.is_admin or v_p.is_test or v_p.is_sandbox or v_p.status <> 'active' then
    return 0;
  end if;

  for c in
    select ch.id, ch.title, ch.community_id
      from public.challenges ch
     where ch.status in ('active', 'draft')
       and ch.end_date > now()
       and (p_challenge is null or ch.id = p_challenge)
       and exists (select 1 from public.challenge_groups g where g.challenge_id = ch.id)
       and ch.community_id in (
             select m.community_id from public.community_members m
              where m.profile_id = p_profile and m.status = 'active')
       and not exists (
             select 1 from public.challenge_group_members gm
              where gm.challenge_id = ch.id and gm.creator_id = p_profile)
  loop
    -- The board with the fewest people on it; the first board breaks a tie.
    select g.id, g.name,
           (select count(*) from public.challenge_group_members gm where gm.group_id = g.id) as n
      into v_group
      from public.challenge_groups g
     where g.challenge_id = c.id
     order by 3, g.position, g.created_at
     limit 1;

    insert into public.challenge_group_members (challenge_id, group_id, creator_id)
    values (c.id, v_group.id, p_profile)
    on conflict do nothing;
    if not found then continue; end if;
    v_placed := v_placed + 1;

    -- The market's own managers; the platform's global admins if it has none.
    v_notified := 0;
    for v_mgr in
      select distinct p.id
        from public.community_members m
        join public.profiles p on p.id = m.profile_id
       where m.community_id = c.community_id and m.role = 'manager' and m.status = 'active'
         and p.is_admin and not p.is_test and not coalesce(p.is_sandbox, false)
    loop
      perform public.notify_user(
        v_mgr.id, 'challenge',
        format('%s joined %s: placed in %s', coalesce(v_p.name, 'A creator'), c.title, v_group.name),
        format('They joined after the groups were set, so they were put on the smallest board (%s). Check and move them if they belong on another one.', v_group.name),
        '/admin/challenges/' || c.id || '/edit#groups');
      v_notified := v_notified + 1;
    end loop;
    if v_notified = 0 then
      perform public.notify_user(
        p.id, 'challenge',
        format('%s joined %s: placed in %s', coalesce(v_p.name, 'A creator'), c.title, v_group.name),
        format('They joined after the groups were set, so they were put on the smallest board (%s). Check and move them if they belong on another one.', v_group.name),
        '/admin/challenges/' || c.id || '/edit#groups')
      from public.profiles p
      where p.platform_role in ('owner', 'global_admin') and not p.is_test and not coalesce(p.is_sandbox, false);
    end if;
  end loop;
  return v_placed;
end $$;

revoke all on function public.place_in_challenge_groups(uuid, uuid) from public, anon, authenticated;

create or replace function public.trg_place_member_in_groups()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'active' and new.role = 'creator'
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.place_in_challenge_groups(new.profile_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_place_member_in_groups on public.community_members;
create trigger trg_place_member_in_groups
  after insert or update of status on public.community_members
  for each row execute function public.trg_place_member_in_groups();

-- An approved application turns a pending profile active while its membership
-- row already exists, so the profile flipping is the other moment to deal.
create or replace function public.trg_place_profile_in_groups()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    perform public.place_in_challenge_groups(new.id);
  end if;
  return null;
end $$;

drop trigger if exists trg_place_profile_in_groups on public.profiles;
create trigger trg_place_profile_in_groups
  after update of status on public.profiles
  for each row execute function public.trg_place_profile_in_groups();

-- The safety net: an entry on a split challenge from somebody on no board deals
-- them in BEFORE the row lands, so the scoring triggers rank it on a real board.
create or replace function public.trg_place_submitter_in_groups()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.challenge_groups g where g.challenge_id = new.challenge_id)
     and not exists (select 1 from public.challenge_group_members gm
                      where gm.challenge_id = new.challenge_id and gm.creator_id = new.creator_id) then
    perform public.place_in_challenge_groups(new.creator_id, new.challenge_id);
  end if;
  return new;
end $$;

drop trigger if exists trg_place_submitter_in_groups on public.submissions;
create trigger trg_place_submitter_in_groups
  before insert on public.submissions
  for each row execute function public.trg_place_submitter_in_groups();

-- Everybody already on a split challenge's roster and on no board (Spain has
-- three: approved after the split was made).
do $$
declare r record;
begin
  for r in
    select distinct m.profile_id
      from public.challenges ch
      join public.community_members m on m.community_id = ch.community_id and m.status = 'active' and m.role = 'creator'
     where ch.status in ('active', 'draft') and ch.end_date > now()
       and exists (select 1 from public.challenge_groups g where g.challenge_id = ch.id)
       and not exists (select 1 from public.challenge_group_members gm where gm.challenge_id = ch.id and gm.creator_id = m.profile_id)
  loop
    perform public.place_in_challenge_groups(r.profile_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The other markets' live challenges, as a shop window.
-- ---------------------------------------------------------------------------
create or replace function public.other_market_challenges()
returns table (
  id uuid, title text, community_id uuid, market_name text, market_slug text,
  country_codes text[], start_date timestamptz, end_date timestamptz, scoring text,
  entries bigint, creators bigint, join_state text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select ch.id, ch.title, co.id, co.name, co.slug, co.country_codes,
         ch.start_date, ch.end_date, ch.scoring,
         (select count(*) from public.submissions s where s.challenge_id = ch.id),
         (select count(distinct s.creator_id) from public.submissions s where s.challenge_id = ch.id),
         case
           when exists (select 1 from public.market_join_requests r
                         where r.community_id = co.id and r.profile_id = auth.uid() and r.status = 'pending')
             then 'pending'
           else null
         end
    from public.challenges ch
    join public.communities co on co.id = ch.community_id
   where public.is_member()
     and ch.status = 'active'
     and ch.end_date > now()
     and co.kind <> 'network'
     and co.is_active
     and co.id not in (select public.my_scopes())
   order by ch.end_date
$$;

revoke all on function public.other_market_challenges() from public, anon;
grant execute on function public.other_market_challenges() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. A join request says why, and that market's managers (and the owner) hear about it.
-- ---------------------------------------------------------------------------
alter table public.market_join_requests
  add column if not exists challenge_id uuid references public.challenges(id) on delete set null;

create or replace function public.on_market_join_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_name text;
  v_market text;
  v_challenge text;
  v_body text;
begin
  select name into v_name from public.profiles where id = new.profile_id;
  select name into v_market from public.communities where id = new.community_id;
  select title into v_challenge from public.challenges where id = new.challenge_id;
  v_body := concat_ws(' ',
    case when v_challenge is not null then format('Through the challenge "%s".', v_challenge) end,
    case when coalesce(btrim(new.note), '') <> '' then format('Why: "%s"', left(btrim(new.note), 280)) end,
    'Accept or decline it in Global settings.');
  perform public.notify_user(
    p.id, 'community',
    format('%s asked to join %s', coalesce(v_name, 'A creator'), coalesce(v_market, 'a market')),
    v_body, '/global/settings')
  from public.profiles p
  where p.is_admin and not p.is_test and not coalesce(p.is_sandbox, false)
    and (p.platform_role = 'owner'
         or exists (select 1 from public.community_members m
                     where m.community_id = new.community_id and m.profile_id = p.id
                       and m.role = 'manager' and m.status = 'active')
         -- A market nobody manages yet: every global admin, so it is never unheard.
         or (p.platform_role = 'global_admin' and not exists (
               select 1 from public.community_members m join public.profiles q on q.id = m.profile_id
                where m.community_id = new.community_id and m.role = 'manager' and m.status = 'active'
                  and q.platform_role <> 'owner' and not q.is_test and not coalesce(q.is_sandbox, false))));
  return null;
end $$;

drop trigger if exists trg_on_market_join_request on public.market_join_requests;
create trigger trg_on_market_join_request
  after insert on public.market_join_requests
  for each row execute function public.on_market_join_request();
