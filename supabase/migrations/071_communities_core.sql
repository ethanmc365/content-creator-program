-- 071: communities, memberships, channels and invites.
--
-- The platform becomes ONE WORLDWIDE NETWORK with local market chapters nested
-- inside it. This is not a set of parallel tenants: there is exactly one community
-- of kind='network' that every creator belongs to permanently, and chapters sit
-- inside it carrying only what needs a local owner (briefs, payouts, roster, local
-- chat, a country manager).
--
-- ADDITIVE ONLY. This migration creates tables nothing reads and adds one column
-- nothing writes. The live UK app cannot observe any of it.
--
-- RLS is enabled on every new table with ZERO policies, which is deny-all to the
-- anon and authenticated roles and service-role only. That is the correct posture
-- until the real policies land in phase 3, and it matches the existing treatment
-- of private.config and public.auth_attempts.
--
-- Reversible:
--   drop table public.community_invites, public.channels,
--              public.community_members, public.communities cascade;
--   alter table public.profiles drop column platform_role;

-- ------------------------------------------------------------------ communities
create table if not exists public.communities (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  kind           text not null default 'chapter'
                   check (kind in ('network','chapter')),
  -- Drives the chapter SUGGESTION at signup. Never a silent assignment: a British
  -- creator living in Lisbon picks for themselves.
  country_codes  char(2)[] not null default '{}',
  language       text not null default 'en',
  currency       text not null default 'EUR'
                   check (currency in ('GBP','EUR','USD','SEK','DKK','NOK','RON','PLN','CHF')),
  timezone       text not null default 'UTC',
  lead_id        uuid references public.profiles(id) on delete set null,
  -- A chapter stays invisible and unjoinable until a lead is assigned and the
  -- launch checklist is done. Seeded markets below are deliberately inactive.
  is_active      boolean not null default false,
  join_mode      text not null default 'review'
                   check (join_mode in ('review','instant')),
  cpm_target     numeric(10,2) not null default 0.50,
  -- Historical pre-platform spend, per chapter. Replaces the hardcoded
  -- PRIZE_BASELINE=500 in src/lib/utils and the literal inside landing_stats().
  prize_baseline numeric(10,2) not null default 0,
  brand          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- Exactly one network community, enforced by the database rather than by
-- convention, so my_scopes() can include it unconditionally.
create unique index if not exists communities_one_network
  on public.communities (kind) where kind = 'network';

create index if not exists communities_active_idx
  on public.communities (is_active) where is_active;

alter table public.communities enable row level security;

-- ------------------------------------------------------------ community_members
-- Many-to-many. Role lives on the MEMBERSHIP, not the person: a country manager
-- manages specific chapters. Platform-wide admin is a different thing entirely and
-- lives on profiles.platform_role.
create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'creator'
                 check (role in ('creator','manager')),
  -- The chapter whose briefs and payouts are theirs. Network membership is not a
  -- home. A creator with no chapter yet simply has no home row, which is a legal
  -- and meaningful state rather than an error.
  is_home      boolean not null default false,
  status       text not null default 'active'
                 check (status in ('active','pending','left','removed')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, profile_id)
);

create index if not exists community_members_profile_idx
  on public.community_members (profile_id);
create index if not exists community_members_role_idx
  on public.community_members (community_id, role) where role = 'manager';

create unique index if not exists community_members_one_home
  on public.community_members (profile_id) where is_home;

alter table public.community_members enable row level security;

-- ---------------------------------------------------------------------- channels
-- Chat channels become ROWS. Today `messages.channel` is a text key with a
-- hardcoded array in src/pages/Chat.jsx, so there is no entity to attach a scope
-- to. Rows are populated in phase 2; this only creates the shape.
create table if not exists public.channels (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  key          text not null,
  label        text not null,
  hint         text,
  icon         text,
  -- 'all'   everyone in scope may post
  -- 'staff' only managers and global admins post, everyone in scope reads
  post_policy  text not null default 'all'
                 check (post_policy in ('all','staff')),
  -- 'scope' visible to everyone in the community
  -- 'staff' visible ONLY to managers and global admins (the #staff room)
  visibility   text not null default 'scope'
                 check (visibility in ('scope','staff')),
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  unique (community_id, key)
);

create index if not exists channels_community_idx
  on public.channels (community_id, position);

alter table public.channels enable row level security;

-- -------------------------------------------------------------- community_invites
-- Two shapes share this table and they are NOT interchangeable:
--   creator invite: multi-use with a seat cap, meant to be shared in a group chat
--   staff invite:   single use, 72h, BOUND TO AN EMAIL. A leaked staff invite is a
--                   full chapter takeover, so email_lock is mandatory for role
--                   'manager' and enforced by the check constraint below.
create table if not exists public.community_invites (
  token        text primary key default encode(gen_random_bytes(16),'hex'),
  community_id uuid not null references public.communities(id) on delete cascade,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'creator'
                 check (role in ('creator','manager')),
  email_lock   text,
  max_uses     int,
  used_count   int not null default 0,
  expires_at   timestamptz,
  revoked      boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint staff_invites_must_be_locked check (
    role <> 'manager'
    or (email_lock is not null and max_uses = 1 and expires_at is not null)
  )
);

create index if not exists community_invites_community_idx
  on public.community_invites (community_id) where not revoked;

alter table public.community_invites enable row level security;

-- ----------------------------------------------------------------- platform role
-- Global admin is a PLATFORM role, not a membership. It can never be granted by a
-- token or an invite: only by an existing global admin, and audit-logged. The
-- existing `is_admin` boolean is left completely untouched here and is migrated in
-- phase 2, so nothing that reads it changes behaviour.
alter table public.profiles
  add column if not exists platform_role text not null default 'none';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_platform_role_check') then
    alter table public.profiles add constraint profiles_platform_role_check
      check (platform_role in ('none','global_admin'));
  end if;
end $$;

-- ------------------------------------------------------------------------- seed
-- The network, plus the six named markets. Only Worldwide and UK are active:
-- everything else stays invisible until it has a lead and a launch checklist.
--
-- UK is seeded as 'UK & Ireland' with both country codes because Ireland is 11 of
-- the 44 current creators and THREE of the eleven who have submitted to the live
-- challenge. Renaming it to plain 'UK' and splitting Ireland out later is a single
-- update; ejecting Irish creators from a live challenge is not recoverable.
insert into public.communities
  (slug, name, kind, country_codes, language, currency, timezone, is_active, prize_baseline)
values
  ('worldwide','Worldwide','network','{}','en','EUR','UTC',true, 0),
  ('uk','UK & Ireland','chapter','{GB,IE}','en','GBP','Europe/London',true, 500),
  ('spain','Spain','chapter','{ES}','en','EUR','Europe/Madrid',false, 0),
  ('portugal','Portugal','chapter','{PT}','en','EUR','Europe/Lisbon',false, 0),
  ('germany','Germany','chapter','{DE}','en','EUR','Europe/Berlin',false, 0),
  ('romania','Romania','chapter','{RO}','en','RON','Europe/Bucharest',false, 0),
  ('nordics','Nordics','chapter','{SE,DK,NO,FI,IS}','en','EUR','Europe/Stockholm',false, 0)
on conflict (slug) do nothing;
