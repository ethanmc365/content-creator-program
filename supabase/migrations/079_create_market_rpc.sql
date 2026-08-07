-- 079: one call that opens a new market, and per-community settings.
--
-- Creating a market is five inserts that must all succeed or all fail: the
-- community, its rooms, its scoring template, its lead, and the lead's
-- membership. Doing that from the client means five round trips, any of which
-- can fail and leave a half-built market that looks fine in a list and breaks
-- when someone opens it. One SECURITY DEFINER function makes it atomic.
--
-- It is global-admin only, checked inside the function. A country manager can
-- edit the market they run; they cannot conjure new ones.

-- Per-community settings. `communities.brand` already exists as free jsonb; this
-- is the typed, meaningful half: things a market genuinely varies on.
alter table public.communities
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.communities.settings is
  'Per-market settings: welcome copy, whether the market shows a leaderboard, submission limits. Free-form so a market can gain a setting without a migration.';

create or replace function public.create_market(
  p_slug          text,
  p_name          text,
  p_country_codes text[],
  p_currency      text default 'EUR',
  p_timezone      text default 'UTC',
  p_lead          uuid default null,
  p_cpm_target    numeric default 0.50,
  p_copy_rules_from text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id     uuid;
  v_source uuid;
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
    (slug, name, kind, country_codes, currency, timezone, lead_id, cpm_target, is_active)
  values
    -- A new market opens CLOSED. It becomes visible only once someone has
    -- looked at it and turned it on, which is the difference between a market
    -- that launches and a market that leaks half-finished.
    (p_slug, p_name, 'chapter', coalesce(p_country_codes, '{}'), p_currency, p_timezone,
     p_lead, p_cpm_target, false)
  returning id into v_id;

  -- The standard room set. Same shape every market gets, so a creator moving
  -- between them finds the same furniture.
  insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
  values
    (v_id, 'general',       'General',       'Everything going on in ' || p_name || '.', 'chat',     'all',   'scope', -2),
    (v_id, 'announcements', 'Announcements', 'News for ' || p_name || ' from the team.', 'bell',     'staff', 'scope', -1),
    (v_id, 'briefs',        'Briefs',        'Questions about the current brief.',       'flag',     'all',   'scope', 0),
    (v_id, 'wins',          'Wins',          'Post a result you are proud of.',          'trophy',   'all',   'scope', 1),
    (v_id, 'meetups',       'Meetups',       'Who is filming where, and when.',          'calendar', 'all',   'scope', 2);

  -- Scoring template, copied from an existing market if one was named. This is
  -- what makes Spain a template rather than a special case.
  if p_copy_rules_from is not null then
    select id into v_source from public.communities where slug = p_copy_rules_from;
    if v_source is not null then
      insert into public.point_rules (community_id, challenge_id, kind, label, points, threshold, max_points, position)
      select v_id, null, kind, label, points, threshold, max_points, position
      from public.point_rules
      where community_id = v_source and challenge_id is null;
    end if;
  end if;

  -- The lead joins their own market as its manager, with it as their home only
  -- if they do not already have one. The partial unique index on is_home makes
  -- a second home an error rather than a silent overwrite.
  if p_lead is not null then
    insert into public.community_members (community_id, profile_id, role, is_home, status)
    values (v_id, p_lead, 'manager',
            not exists (select 1 from public.community_members where profile_id = p_lead and is_home),
            'active')
    on conflict (community_id, profile_id) do update set role = 'manager';
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_market(text, text, text[], text, text, uuid, numeric, text) from public, anon;
grant execute on function public.create_market(text, text, text[], text, text, uuid, numeric, text) to authenticated;
