-- 080: how you join a market, what a market owns, and how a challenge is won.
--
-- Three things that turned out to be the same change.
--
-- 1. JOINING. Until now a membership could only be written by someone who
--    MANAGES the community (074's community_members_manage policy). That was
--    right while every creator was placed by a backfill, and wrong the moment
--    the product asks a creator to pick their own market at the end of
--    onboarding. Self-service joining needs a definer function, because the
--    alternative is an insert policy that lets a creator write themselves into
--    any community including ones that are closed.
--
-- 2. ROOMS. Every market shipped with five rooms: General, Announcements,
--    Briefs, Wins and Meetups. Briefs and Wins were speculative, and neither
--    ever held a message. Briefs in particular was actively confusing: a brief
--    is part of a challenge, not a chat room, so a market appeared to have two
--    different places to talk about the same thing.
--
-- 3. SCORING. `challenges.scoring` allowed 'prize' or 'points'. A challenge now
--    picks one of three ways to decide a winner, and the choice is made when
--    the challenge is created rather than inherited from the market.
--
-- WHAT THIS CANNOT CHANGE FOR A UK CREATOR
--
-- No policy on an existing table is touched. The only rows deleted are chapter
-- channels with zero messages (verified: the only channels holding messages are
-- the three unnamespaced worldwide ones, 111 + 12 + 5). The UK's live challenge
-- keeps scoring='prize' and its constraint still accepts that value. The three
-- new functions are additive.

-- =====================================================================
-- 1. What a market carries
-- =====================================================================

alter table public.communities
  add column if not exists join_policy text not null default 'country',
  add column if not exists tagline     text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_join_policy_check') then
    alter table public.communities add constraint communities_join_policy_check
      check (join_policy in ('country', 'open', 'invite'));
  end if;
end $$;

comment on column public.communities.join_policy is
  'country = creators whose country_code is in country_codes may join themselves (the default, and what the product means by "your market"); open = any creator may join; invite = a manager must add them.';

comment on column public.communities.tagline is
  'One line shown under the market name. Editable per market so Spain does not have to describe itself in the UK''s words.';

-- =====================================================================
-- 2. The room set
-- =====================================================================

-- Briefs and Wins go. Deleting rather than hiding: a channel row nobody can
-- reach is a thing a future reader has to work out the status of, and these
-- have no history to preserve.
delete from public.channels ch
using public.communities c
where ch.community_id = c.id
  and c.kind = 'chapter'
  and ch.key in ('briefs', 'wins')
  and not exists (
    select 1 from public.messages m where m.channel = c.slug || ':' || ch.key
  );

-- General is the room a market is FOR, so it says so. Worldwide's was labelled
-- "Worldwide" inside a page already titled Worldwide, which told a reader
-- nothing and hid the one room they were looking for.
update public.channels ch
set label = 'General',
    hint  = coalesce(nullif(ch.hint, ''), 'The main room. Everything going on here.')
from public.communities c
where ch.community_id = c.id and ch.key = 'general' and ch.label <> 'General';

-- Meetups keeps its place but moves up now that two rooms above it are gone.
update public.channels set position = 0 where key = 'meetups';

-- =====================================================================
-- 3. Scoring
-- =====================================================================

-- 'prize' stays accepted forever. It is what every challenge run before this
-- migration used, including the one live in the UK right now; remapping those
-- rows would rewrite the rules of a contest people have already entered.
alter table public.challenges drop constraint if exists challenges_scoring_check;
alter table public.challenges add constraint challenges_scoring_check
  check (scoring in ('prize', 'points', 'best_video', 'total_views'));

comment on column public.challenges.scoring is
  'points = the point ledger decides it; best_video = the single highest-viewed entry; total_views = every entry added up; prize = legacy, judged by the team.';

-- =====================================================================
-- 4. Joining, leaving, and where home is
-- =====================================================================

-- SECURITY DEFINER because the caller has no insert rights on
-- community_members and must not be given any: every rule about who may join
-- what is enforced in here, in one place, rather than spread across a policy
-- expression that has to stay in sync with the product.
create or replace function public.join_market(p_slug text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v      public.communities%rowtype;
  v_me   uuid := auth.uid();
  v_country text;
  v_first  boolean;
begin
  if v_me is null then
    raise exception 'Not signed in';
  end if;

  select * into v from public.communities where slug = p_slug;
  if v.id is null then
    raise exception 'No market called "%"', p_slug;
  end if;

  -- The network is joined by a trigger at signup and never by hand. Allowing
  -- it here would be a second, divergent way in.
  if v.kind = 'network' then
    raise exception 'Everyone is already in %', v.name;
  end if;

  if not v.is_active and not public.is_global_admin() then
    raise exception '% is not open yet', v.name;
  end if;

  -- Already in? Say so quietly rather than erroring: a double tap on a join
  -- button is not a mistake worth a red banner.
  if exists (
    select 1 from public.community_members
    where community_id = v.id and profile_id = v_me and status = 'active'
  ) then
    return v.id;
  end if;

  select country_code into v_country from public.profiles where id = v_me;

  if v.join_policy = 'invite' and not public.is_global_admin() then
    raise exception '% is invite only. Ask the team to add you.', v.name;
  end if;

  if v.join_policy = 'country'
     and not public.is_global_admin()
     and not (v_country is not null and v_country = any (v.country_codes)) then
    raise exception '% is for creators based in that market. Your profile says %.',
      v.name, coalesce(v_country, 'no country');
  end if;

  -- Your first market becomes home. A second one does not silently take over:
  -- home is where your challenges and your default market page come from, and
  -- moving it is an explicit act (set_home_market).
  v_first := not exists (
    select 1 from public.community_members m
    join public.communities c on c.id = m.community_id
    where m.profile_id = v_me and m.is_home and c.kind = 'chapter'
  );

  insert into public.community_members (community_id, profile_id, role, is_home, status)
  values (v.id, v_me, 'creator', v_first, 'active')
  on conflict (community_id, profile_id)
    do update set status = 'active';

  return v.id;
end;
$$;

create or replace function public.leave_market(p_slug text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;

  select id into v_id from public.communities where slug = p_slug and kind = 'chapter';
  if v_id is null then raise exception 'No market called "%"', p_slug; end if;

  delete from public.community_members
  where community_id = v_id and profile_id = v_me;
end;
$$;

-- Home is unique per creator via a partial unique index, so moving it is
-- clear-then-set and has to be one statement pair inside one function. Doing it
-- from the client is two round trips with a window where the index is violated.
create or replace function public.set_home_market(p_slug text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;

  select id into v_id from public.communities where slug = p_slug;
  if v_id is null then raise exception 'No market called "%"', p_slug; end if;

  if not exists (
    select 1 from public.community_members
    where community_id = v_id and profile_id = v_me and status = 'active'
  ) then
    raise exception 'Join it before making it your home market';
  end if;

  update public.community_members set is_home = false
  where profile_id = v_me and is_home;

  update public.community_members set is_home = true
  where profile_id = v_me and community_id = v_id;
end;
$$;

revoke all on function public.join_market(text)     from public, anon;
revoke all on function public.leave_market(text)    from public, anon;
revoke all on function public.set_home_market(text) from public, anon;
grant execute on function public.join_market(text)     to authenticated;
grant execute on function public.leave_market(text)    to authenticated;
grant execute on function public.set_home_market(text) to authenticated;

-- =====================================================================
-- 5. Opening a market, second edition
-- =====================================================================

-- The 079 signature is dropped rather than overloaded. Two functions called
-- create_market with different defaults is a coin toss at call time.
drop function if exists public.create_market(text, text, text[], text, text, uuid, numeric, text);

create or replace function public.create_market(
  p_slug          text,
  p_name          text,
  p_country_codes text[],
  p_currency      text default 'EUR',
  p_timezone      text default 'UTC',
  p_lead          uuid default null,
  p_cpm_target    numeric default 0.50,
  p_tagline       text default null,
  p_join_policy   text default 'country',
  p_rooms         text[] default array['general', 'announcements', 'meetups'],
  p_open_now      boolean default false,
  p_settings      jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id    uuid;
  v_key   text;
  v_pos   int := 0;
  v_rooms text[];
begin
  if not public.is_global_admin() then
    raise exception 'Only a global admin can open a new market';
  end if;

  if p_slug !~ '^[a-z0-9-]{2,32}$' then
    raise exception 'Slug must be 2-32 characters, lowercase letters, numbers and hyphens only';
  end if;

  if exists (select 1 from public.communities where slug = p_slug) then
    raise exception 'A market with the slug "%" already exists', p_slug;
  end if;

  insert into public.communities
    (slug, name, kind, country_codes, currency, timezone, lead_id, cpm_target,
     is_active, tagline, join_policy, settings)
  values
    (p_slug, p_name, 'chapter', coalesce(p_country_codes, '{}'), p_currency, p_timezone,
     p_lead, p_cpm_target, coalesce(p_open_now, false), p_tagline,
     coalesce(p_join_policy, 'country'), coalesce(p_settings, '{}'::jsonb))
  returning id into v_id;

  -- Rooms are chosen at creation rather than fixed, but General and
  -- Announcements are forced in: a market with no main room and no way for the
  -- team to reach it is not a market.
  select array(
    select distinct e
    from unnest(array['general', 'announcements'] || coalesce(p_rooms, '{}')) e
  ) into v_rooms;

  foreach v_key in array v_rooms
  loop
    insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
    values (
      v_id, v_key,
      case v_key
        when 'general'       then 'General'
        when 'announcements' then 'Announcements'
        when 'meetups'       then 'Meetups'
        when 'feedback'      then 'Feedback'
        when 'introductions' then 'Introductions'
        else initcap(replace(v_key, '-', ' '))
      end,
      case v_key
        when 'general'       then 'The main room. Everything going on in ' || p_name || '.'
        when 'announcements' then 'News for ' || p_name || ' from the team.'
        when 'meetups'       then 'Who is filming where, and when.'
        when 'feedback'      then 'Tell the team what would help.'
        when 'introductions' then 'New here? Say hello.'
        else null
      end,
      case v_key
        when 'general'       then 'chat'
        when 'announcements' then 'megaphone'
        when 'meetups'       then 'calendar'
        when 'feedback'      then 'bulb'
        when 'introductions' then 'users'
        else 'chat'
      end,
      case when v_key = 'announcements' then 'staff' else 'all' end,
      'scope',
      case v_key when 'general' then -2 when 'announcements' then -1 else v_pos end
    )
    on conflict (community_id, key) do nothing;
    v_pos := v_pos + 1;
  end loop;

  -- The lead joins their own market as its manager, with it as their home only
  -- if they do not already have one.
  if p_lead is not null then
    insert into public.community_members (community_id, profile_id, role, is_home, status)
    values (v_id, p_lead, 'manager',
            not exists (
              select 1 from public.community_members m
              join public.communities c on c.id = m.community_id
              where m.profile_id = p_lead and m.is_home and c.kind = 'chapter'
            ),
            'active')
    on conflict (community_id, profile_id) do update set role = 'manager';
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_market(text, text, text[], text, text, uuid, numeric, text, text, text[], boolean, jsonb) from public, anon;
grant execute on function public.create_market(text, text, text[], text, text, uuid, numeric, text, text, text[], boolean, jsonb) to authenticated;

-- =====================================================================
-- 6. Existing markets get the defaults the new ones are born with
-- =====================================================================

update public.communities
set tagline = case slug
      when 'uk'      then 'The founding market. Where the programme started.'
      when 'spain'   then 'Descubre España. Briefs, rooms and challenges in Spanish markets.'
      else tagline
    end
where kind = 'chapter' and tagline is null;
