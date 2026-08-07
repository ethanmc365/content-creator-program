-- 073: phase 2 backfill. Give every existing creator their memberships, turn the
-- three chat channel strings into rows, and scope every existing row.
--
-- This is the first migration whose mistakes would be VISIBLE, so read the safety
-- notes before changing anything.
--
-- WHY THIS CANNOT BREAK THE LIVE UK APP
--
--   1. Every column it writes is one nothing reads. `community_id`, `channel_id`
--      and `platform_role` were added in 071/072 and no query in `main` selects
--      or filters on them.
--   2. `community_members` and `channels` are deny-all to the anon and
--      authenticated roles (RLS on, zero policies), so the live app cannot see a
--      single row this creates.
--   3. It fires no notifications. The three AFTER INSERT OR UPDATE triggers on
--      the tables touched here (`on_challenge_live`, `on_job_opened`,
--      `on_reward_distributed`) are each guarded by
--      `old.status is distinct from new.status`. Setting `community_id` does not
--      change `status`, so `notify_all()` is never reached and the 44 creators
--      are not messaged. Verified against the function bodies, not assumed.
--   4. `protect_logged_views` (BEFORE UPDATE on submissions) only raises when
--      `logged_views` changes AND `auth.uid()` is not null. A migration runs as
--      postgres with no auth context and does not touch that column.
--
-- REVERSAL IS EXACT because the pre-state is uniformly null: every `community_id`
-- on every scoped table, every `channel_id`, and every non-default
-- `platform_role` was verified to be 0 rows before this ran. The snapshot table
-- below records that fact and the per-table counts, so the reversal can be
-- checked rather than trusted:
--
--   delete from public.community_members;
--   delete from public.channels;
--   update public.profiles set platform_role = 'none';
--   update public.messages set community_id = null, channel_id = null;
--   ... same for each table listed in migration_073_snapshot ...

-- ------------------------------------------------------------------- snapshot
-- Records what the world looked like immediately before the backfill, so a
-- reversal can be verified against numbers rather than memory.
create table if not exists public.migration_073_snapshot (
  table_name  text primary key,
  row_count   bigint not null,
  scoped_rows bigint not null,
  taken_at    timestamptz not null default now()
);

alter table public.migration_073_snapshot enable row level security;

insert into public.migration_073_snapshot (table_name, row_count, scoped_rows)
select 'profiles', count(*), count(*) filter (where platform_role <> 'none') from public.profiles
union all select 'challenges', count(*), count(*) filter (where community_id is not null) from public.challenges
union all select 'submissions', count(*), count(*) filter (where community_id is not null) from public.submissions
union all select 'results', count(*), count(*) filter (where community_id is not null) from public.results
union all select 'rewards', count(*), count(*) filter (where community_id is not null) from public.rewards
union all select 'invoices', count(*), count(*) filter (where community_id is not null) from public.invoices
union all select 'events', count(*), count(*) filter (where community_id is not null) from public.events
union all select 'polls', count(*), count(*) filter (where community_id is not null) from public.polls
union all select 'messages', count(*), count(*) filter (where channel_id is not null) from public.messages
union all select 'resources', count(*), count(*) filter (where community_id is not null) from public.resources
union all select 'jobs', count(*), count(*) filter (where community_id is not null) from public.jobs
union all select 'feedback', count(*), count(*) filter (where community_id is not null) from public.feedback
union all select 'referrals', count(*), count(*) filter (where community_id is not null) from public.referrals
union all select 'admin_notes', count(*), count(*) filter (where community_id is not null) from public.admin_notes
union all select 'creator_admin_notes', count(*), count(*) filter (where community_id is not null) from public.creator_admin_notes
union all select 'application_decisions', count(*), count(*) filter (where community_id is not null) from public.application_decisions
union all select 'email_campaigns', count(*), count(*) filter (where community_id is not null) from public.email_campaigns
union all select 'scheduled_announcements', count(*), count(*) filter (where community_id is not null) from public.scheduled_announcements
on conflict (table_name) do nothing;

-- ---------------------------------------------------------------- memberships
-- Everyone who can log in gets the network, permanently. Pending creators are
-- included: they can already see the app, so excluding them would take things
-- away rather than leave them unchanged.
insert into public.community_members (community_id, profile_id, role, is_home, status)
select c.id, p.id, 'creator', false, 'active'
from public.profiles p
cross join public.communities c
where c.slug = 'worldwide'
  and p.status in ('active', 'pending')
on conflict (community_id, profile_id) do nothing;

-- EVERY current creator gets UK & Ireland as their home, regardless of where they
-- live. This is deliberate and is NOT a country-based split.
--
-- Ireland holds 3 of the 11 creators who have submitted to the running challenge,
-- and Latvia and Poland hold one each. Assigning homes by `country_code` today
-- would eject 5 of those 11 from a live challenge, which breaks the one hard
-- constraint of this project. Reassignment becomes a deliberate admin action once
-- the target chapters have leads.
insert into public.community_members (community_id, profile_id, role, is_home, status)
select c.id, p.id, 'creator', true, 'active'
from public.profiles p
cross join public.communities c
where c.slug = 'uk'
  and p.status in ('active', 'pending')
on conflict (community_id, profile_id) do nothing;

-- ------------------------------------------------------------- platform admins
-- `is_admin` stays exactly as it is; 23 files still read it and this migration
-- must not change their behaviour. `platform_role` is written ALONGSIDE it so the
-- new shell has a role to read, and the old boolean is only retired in the
-- contract phase, long after the cutover.
update public.profiles
set platform_role = 'global_admin'
where is_admin = true and platform_role <> 'global_admin';

-- Admins also manage the UK chapter, since they are the ones running it.
update public.community_members m
set role = 'manager'
from public.profiles p, public.communities c
where m.profile_id = p.id
  and m.community_id = c.id
  and c.slug = 'uk'
  and p.is_admin = true;

-- ------------------------------------------------------------------- channels
-- The three live channel strings become rows on WORLDWIDE, not on UK.
--
-- This is the locked chat decision. `#general` holds 110 of the 127 messages on
-- the platform and is the only room with any conversational density at all.
-- Putting it behind a chapter wall would hide the one working conversation from
-- every future market, and duplicating it would split it. Chapters instead get
-- purposeful, low-traffic rooms below, which do not need density to feel alive.
insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
select c.id, v.key, v.label, v.hint, v.icon, v.post_policy, v.visibility, v.position
from public.communities c
cross join (values
  ('general',       'Worldwide',     'Every creator in the network, one room.',        'globe',  'all',   'scope', 0),
  ('introductions', 'Introductions', 'New here? Say hello.',                           'smile',  'all',   'scope', 1),
  ('announcements', 'Announcements', 'News from the Tryp.com team.',                   'bell',   'staff', 'scope', 2),
  ('content_tips',  'Content tips',  'What is working right now, from people doing it.','bulb',   'all',   'scope', 3),
  ('staff',         'Staff',         'Country managers and the Tryp.com team.',        'shield', 'staff', 'staff', 4)
) as v(key, label, hint, icon, post_policy, visibility, position)
where c.slug = 'worldwide'
on conflict (community_id, key) do nothing;

-- UK gets purposeful rooms only. They start empty on purpose.
insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
select c.id, v.key, v.label, v.hint, v.icon, v.post_policy, v.visibility, v.position
from public.communities c
cross join (values
  ('briefs',  'Briefs',  'Questions about the current challenge brief.', 'flag',     'all', 'scope', 0),
  ('wins',    'Wins',    'Post a result you are proud of.',              'trophy',   'all', 'scope', 1),
  ('meetups', 'Meetups', 'Who is filming where, and when.',             'calendar', 'all', 'scope', 2)
) as v(key, label, hint, icon, post_policy, visibility, position)
where c.slug = 'uk'
on conflict (community_id, key) do nothing;

-- Point every existing message at its channel row. `messages.channel` is KEPT:
-- the live app still reads it, and it is only dropped in the contract phase.
update public.messages m
set channel_id = ch.id,
    community_id = ch.community_id
from public.channels ch
join public.communities c on c.id = ch.community_id
where c.slug = 'worldwide'
  and ch.key = m.channel
  and m.channel_id is null;

-- ---------------------------------------------------------------- scope rows
-- Chapter-scoped: the things a local market owns and a country manager runs.
update public.challenges              set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.submissions             set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.results                 set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.rewards                 set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.invoices                set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.events                  set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.polls                   set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.creator_admin_notes     set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.application_decisions   set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.email_campaigns         set community_id = (select id from public.communities where slug = 'uk') where community_id is null;
update public.scheduled_announcements set community_id = (select id from public.communities where slug = 'uk') where community_id is null;

-- Network-scoped. These follow the scope list in the architecture rather than the
-- "everything to UK" shorthand: resources and jobs are explicitly NETWORK scope,
-- and bug reports, referrals and the team's own notes are about the platform, not
-- about one market. Scoping them to UK would mean Spain opens with an empty
-- resource library and no job board.
--
-- This is invisible today either way, because every creator is in both Worldwide
-- and UK. It is a single UPDATE to change if the call goes the other way.
update public.resources   set community_id = (select id from public.communities where slug = 'worldwide') where community_id is null;
update public.jobs        set community_id = (select id from public.communities where slug = 'worldwide') where community_id is null;
update public.feedback    set community_id = (select id from public.communities where slug = 'worldwide') where community_id is null;
update public.referrals   set community_id = (select id from public.communities where slug = 'worldwide') where community_id is null;
update public.admin_notes set community_id = (select id from public.communities where slug = 'worldwide') where community_id is null;

-- --------------------------------------------------------------- new signups
-- Until the new signup flow lands in phase 4, a creator who joins tomorrow would
-- have no memberships at all and would see an empty app the moment the flag goes
-- on. This trigger gives every new profile the network automatically. It does NOT
-- assign a chapter: "no home yet" is a legal, meaningful state, and picking a
-- market for someone based on their IP or their country field is exactly the
-- silent assignment the architecture rules out.
create or replace function public.on_profile_join_network()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.community_members (community_id, profile_id, role, is_home, status)
  select id, new.id, 'creator', false, 'active'
  from public.communities where kind = 'network'
  on conflict (community_id, profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_profile_join_network on public.profiles;
create trigger trg_on_profile_join_network
  after insert on public.profiles
  for each row execute function public.on_profile_join_network();
