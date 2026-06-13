-- ============================================================
-- Tryp.com Creator Platform — ONE-PASTE SETUP
-- Paste this whole file into Supabase SQL Editor and click Run.
-- (all migrations + all seed data)
-- ============================================================

-- ============================================================================
-- Tryp.com Creator Program — initial database schema
-- ============================================================================
-- Run this in the Supabase SQL Editor (or `supabase db push`) BEFORE seed.sql.
-- It creates every table, row-level security (RLS) policy, trigger and
-- storage bucket the app needs.
--
-- Design notes for maintainers:
--  * Every table has RLS enabled. Creators can only touch their own rows;
--    admins (profiles.is_admin = true) can manage everything.
--  * "Soft delete" is used for chat messages (deleted flag) so moderation
--    is reversible and auditable.
--  * Notifications are created by database triggers, so they work no matter
--    which client inserts the data.
-- ============================================================================

-- Don't validate function bodies at creation time — the helper functions at
-- the top of this file reference tables that are created further down.
set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- 0. Helper: is_admin()
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER lets policies check the caller's admin flag without
-- recursing into the profiles RLS policies themselves.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- A creator who has been muted or suspended may not post anything.
create or replace function public.can_post()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select status = 'active' from public.profiles where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- 1. profiles — one row per user, linked 1:1 to auth.users
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  age int check (age is null or (age >= 16 and age <= 100)),
  photo_url text,
  bio text default '',                          -- short one-liner
  about text default '',                        -- longer free-text section
  instagram_url text,
  tiktok_url text,
  youtube_url text,
  other_links jsonb default '[]'::jsonb,        -- [{ "label": "...", "url": "..." }]
  languages text[] default '{}',
  countries_visited text[] default '{}',        -- country names matching the world map
  is_admin boolean not null default false,
  status text not null default 'active' check (status in ('active', 'muted', 'suspended')),
  onboarded boolean not null default false,     -- has finished the onboarding flow
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Everyone signed in can browse creator profiles (it's a community).
create policy "profiles: read for signed-in users"
  on public.profiles for select to authenticated using (true);

-- Users edit their own profile; admins edit anyone (mute, suspend, promote).
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles: admin update any"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Guard rail: a non-admin must never flip their own is_admin / status flags,
-- even though the "update own" policy lets them edit other columns.
create or replace function public.protect_admin_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- auth.uid() is NULL for trusted server-side connections (the dashboard
  -- SQL editor, seeds, service role) — only enforce for real app users.
  if auth.uid() is not null and not public.is_admin() then
    if new.is_admin is distinct from old.is_admin
       or new.status is distinct from old.status then
      raise exception 'Only admins can change admin or status flags';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_protect_admin_columns
  before update on public.profiles
  for each row execute function public.protect_admin_columns();

-- Auto-create a profile row the moment someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. challenges
-- ----------------------------------------------------------------------------
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  rules text default '',
  hashtags text default '',                     -- e.g. "#TrypCreators #SameTripLessMoney"
  platforms text[] default '{Instagram,TikTok}',
  prize_structure jsonb default '[]'::jsonb,    -- [{ "place": "1st", "prize": "£150 cash" }]
  start_date timestamptz not null,
  end_date timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended', 'archived')),
  -- Deadline-reminder bookkeeping (set by the pg_cron job at the bottom).
  reminder_48h_sent boolean not null default false,
  reminder_24h_sent boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.challenges enable row level security;

-- Creators see every challenge except unpublished drafts.
create policy "challenges: read published"
  on public.challenges for select to authenticated
  using (status <> 'draft' or public.is_admin());

create policy "challenges: admin manage"
  on public.challenges for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. submissions — a creator's video link entered into a challenge
-- ----------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  platform text not null check (platform in ('Instagram', 'TikTok', 'YouTube', 'Other')),
  video_url text not null,
  caption text default '',
  logged_views int,                              -- entered manually by an admin at review time
  submitted_at timestamptz not null default now()
);

alter table public.submissions enable row level security;

create policy "submissions: read for signed-in users"
  on public.submissions for select to authenticated using (true);

-- Creators may submit to ACTIVE challenges only, and only as themselves.
create policy "submissions: create own"
  on public.submissions for insert to authenticated
  with check (
    creator_id = auth.uid()
    and public.can_post()
    and exists (select 1 from public.challenges c
                where c.id = challenge_id and c.status = 'active')
  );

create policy "submissions: update own caption"
  on public.submissions for update to authenticated
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());

create policy "submissions: delete own"
  on public.submissions for delete to authenticated
  using (creator_id = auth.uid());

create policy "submissions: admin manage"
  on public.submissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Guard rail: logged_views is the admin-entered review number. The
-- "update own caption" policy must never let a creator inflate it.
create or replace function public.protect_logged_views()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- Same bypass for trusted server-side connections as protect_admin_columns.
  if auth.uid() is not null and not public.is_admin()
     and new.logged_views is distinct from old.logged_views then
    raise exception 'Only admins can set logged views';
  end if;
  return new;
end;
$$;

create trigger trg_protect_logged_views
  before update on public.submissions
  for each row execute function public.protect_logged_views();

-- ----------------------------------------------------------------------------
-- 4. results — final per-challenge standings entered by admins
-- ----------------------------------------------------------------------------
create table public.results (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  final_views int not null default 0,
  rank int not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, creator_id)
);

alter table public.results enable row level security;

create policy "results: read for signed-in users"
  on public.results for select to authenticated using (true);

create policy "results: admin manage"
  on public.results for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. wall_of_fame — admin-curated showcase per challenge
-- ----------------------------------------------------------------------------
create table public.wall_of_fame (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique references public.challenges (id) on delete cascade,
  -- Ordered list of featured creators:
  -- [{ "creator_id": "...", "note": "Admin's pick — amazing edit!" }]
  featured_spots jsonb not null default '[]'::jsonb,
  admin_note text default '',
  published boolean not null default false,
  published_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.wall_of_fame enable row level security;

-- Creators only see published walls; admins see drafts too.
create policy "wall_of_fame: read published"
  on public.wall_of_fame for select to authenticated
  using (published or public.is_admin());

create policy "wall_of_fame: admin manage"
  on public.wall_of_fame for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. rewards
-- ----------------------------------------------------------------------------
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid references public.challenges (id) on delete set null,
  reward_type text not null check (reward_type in ('cash', 'voucher')),
  amount numeric(10, 2) not null,
  currency text not null default 'GBP',
  status text not null default 'pending' check (status in ('pending', 'distributed')),
  payment_notes text default '',
  distributed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.rewards enable row level security;

-- Creators see only their own rewards; admins see all.
create policy "rewards: read own"
  on public.rewards for select to authenticated
  using (creator_id = auth.uid() or public.is_admin());

create policy "rewards: admin manage"
  on public.rewards for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. messages — group chat (general / announcements / content_tips)
-- ----------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('general', 'announcements', 'content_tips')),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  deleted boolean not null default false        -- soft delete for moderation
);

create index idx_messages_channel_created on public.messages (channel, created_at desc);

alter table public.messages enable row level security;

create policy "messages: read for signed-in users"
  on public.messages for select to authenticated using (true);

-- Anyone active can post in general/content_tips; ONLY admins in announcements.
create policy "messages: send"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_post()
    and (channel <> 'announcements' or public.is_admin())
  );

-- Moderation: only admins can flip the deleted flag.
create policy "messages: admin moderate"
  on public.messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. conversations + direct_messages — 1-to-1 DMs
-- ----------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles (id) on delete cascade,
  participant_b uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- One conversation per pair, regardless of who started it.
  constraint uq_conversation_pair unique (participant_a, participant_b),
  constraint chk_not_self check (participant_a <> participant_b)
);

alter table public.conversations enable row level security;

create policy "conversations: participants read"
  on public.conversations for select to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());

create policy "conversations: start as yourself"
  on public.conversations for insert to authenticated
  with check ((participant_a = auth.uid() or participant_b = auth.uid()) and public.can_post());

create policy "conversations: participants update"
  on public.conversations for update to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_dms_conversation on public.direct_messages (conversation_id, created_at);
create index idx_dms_unread on public.direct_messages (recipient_id) where not read;

alter table public.direct_messages enable row level security;

create policy "dms: participants read"
  on public.direct_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "dms: send as yourself"
  on public.direct_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_post()
    and exists (select 1 from public.conversations c
                where c.id = conversation_id
                  and (c.participant_a = auth.uid() or c.participant_b = auth.uid()))
  );

-- Recipient marks messages as read.
create policy "dms: recipient marks read"
  on public.direct_messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Keep the conversation's last_message_at fresh for inbox sorting.
create or replace function public.touch_conversation()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_touch_conversation
  after insert on public.direct_messages
  for each row execute function public.touch_conversation();

-- ----------------------------------------------------------------------------
-- 9. reactions — emoji reactions on group-chat messages
-- ----------------------------------------------------------------------------
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  unique (message_id, creator_id, emoji)        -- one of each emoji per person
);

alter table public.reactions enable row level security;

create policy "reactions: read for signed-in users"
  on public.reactions for select to authenticated using (true);

create policy "reactions: add own"
  on public.reactions for insert to authenticated
  with check (creator_id = auth.uid() and public.can_post());

create policy "reactions: remove own"
  on public.reactions for delete to authenticated
  using (creator_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 10. connections — "follow"-style links between creators
-- ----------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  connected_creator_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (creator_id, connected_creator_id),
  constraint chk_connection_not_self check (creator_id <> connected_creator_id)
);

alter table public.connections enable row level security;

create policy "connections: read for signed-in users"
  on public.connections for select to authenticated using (true);

create policy "connections: connect as yourself"
  on public.connections for insert to authenticated
  with check (creator_id = auth.uid());

create policy "connections: disconnect own"
  on public.connections for delete to authenticated
  using (creator_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. events — calendar items (Q&As, content days, milestones)
-- ----------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  date timestamptz not null,
  type text not null default 'event' check (type in ('event', 'qa', 'deadline', 'milestone')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;

create policy "events: read for signed-in users"
  on public.events for select to authenticated using (true);

create policy "events: admin manage"
  on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 12. resources — permanent content library
-- ----------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text default '',
  file_url text,                                -- optional downloadable asset (Supabase storage)
  category text not null default 'Tips' check (
    category in ('Tips', 'Video Ideas', 'Brand Guidelines', 'Do''s & Don''ts', 'Assets', 'Examples')
  ),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.resources enable row level security;

create policy "resources: read for signed-in users"
  on public.resources for select to authenticated using (true);

create policy "resources: admin manage"
  on public.resources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 13. notifications — in-app bell, written by triggers below
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'challenge', 'announcement', 'results', 'reward', 'deadline', 'connection', 'dm'
  )),
  title text not null,
  body text default '',
  link text default '',                         -- in-app route to open when clicked
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_recipient on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- Helper used by the triggers below — inserts ignoring RLS (security definer).
create or replace function public.notify_user(
  p_recipient uuid, p_type text, p_title text, p_body text, p_link text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link)
  values (p_recipient, p_type, p_title, p_body, p_link);
end;
$$;

-- Notify everyone active (except the actor) — for announcements & new challenges.
create or replace function public.notify_all(
  p_except uuid, p_type text, p_title text, p_body text, p_link text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link)
  select p.id, p_type, p_title, p_body, p_link
  from public.profiles p
  where p.status = 'active' and (p_except is null or p.id <> p_except);
end;
$$;

-- Trigger: new announcement → notify everyone.
create or replace function public.on_announcement()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.channel = 'announcements' then
    perform public.notify_all(
      new.sender_id, 'announcement', 'New announcement',
      left(new.body, 120), '/chat/announcements'
    );
  end if;
  return new;
end;
$$;

create trigger trg_on_announcement
  after insert on public.messages
  for each row execute function public.on_announcement();

-- Trigger: challenge goes live → notify everyone.
create or replace function public.on_challenge_live()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.notify_all(
      null, 'challenge', 'New challenge: ' || new.title,
      'A new challenge is live — check the brief and get creating!',
      '/challenges/' || new.id
    );
  end if;
  return new;
end;
$$;

create trigger trg_on_challenge_live
  after insert or update on public.challenges
  for each row execute function public.on_challenge_live();

-- Trigger: Wall of Fame published → notify everyone.
create or replace function public.on_wall_published()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.published and (tg_op = 'INSERT' or not old.published) then
    perform public.notify_all(
      null, 'results', 'Results are in! 🏆',
      'The Wall of Fame has been published — see who topped the challenge.',
      '/wall-of-fame'
    );
  end if;
  return new;
end;
$$;

create trigger trg_on_wall_published
  after insert or update on public.wall_of_fame
  for each row execute function public.on_wall_published();

-- Trigger: reward distributed → notify that creator.
create or replace function public.on_reward_distributed()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'distributed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.notify_user(
      new.creator_id, 'reward', 'Reward on its way! 🎉',
      'Your ' || new.reward_type || ' reward has been marked as distributed.',
      '/rewards'
    );
  end if;
  return new;
end;
$$;

create trigger trg_on_reward_distributed
  after insert or update on public.rewards
  for each row execute function public.on_reward_distributed();

-- Trigger: new connection → notify the connected creator.
create or replace function public.on_new_connection()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.profiles where id = new.creator_id;
  perform public.notify_user(
    new.connected_creator_id, 'connection', 'New connection',
    coalesce(v_name, 'A creator') || ' connected with you.',
    '/profile/' || new.creator_id
  );
  return new;
end;
$$;

create trigger trg_on_new_connection
  after insert on public.connections
  for each row execute function public.on_new_connection();

-- Trigger: new DM → notify recipient (deduped: skip if they already have an
-- unread DM notification for this conversation, to avoid bell spam).
create or replace function public.on_new_dm()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not exists (
    select 1 from public.notifications n
    where n.recipient_id = new.recipient_id
      and n.type = 'dm' and not n.read
      and n.link = '/messages/' || new.conversation_id
  ) then
    select name into v_name from public.profiles where id = new.sender_id;
    perform public.notify_user(
      new.recipient_id, 'dm', 'New message',
      coalesce(v_name, 'Someone') || ' sent you a message.',
      '/messages/' || new.conversation_id
    );
  end if;
  return new;
end;
$$;

create trigger trg_on_new_dm
  after insert on public.direct_messages
  for each row execute function public.on_new_dm();

-- Deadline reminders (48h / 24h before a challenge ends).
-- Called hourly by pg_cron — see the optional block at the very bottom.
create or replace function public.send_deadline_reminders()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c record;
begin
  for c in select * from public.challenges where status = 'active' loop
    if not c.reminder_48h_sent and c.end_date - now() <= interval '48 hours'
       and c.end_date > now() then
      perform public.notify_all(
        null, 'deadline', '48 hours left! ⏳',
        '"' || c.title || '" closes soon — submit your video link before the deadline.',
        '/challenges/' || c.id
      );
      update public.challenges set reminder_48h_sent = true where id = c.id;
    end if;
    if not c.reminder_24h_sent and c.end_date - now() <= interval '24 hours'
       and c.end_date > now() then
      perform public.notify_all(
        null, 'deadline', 'Final 24 hours! ⏰',
        '"' || c.title || '" ends tomorrow — last chance to enter.',
        '/challenges/' || c.id
      );
      update public.challenges set reminder_24h_sent = true where id = c.id;
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 14. Realtime — broadcast inserts/updates to subscribed clients
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.conversations;

-- ----------------------------------------------------------------------------
-- 15. Storage buckets — avatars (profile photos) and resources (assets)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('resources', 'resources', true)
on conflict (id) do nothing;

-- Each user uploads avatars into a folder named after their user id,
-- e.g. avatars/<uid>/photo.jpg — so they can only manage their own photo.
create policy "avatars: user uploads own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: user updates own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: user deletes own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "resources: admin uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resources' and public.is_admin());

create policy "resources: admin deletes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resources' and public.is_admin());

-- ----------------------------------------------------------------------------
-- 16. Public landing-page data (safe for anonymous visitors)
-- ----------------------------------------------------------------------------
-- The landing page shows live program stats and a featured-creators teaser
-- WITHOUT logging in. RLS blocks anonymous reads, so we expose exactly the
-- safe fields through two SECURITY DEFINER functions instead.
create or replace function public.landing_stats()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'creators',  (select count(*) from public.profiles where status <> 'suspended'),
    'challenges',(select count(*) from public.challenges where status <> 'draft'),
    'prizes',    (select coalesce(sum(amount), 0) from public.rewards where status = 'distributed')
  );
$$;

create or replace function public.featured_creators()
returns table (name text, photo_url text, bio text, countries int)
language sql stable security definer
set search_path = public
as $$
  -- A small, non-sensitive teaser: name, photo, one-liner, country count.
  select p.name, p.photo_url, p.bio, coalesce(array_length(p.countries_visited, 1), 0)
  from public.profiles p
  where p.status = 'active' and p.photo_url is not null and not p.is_admin
  order by coalesce(array_length(p.countries_visited, 1), 0) desc
  limit 4;
$$;

grant execute on function public.landing_stats() to anon;
grant execute on function public.featured_creators() to anon;

-- Admin-only: creator email addresses live in auth.users, not profiles.
-- This function exposes them to admins only (raises for anyone else).
create or replace function public.admin_list_emails()
returns table (id uuid, email text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return query select u.id, u.email::text from auth.users u;
end;
$$;

-- ----------------------------------------------------------------------------
-- 17. OPTIONAL: hourly deadline reminders via pg_cron
-- ----------------------------------------------------------------------------
-- pg_cron is available on Supabase free tier. Enable it under
-- Database → Extensions, then run:
--
--   select cron.schedule(
--     'challenge-deadline-reminders',
--     '0 * * * *',  -- every hour, on the hour
--     $cron$ select public.send_deadline_reminders(); $cron$
--   );
--
-- Without this the app still works — creators just won't get the automatic
-- 48h/24h bell reminders.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 002 — image attachments in chat and DMs
-- ============================================================================
-- Adds an optional image to group-chat messages and direct messages.
-- Images live in the public "chat-media" storage bucket; any active member
-- can upload into their own folder (chat-media/<user id>/...).

-- 1. Optional image on both message types.
alter table public.messages add column if not exists image_url text;
alter table public.direct_messages add column if not exists image_url text;

-- 2. Allow an empty body when a message is image-only
--    (previously body had to be 1-4000 characters).
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 4000 and (body <> '' or image_url is not null));

alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add constraint direct_messages_body_check
  check (char_length(body) <= 4000 and (body <> '' or image_url is not null));

-- 3. Public bucket for chat images.
insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

create policy "chat-media: user uploads own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_post()
  );

create policy "chat-media: user deletes own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 003 — v2 features
-- ============================================================================
-- Adds: creator home location (city/country), travel photo gallery, jobs
-- board, referrals, announcement polls, event meeting links + custom types,
-- and an email-campaign log. Safe to run once on top of 001 + 002.

set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- 1. profiles — home location + referral wiring
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists city text default '';
alter table public.profiles add column if not exists country text default '';
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;

-- Give every existing profile a short, shareable referral code.
-- Use the END of the id (the unique node segment) so codes never collide.
update public.profiles
set referral_code = upper(right(replace(id::text, '-', ''), 8))
where referral_code is null;

create unique index if not exists idx_profiles_referral_code on public.profiles (referral_code);

-- New signups get a referral code automatically, and we capture who referred
-- them (passed as ?ref=CODE → stored in auth metadata by the signup form).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ref_code text;
  v_referrer uuid;
begin
  v_ref_code := new.raw_user_meta_data ->> 'ref';
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = upper(v_ref_code);
  end if;

  insert into public.profiles (id, name, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    upper(right(replace(new.id::text, '-', ''), 8)),
    v_referrer
  );
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. creator_photos — travel gallery (up to 20 per creator, enforced in UI)
-- ----------------------------------------------------------------------------
create table if not exists public.creator_photos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  photo_url text not null,
  caption text default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_creator_photos_creator on public.creator_photos (creator_id, sort_order);

alter table public.creator_photos enable row level security;

create policy "creator_photos: read for signed-in users"
  on public.creator_photos for select to authenticated using (true);

create policy "creator_photos: manage own"
  on public.creator_photos for all to authenticated
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. jobs — roles the team is hiring for
-- ----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  location text default '',
  job_type text not null default 'Permanent',   -- Permanent / Contract / Freelance / etc.
  apply_url text,                                -- external form, or null to apply via DM
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

create policy "jobs: read open or admin"
  on public.jobs for select to authenticated
  using (status = 'open' or public.is_admin());

create policy "jobs: admin manage"
  on public.jobs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Notify everyone when a job is opened.
create or replace function public.on_job_opened()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.notify_all(
      null, 'challenge', 'We''re hiring: ' || new.title,
      coalesce(nullif(new.location, ''), 'New role') || ' — see the Jobs board.',
      '/jobs'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_job_opened on public.jobs;
create trigger trg_on_job_opened
  after insert or update on public.jobs
  for each row execute function public.on_job_opened();

-- ----------------------------------------------------------------------------
-- 4. referrals — creators recommending new creators
-- ----------------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.profiles (id) on delete set null,
  referred_name text not null,
  referred_contact text default '',              -- email or social handle
  note text default '',
  status text not null default 'new' check (status in ('new', 'contacted', 'joined', 'declined')),
  created_at timestamptz not null default now()
);

alter table public.referrals enable row level security;

-- Creators can log a referral and see their own; admins manage everything.
create policy "referrals: read own or admin"
  on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or public.is_admin());

create policy "referrals: create own"
  on public.referrals for insert to authenticated
  with check (referrer_id = auth.uid());

create policy "referrals: admin manage"
  on public.referrals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. polls — admin-created polls that live inside an announcement message
-- ----------------------------------------------------------------------------
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  created_by uuid references public.profiles (id) on delete set null,
  closes_at timestamptz,                          -- null = open until closed manually
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id)                       -- one vote per person per poll
);

-- A group message can carry a poll (rendered inline in the chat).
alter table public.messages add column if not exists poll_id uuid references public.polls (id) on delete set null;

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy "polls: read for signed-in users" on public.polls for select to authenticated using (true);
create policy "polls: admin manage" on public.polls for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "poll_options: read for signed-in users" on public.poll_options for select to authenticated using (true);
create policy "poll_options: admin manage" on public.poll_options for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "poll_votes: read for signed-in users" on public.poll_votes for select to authenticated using (true);
create policy "poll_votes: vote as yourself"
  on public.poll_votes for insert to authenticated
  with check (voter_id = auth.uid() and public.can_post());
create policy "poll_votes: change own vote"
  on public.poll_votes for delete to authenticated using (voter_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. events — meeting links + free-form types
-- ----------------------------------------------------------------------------
alter table public.events add column if not exists meeting_url text;
-- Drop the fixed-type constraint so admins can add custom event types.
alter table public.events drop constraint if exists events_type_check;

-- ----------------------------------------------------------------------------
-- 7. email_campaigns — log of bulk emails sent to creators
-- ----------------------------------------------------------------------------
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  recipient_count int not null default 0,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.email_campaigns enable row level security;

create policy "email_campaigns: admin only"
  on public.email_campaigns for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. Realtime + storage
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.poll_votes;
alter publication supabase_realtime add table public.polls;

-- Public bucket for travel-gallery photos (per-user folder, like avatars).
insert into storage.buckets (id, name, public) values ('gallery', 'gallery', true)
on conflict (id) do nothing;

create policy "gallery: user uploads own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gallery: user updates own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gallery: user deletes own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- 004 — auto-admin for the owner + full creator deletion
-- ============================================================================
set check_function_bodies = off;

-- The program owner's email is granted admin automatically on signup.
-- Change this if you transfer ownership.
-- (Other admins are still promoted from Admin → Creators.)

-- ----------------------------------------------------------------------------
-- 1. New-user trigger: keep referral handling AND auto-admin the owner email.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ref_code text;
  v_referrer uuid;
  v_is_admin boolean;
begin
  v_ref_code := new.raw_user_meta_data ->> 'ref';
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = upper(v_ref_code);
  end if;

  -- Owner email is admin from the very first login.
  v_is_admin := lower(new.email) = 'ethanmc365@gmail.com';

  insert into public.profiles (id, name, referral_code, referred_by, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    upper(right(replace(new.id::text, '-', ''), 8)),
    v_referrer,
    v_is_admin
  );
  return new;
end;
$$;

-- If that account already exists, make sure it's an admin right now too.
update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id and lower(u.email) = 'ethanmc365@gmail.com';

-- ----------------------------------------------------------------------------
-- 2. admin_delete_creator(uuid)
-- ----------------------------------------------------------------------------
-- Fully removes a creator: deleting their auth.users row cascades to their
-- profile and (via on-delete-cascade FKs) all their submissions, messages,
-- DMs, rewards, photos, etc. Admins only; an admin cannot delete themselves.
create or replace function public.admin_delete_creator(target uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account here';
  end if;
  delete from auth.users where id = target;
end;
$$;

revoke all on function public.admin_delete_creator(uuid) from public, anon;
grant execute on function public.admin_delete_creator(uuid) to authenticated;

-- ================== SEED DATA ==================

-- ============================================================================
-- Tryp.com Creator Program, demo seed data
-- ============================================================================
-- Run AFTER 001_initial_schema.sql, in the Supabase SQL Editor.
--
-- Creates 10 demo accounts (1 admin + 9 creators), challenges, submissions,
-- results, a published Wall of Fame, rewards, chat, DMs, resources, events
-- and notifications. Dates are RELATIVE to now() so the demo always looks
-- alive (the active challenge always has a live countdown).
--
-- Every demo account's password is:  TrypDemo123!
--   Admin login:    ethan@tryp-demo.com
--   Creator login:  amelia@tryp-demo.com (or any other creator below)
--
-- Safe to re-run? No, designed for a fresh database. Reset first if needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Demo users (auth.users + auth.identities)
-- ----------------------------------------------------------------------------
-- The trg_on_auth_user_created trigger auto-creates a profiles row for each.
do $$
declare
  demo_users constant jsonb := '[
    {"id":"a0000000-0000-0000-0000-000000000001","email":"ethan@tryp-demo.com","name":"Ethan McAllister"},
    {"id":"a0000000-0000-0000-0000-000000000002","email":"amelia@tryp-demo.com","name":"Amelia Hart"},
    {"id":"a0000000-0000-0000-0000-000000000003","email":"jack@tryp-demo.com","name":"Jack O''Donnell"},
    {"id":"a0000000-0000-0000-0000-000000000004","email":"priya@tryp-demo.com","name":"Priya Sharma"},
    {"id":"a0000000-0000-0000-0000-000000000005","email":"callum@tryp-demo.com","name":"Callum Murray"},
    {"id":"a0000000-0000-0000-0000-000000000006","email":"saoirse@tryp-demo.com","name":"Saoirse Byrne"},
    {"id":"a0000000-0000-0000-0000-000000000007","email":"tom@tryp-demo.com","name":"Tom Whitfield"},
    {"id":"a0000000-0000-0000-0000-000000000008","email":"niamh@tryp-demo.com","name":"Niamh Kelly"},
    {"id":"a0000000-0000-0000-0000-000000000009","email":"zofia@tryp-demo.com","name":"Zofia Nowak"},
    {"id":"a0000000-0000-0000-0000-000000000010","email":"marcus@tryp-demo.com","name":"Marcus Boateng"}
  ]'::jsonb;
  u jsonb;
begin
  for u in select * from jsonb_array_elements(demo_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000',
      (u ->> 'id')::uuid,
      'authenticated',
      'authenticated',
      u ->> 'email',
      crypt('TrypDemo123!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', u ->> 'name'),
      now() - interval '120 days',
      now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      (u ->> 'id')::uuid,
      u ->> 'id',
      jsonb_build_object('sub', u ->> 'id', 'email', u ->> 'email'),
      'email',
      now(), now(), now()
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Profiles, fill in the details the trigger couldn't know
-- ----------------------------------------------------------------------------
-- Stagger join dates so the admin "creator growth" chart has a story to tell.
update public.profiles set created_at = now() - interval '150 days', onboarded = true, is_admin = true,
  age = 27, photo_url = 'https://i.pravatar.cc/300?img=12',
  bio = 'UK Country Manager @ Tryp.com, I run the Creator Program.',
  about = 'I started the Tryp.com Content Creator Program to build a real community of travel creators around the world. Message me any time, my door is always open.',
  instagram_url = 'https://instagram.com/tryp.com_official',
  languages = '{English}', countries_visited = '{United Kingdom,Ireland,Spain,France,Italy,Portugal,Greece,Netherlands,Germany,United States of America,Thailand,Australia}'
where id = 'a0000000-0000-0000-0000-000000000001';

update public.profiles set created_at = now() - interval '140 days', onboarded = true,
  age = 24, photo_url = 'https://i.pravatar.cc/300?img=47',
  bio = 'London-based travel storyteller ✈️ Budget trips, big views.',
  about = 'I quit my desk job in 2024 to film budget city breaks. My niche is "champagne views on a lemonade budget", flight hacks, cheap eats and hidden viewpoints. Always keen to collab on European city content!',
  instagram_url = 'https://instagram.com/amelia.travels', tiktok_url = 'https://tiktok.com/@amelia.travels',
  languages = '{English,French}', countries_visited = '{United Kingdom,France,Spain,Italy,Greece,Portugal,Netherlands,Croatia,Morocco,Thailand,Vietnam,Japan,Mexico,United States of America}'
where id = 'a0000000-0000-0000-0000-000000000002';

update public.profiles set created_at = now() - interval '130 days', onboarded = true,
  age = 26, photo_url = 'https://i.pravatar.cc/300?img=13',
  bio = 'Dublin lad documenting cheap flights & weekend escapes 🍀',
  about = 'TikTok is my home turf, fast cuts, honest reviews, zero filter. I specialise in "how far can €50 get you from Dublin" content. 120k followers and counting.',
  tiktok_url = 'https://tiktok.com/@jackflieskeep', instagram_url = 'https://instagram.com/jackflies',
  languages = '{English,Irish}', countries_visited = '{Ireland,United Kingdom,Spain,Portugal,France,Belgium,Poland,Hungary,Iceland,United States of America}'
where id = 'a0000000-0000-0000-0000-000000000003';

update public.profiles set created_at = now() - interval '110 days', onboarded = true,
  age = 23, photo_url = 'https://i.pravatar.cc/300?img=31',
  bio = 'Manchester ➜ everywhere. Solo female travel & food finds 🌏',
  about = 'I film solo travel guides aimed at first-time solo travellers, safety tips, itineraries and street food deep-dives. Reels are my strength but I''m growing fast on TikTok too.',
  instagram_url = 'https://instagram.com/priya.wanders', tiktok_url = 'https://tiktok.com/@priya.wanders',
  languages = '{English,Hindi,Punjabi}', countries_visited = '{United Kingdom,India,Thailand,Vietnam,Indonesia,Japan,Spain,Italy,Greece,Türkiye,Egypt,Morocco}'
where id = 'a0000000-0000-0000-0000-000000000004';

update public.profiles set created_at = now() - interval '95 days', onboarded = true,
  age = 29, photo_url = 'https://i.pravatar.cc/300?img=53',
  bio = 'Edinburgh filmmaker. Cinematic travel films & drone shots 🎥',
  about = 'Long-form YouTube is my craft, 10-minute cinematic travel films. I bring high production value to every brand I work with, and I''m happy to share editing tips with other creators here.',
  youtube_url = 'https://youtube.com/@callumcaptures', instagram_url = 'https://instagram.com/callum.captures',
  languages = '{English}', countries_visited = '{United Kingdom,Ireland,Norway,Sweden,Denmark,Iceland,Switzerland,Austria,Italy,France,Canada,United States of America,Japan,Australia}'
where id = 'a0000000-0000-0000-0000-000000000005';

update public.profiles set created_at = now() - interval '80 days', onboarded = true,
  age = 22, photo_url = 'https://i.pravatar.cc/300?img=44',
  bio = 'Cork girl chasing sunsets ☀️ TikTok travel diaries.',
  about = 'My TikToks are diary-style, raw, funny, and honest about what travel actually costs. My audience is mostly Irish students looking for affordable sun.',
  tiktok_url = 'https://tiktok.com/@saoirsesunsets',
  languages = '{English,Irish}', countries_visited = '{Ireland,Spain,Portugal,France,Italy,Greece,Croatia,Netherlands}'
where id = 'a0000000-0000-0000-0000-000000000006';

update public.profiles set created_at = now() - interval '60 days', onboarded = true,
  age = 31, photo_url = 'https://i.pravatar.cc/300?img=59',
  bio = 'Leeds. Family travel on a budget, 2 kids, 1 carry-on 🧳',
  about = 'I show real family travel: package holidays, kid-friendly city breaks and how to keep costs sane. Parents trust my reviews because I never sugar-coat.',
  instagram_url = 'https://instagram.com/whitfieldsaway',
  languages = '{English}', countries_visited = '{United Kingdom,Spain,Portugal,France,Greece,Türkiye,Egypt,United States of America}'
where id = 'a0000000-0000-0000-0000-000000000007';

update public.profiles set created_at = now() - interval '45 days', onboarded = true,
  age = 25, photo_url = 'https://i.pravatar.cc/300?img=26',
  bio = 'Galway adventurer 🌊 Hikes, coasts & hidden Ireland.',
  about = 'Half my content is wild-Atlantic-way Ireland, half is European adventure trips. Strong engagement from outdoorsy audiences in Ireland and the UK.',
  instagram_url = 'https://instagram.com/niamh.explores', tiktok_url = 'https://tiktok.com/@niamh.explores',
  languages = '{English,Irish}', countries_visited = '{Ireland,United Kingdom,Norway,Iceland,Switzerland,Austria,France,Spain,Slovenia}'
where id = 'a0000000-0000-0000-0000-000000000008';

update public.profiles set created_at = now() - interval '30 days', onboarded = true,
  age = 27, photo_url = 'https://i.pravatar.cc/300?img=20',
  bio = 'Belfast ✈️ Warsaw and back again. Bilingual travel content 🇵🇱',
  about = 'I make travel content in English and Polish, which gives my videos a double audience. Big on night trains, layover guides and Central European city breaks.',
  tiktok_url = 'https://tiktok.com/@zofia.onamove', instagram_url = 'https://instagram.com/zofia.onamove',
  languages = '{English,Polish}', countries_visited = '{United Kingdom,Ireland,Poland,Germany,Czechia,Austria,Hungary,Slovakia,Croatia,Italy}'
where id = 'a0000000-0000-0000-0000-000000000009';

update public.profiles set created_at = now() - interval '14 days', onboarded = true,
  age = 28, photo_url = 'https://i.pravatar.cc/300?img=68',
  bio = 'Birmingham. Aviation nerd & points-and-miles tips 🛫',
  about = 'I break down flight deals, airline reviews and points hacks. My YouTube deep-dives convert really well, viewers actually book the deals I cover.',
  youtube_url = 'https://youtube.com/@marcusflies', tiktok_url = 'https://tiktok.com/@marcusflies',
  languages = '{English}', countries_visited = '{United Kingdom,United States of America,United Arab Emirates,Singapore,Japan,South Africa,Ghana,Spain,Germany,Netherlands}'
where id = 'a0000000-0000-0000-0000-000000000010';

-- ----------------------------------------------------------------------------
-- 3. Challenges, 1 active (live countdown!) + 2 archived
-- ----------------------------------------------------------------------------
insert into public.challenges (
  id, title, description, rules, hashtags, platforms, prize_structure,
  start_date, end_date, status, created_by, created_at
) values
(
  'c0000000-0000-0000-0000-000000000001',
  'Summer Escapes Challenge',
  E'Show your audience how Tryp.com makes summer travel cheaper.\n\nCreate a short-form video (Reel or TikTok) featuring a summer destination you can reach with a Tryp.com flight or package deal. Highlight the savings angle, "same trip, less money". The video with the most views when the challenge closes wins.',
  E'• One entry per platform (max 2 total)\n• Mention or tag Tryp.com in the caption\n• Use at least one of the challenge hashtags\n• Content must be your own original footage\n• Keep it authentic, no misleading price claims',
  '#TrypCreators #SameTripLessMoney #SummerEscapes',
  '{Instagram,TikTok}',
  '[{"place":"1st","prize":"£150 cash"},{"place":"2nd","prize":"£100 cash"},{"place":"3rd","prize":"£75 cash"},{"place":"All valid entries","prize":"£25 Tryp.com voucher"}]'::jsonb,
  now() - interval '10 days', now() + interval '18 days',
  'active', 'a0000000-0000-0000-0000-000000000001', now() - interval '12 days'
),
(
  'c0000000-0000-0000-0000-000000000002',
  'Hidden Gems Challenge',
  E'Reveal an underrated destination your followers have never thought of, and show how cheaply Tryp.com can get them there. The most-viewed video wins.',
  E'• One entry per platform\n• Tag Tryp.com and use the challenge hashtags\n• Destination must be reachable via Tryp.com flights or packages',
  '#TrypCreators #HiddenGems',
  '{Instagram,TikTok}',
  '[{"place":"1st","prize":"£150 cash"},{"place":"2nd","prize":"£100 cash"},{"place":"3rd","prize":"£75 cash"},{"place":"All valid entries","prize":"£25 Tryp.com voucher"}]'::jsonb,
  now() - interval '75 days', now() - interval '45 days',
  'archived', 'a0000000-0000-0000-0000-000000000001', now() - interval '80 days'
),
(
  'c0000000-0000-0000-0000-000000000003',
  'City Break Showdown',
  E'48 hours, one European city, one unforgettable video. Show your followers the perfect Tryp.com city break, flights, stay and itinerary.',
  E'• One entry per platform\n• Tag Tryp.com and use the challenge hashtags\n• Must feature a real itinerary your followers could copy',
  '#TrypCreators #CityBreakShowdown',
  '{Instagram,TikTok,YouTube}',
  '[{"place":"1st","prize":"£200 cash"},{"place":"2nd","prize":"£100 cash"},{"place":"3rd","prize":"£50 Tryp.com voucher"}]'::jsonb,
  now() - interval '130 days', now() - interval '100 days',
  'archived', 'a0000000-0000-0000-0000-000000000001', now() - interval '135 days'
);

-- The "challenge is live" trigger just notified everyone about Summer Escapes.
-- That's exactly what we want for the demo. 🎉

-- ----------------------------------------------------------------------------
-- 4. Submissions
-- ----------------------------------------------------------------------------
-- Active challenge, no logged_views yet (admin reviews at the end).
insert into public.submissions (creator_id, challenge_id, platform, video_url, caption, submitted_at) values
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Instagram', 'https://www.instagram.com/reel/DEMO-amelia-summer/', 'Santorini for under £180?! Tryp.com came through 😍 #TrypCreators #SummerEscapes', now() - interval '6 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'TikTok', 'https://www.tiktok.com/@jackflieskeep/video/demo-summer-1', 'POV: Dublin to the Algarve for less than a night out 🍹 #SameTripLessMoney', now() - interval '5 days'),
('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 'Instagram', 'https://www.instagram.com/reel/DEMO-priya-summer/', 'Solo girl summer in Crete, full Tryp.com breakdown in the caption ☀️ #TrypCreators', now() - interval '4 days'),
('a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000001', 'TikTok', 'https://www.tiktok.com/@saoirsesunsets/video/demo-summer-2', 'Rating every beach in Malaga so you don''t have to 🏖️ flights via @tryp.com #SummerEscapes', now() - interval '2 days'),
('a0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000001', 'Instagram', 'https://www.instagram.com/reel/DEMO-niamh-summer/', 'Croatia''s coast >>> everywhere else. Booked with Tryp.com ⚓ #TrypCreators #SummerEscapes', now() - interval '1 day');

-- Hidden Gems (archived), views logged by Ethan at review time.
insert into public.submissions (creator_id, challenge_id, platform, video_url, caption, logged_views, submitted_at) values
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'TikTok', 'https://www.tiktok.com/@amelia.travels/video/demo-gems-1', 'Nobody talks about Puglia and it''s a crime 🇮🇹 #HiddenGems', 284000, now() - interval '60 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'TikTok', 'https://www.tiktok.com/@jackflieskeep/video/demo-gems-2', 'The Polish city that costs HALF of Prague 🇵🇱 #HiddenGems #TrypCreators', 192500, now() - interval '58 days'),
('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'Instagram', 'https://www.instagram.com/reel/DEMO-priya-gems/', 'Kotor, Montenegro, the fjord you can fly to for £60 return 😮 #HiddenGems', 156000, now() - interval '55 days'),
('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'Instagram', 'https://www.instagram.com/reel/DEMO-callum-gems/', 'I filmed the Faroe Islands for 3 days. Cinematic cut 🎥 #HiddenGems', 98000, now() - interval '52 days'),
('a0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 'Instagram', 'https://www.instagram.com/reel/DEMO-tom-gems/', 'Hidden gem for families: the quiet side of the Algarve 🧒 #HiddenGems', 61000, now() - interval '50 days'),
('a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'TikTok', 'https://www.tiktok.com/@saoirsesunsets/video/demo-gems-3', 'A Greek island with NO crowds?? Folegandros diaries 🇬🇷 #HiddenGems', 87500, now() - interval '49 days');

-- City Break Showdown (archived).
insert into public.submissions (creator_id, challenge_id, platform, video_url, caption, logged_views, submitted_at) values
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'Instagram', 'https://www.instagram.com/reel/DEMO-amelia-city/', '48 hours in Porto, every penny counted 🇵🇹 #CityBreakShowdown', 174000, now() - interval '110 days'),
('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'YouTube', 'https://www.youtube.com/watch?v=DEMO-callum-city', 'COPENHAGEN IN 48 HOURS, a cinematic city break film', 88000, now() - interval '108 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'TikTok', 'https://www.tiktok.com/@jackflieskeep/video/demo-city-1', 'Budapest on €100 TOTAL, challenge accepted 🇭🇺 #CityBreakShowdown', 142000, now() - interval '105 days');

-- ----------------------------------------------------------------------------
-- 5. Results, final standings for the two archived challenges
-- ----------------------------------------------------------------------------
insert into public.results (challenge_id, creator_id, final_views, rank, created_at) values
-- Hidden Gems
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 284000, 1, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 192500, 2, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 156000, 3, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 98000, 4, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 87500, 5, now() - interval '43 days'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000007', 61000, 6, now() - interval '43 days'),
-- City Break Showdown
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 174000, 1, now() - interval '98 days'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 142000, 2, now() - interval '98 days'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 88000, 3, now() - interval '98 days');

-- ----------------------------------------------------------------------------
-- 6. Wall of Fame, published for both archived challenges
-- ----------------------------------------------------------------------------
insert into public.wall_of_fame (challenge_id, featured_spots, admin_note, published, published_at, updated_by) values
(
  'c0000000-0000-0000-0000-000000000002',
  '[
    {"creator_id":"a0000000-0000-0000-0000-000000000002","note":"284k views, Puglia content that genuinely converted bookings. Outstanding."},
    {"creator_id":"a0000000-0000-0000-0000-000000000003","note":"192k views and the comment section was pure gold."},
    {"creator_id":"a0000000-0000-0000-0000-000000000004","note":"156k views, Kotor is now on everyone''s list."},
    {"creator_id":"a0000000-0000-0000-0000-000000000005","note":"Admin''s pick 🎬, the Faroe Islands edit was the most beautiful film of the round."}
  ]'::jsonb,
  'Our best round yet, over 880k combined views. Thank you all for the incredible energy!',
  true, now() - interval '42 days', 'a0000000-0000-0000-0000-000000000001'
),
(
  'c0000000-0000-0000-0000-000000000003',
  '[
    {"creator_id":"a0000000-0000-0000-0000-000000000002","note":"Porto on a budget, 174k views and our most-shared video to date."},
    {"creator_id":"a0000000-0000-0000-0000-000000000003","note":"Budapest on €100. Madness. 142k views."},
    {"creator_id":"a0000000-0000-0000-0000-000000000005","note":"Copenhagen film, long-form excellence, 88k views."}
  ]'::jsonb,
  'The challenge that started it all. City breaks are our bread and butter, these three nailed it.',
  true, now() - interval '97 days', 'a0000000-0000-0000-0000-000000000001'
);

-- ----------------------------------------------------------------------------
-- 7. Rewards
-- ----------------------------------------------------------------------------
insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency, status, payment_notes, distributed_at, created_at) values
-- Hidden Gems payouts (all distributed)
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'cash', 150.00, 'GBP', 'distributed', 'Bank transfer, paid 3 days after results', now() - interval '39 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'cash', 100.00, 'GBP', 'distributed', 'Revolut transfer', now() - interval '39 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'cash',  75.00, 'GBP', 'distributed', 'Bank transfer', now() - interval '38 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'voucher', 25.00, 'GBP', 'distributed', 'Voucher code emailed', now() - interval '38 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'voucher', 25.00, 'GBP', 'distributed', 'Voucher code emailed', now() - interval '38 days', now() - interval '42 days'),
('a0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000002', 'voucher', 25.00, 'GBP', 'pending', 'Awaiting bank details from Tom', null, now() - interval '42 days'),
-- City Break Showdown payouts (all distributed)
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', 'cash', 200.00, 'GBP', 'distributed', 'Bank transfer', now() - interval '95 days', now() - interval '97 days'),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'cash', 100.00, 'GBP', 'distributed', 'Revolut transfer', now() - interval '95 days', now() - interval '97 days'),
('a0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000003', 'voucher', 50.00, 'GBP', 'distributed', 'Voucher code emailed', now() - interval '94 days', now() - interval '97 days');

-- ----------------------------------------------------------------------------
-- 8. Group chat, general, announcements, content tips
-- ----------------------------------------------------------------------------
insert into public.messages (channel, sender_id, body, created_at) values
('general', 'a0000000-0000-0000-0000-000000000001', 'Welcome to the new Tryp.com Creator Platform everyone! 🎉 This replaces the WhatsApp group, chat, challenges, results and resources all live here now.', now() - interval '9 days'),
('general', 'a0000000-0000-0000-0000-000000000002', 'This is SO much better than WhatsApp 😍 love the profiles!', now() - interval '9 days' + interval '12 minutes'),
('general', 'a0000000-0000-0000-0000-000000000003', 'Big upgrade lads. Already filled in my country map 🌍', now() - interval '9 days' + interval '25 minutes'),
('general', 'a0000000-0000-0000-0000-000000000006', 'Hi everyone!! Saoirse from Cork here 👋 anyone else entering Summer Escapes?', now() - interval '8 days'),
('general', 'a0000000-0000-0000-0000-000000000004', 'Yes! Flying to Crete on Thursday, filming the whole thing 🎬', now() - interval '8 days' + interval '8 minutes'),
('general', 'a0000000-0000-0000-0000-000000000008', 'Anyone fancy a collab for the summer challenge? Thinking a Croatia coast hop ⚓', now() - interval '6 days'),
('general', 'a0000000-0000-0000-0000-000000000002', 'Niamh I''m so in, DMing you now', now() - interval '6 days' + interval '5 minutes'),
('general', 'a0000000-0000-0000-0000-000000000010', 'New here, Marcus from Birmingham, aviation/points content. Great to meet you all 🛫', now() - interval '5 days'),
('general', 'a0000000-0000-0000-0000-000000000005', 'Welcome Marcus! Your A380 review was class btw', now() - interval '5 days' + interval '20 minutes'),
('general', 'a0000000-0000-0000-0000-000000000009', 'Cześć everyone! Just submitted my first ever entry 🤞', now() - interval '3 days'),
('general', 'a0000000-0000-0000-0000-000000000007', 'Good luck Zofia! The first one''s always the scariest 😄', now() - interval '3 days' + interval '15 minutes'),
('general', 'a0000000-0000-0000-0000-000000000003', '18 days left on Summer Escapes, who else is leaving it to the last minute like me 🙃', now() - interval '6 hours'),
('content_tips', 'a0000000-0000-0000-0000-000000000001', E'📌 TIP: Hook your viewer in the FIRST 2 SECONDS. Start with the destination reveal or the price, "Santorini for £180" beats "hey guys" every single time.', now() - interval '8 days'),
('content_tips', 'a0000000-0000-0000-0000-000000000001', E'📌 Brand do''s & don''ts:\n✅ DO say "I found this deal on Tryp.com"\n✅ DO show real prices and screenshots\n❌ DON''T invent prices or guarantee availability\n❌ DON''T use other brands'' footage\nFull guidelines are in the Resource Library.', now() - interval '7 days'),
('content_tips', 'a0000000-0000-0000-0000-000000000005', 'Editing tip from me: cut on movement. If your clip ends mid-pan, start the next one mid-pan too, feels seamless and keeps retention up.', now() - interval '4 days'),
('content_tips', 'a0000000-0000-0000-0000-000000000002', 'Also! Post Reels between 6–8pm UK time. My evening posts consistently do 2–3x the views of morning ones.', now() - interval '4 days' + interval '30 minutes'),
('content_tips', 'a0000000-0000-0000-0000-000000000001', '📌 Trending audio matters on TikTok. Save trending travel sounds during the week and batch-film to them at the weekend.', now() - interval '1 day');

-- Announcements (admin-only channel). Each insert auto-notifies everyone.
insert into public.messages (channel, sender_id, body, created_at) values
('announcements', 'a0000000-0000-0000-0000-000000000001', '🚀 The Tryp.com Creator Platform is officially LIVE. Take 5 minutes to complete your profile, photo, socials and your country map. This is our new home!', now() - interval '9 days'),
('announcements', 'a0000000-0000-0000-0000-000000000001', E'☀️ SUMMER ESCAPES CHALLENGE IS LIVE!\n\nPrizes: 1st £150 • 2nd £100 • 3rd £75 • every valid entry gets a £25 Tryp.com voucher.\n\nFull brief on the Challenges page. Deadline is in 18 days, get filming!', now() - interval '8 days'),
('announcements', 'a0000000-0000-0000-0000-000000000001', '📅 Live Q&A with me next week, bring your questions about the program, payouts, and what we look for in winning content. Details on the Events page.', now() - interval '2 days');

-- A few emoji reactions so chat looks loved.
insert into public.reactions (message_id, creator_id, emoji)
select m.id, p.id, e.emoji
from public.messages m
cross join lateral (values
  ('a0000000-0000-0000-0000-000000000002'::uuid, '🔥'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, '🎉'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, '❤️')
) as e(id, emoji)
join public.profiles p on p.id = e.id
where m.channel = 'announcements'
  and m.body like '🚀%';

insert into public.reactions (message_id, creator_id, emoji)
select m.id, 'a0000000-0000-0000-0000-000000000006'::uuid, '😂'
from public.messages m where m.body like '18 days left%';

insert into public.reactions (message_id, creator_id, emoji)
select m.id, p_id, '👍'
from public.messages m
cross join (values ('a0000000-0000-0000-0000-000000000007'::uuid), ('a0000000-0000-0000-0000-000000000009'::uuid)) v(p_id)
where m.channel = 'content_tips' and m.body like '📌 TIP: Hook%';

-- ----------------------------------------------------------------------------
-- 9. DM threads
-- ----------------------------------------------------------------------------
-- Amelia ↔ Niamh planning their Croatia collab.
insert into public.conversations (id, participant_a, participant_b, last_message_at, created_at) values
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', now() - interval '2 hours', now() - interval '6 days');

insert into public.direct_messages (conversation_id, sender_id, recipient_id, body, read, created_at) values
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'Hey! Saw your collab message, I''m flying into Split on the 18th, what dates work for you?', true, now() - interval '6 days'),
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 'Perfect timing, I land the 17th! We could do Split → Hvar → Dubrovnik over 4 days?', true, now() - interval '6 days' + interval '20 minutes'),
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', 'Dreamy. I''ll storyboard the hook tonight, thinking we each film our own edit of the same trip, double the entries 😎', true, now() - interval '5 days'),
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 'Genius. Booking the ferry now, send me your storyboard when it''s done!', false, now() - interval '2 hours');

-- Ethan (admin) ↔ Marcus, welcome DM.
insert into public.conversations (id, participant_a, participant_b, last_message_at, created_at) values
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', now() - interval '4 days', now() - interval '5 days');

insert into public.direct_messages (conversation_id, sender_id, recipient_id, body, read, created_at) values
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'Marcus! Great to have you in the program, your points-and-miles angle is exactly what we''ve been missing. Shout if you need anything getting started.', true, now() - interval '5 days'),
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Cheers Ethan! Quick one, for Summer Escapes, does a "points + Tryp.com cash fare" comparison video count as on-brief?', true, now() - interval '4 days' - interval '2 hours'),
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010', 'Absolutely, savings angle is the whole brief. Lean into it 👌', true, now() - interval '4 days');

-- ----------------------------------------------------------------------------
-- 10. Connections
-- ----------------------------------------------------------------------------
insert into public.connections (creator_id, connected_creator_id, created_at) values
('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008', now() - interval '6 days'),
('a0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', now() - interval '6 days'),
('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', now() - interval '8 days'),
('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', now() - interval '8 days'),
('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', now() - interval '7 days'),
('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000010', now() - interval '4 days'),
('a0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000005', now() - interval '4 days'),
('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004', now() - interval '5 days'),
('a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000003', now() - interval '3 days');

-- ----------------------------------------------------------------------------
-- 11. Events
-- ----------------------------------------------------------------------------
insert into public.events (title, description, date, type, created_by) values
('Summer Escapes, submissions close', 'Last moment to drop your video link on the challenge page. No late entries!', now() + interval '18 days', 'deadline', 'a0000000-0000-0000-0000-000000000001'),
('Live Q&A with Ethan', 'Open mic on the program: payouts, briefs, what winning content looks like. Bring questions!', now() + interval '5 days', 'qa', 'a0000000-0000-0000-0000-000000000001'),
('Group content day, London', 'Meet-up for anyone near London: shoot together, swap b-roll, grab lunch on us 🍕', now() + interval '12 days', 'event', 'a0000000-0000-0000-0000-000000000001'),
('Program hits 1 million combined views 🎉', 'Across all challenges, Tryp creators have now passed 1M logged views. Massive.', now() - interval '20 days', 'milestone', 'a0000000-0000-0000-0000-000000000001'),
('Summer Escapes, challenge opened', 'The summer round kicked off.', now() - interval '10 days', 'milestone', 'a0000000-0000-0000-0000-000000000001');

-- ----------------------------------------------------------------------------
-- 12. Resources
-- ----------------------------------------------------------------------------
insert into public.resources (title, body, category, created_by, created_at) values
('Tryp.com Brand Guidelines', E'How to talk about Tryp.com in your content:\n\n• Name: always "Tryp.com" (never "Tryp" alone, never "TRYP.COM" mid-sentence).\n• Tone: smart-saver, optimistic, never gimmicky.\n• Always pair a destination with the savings angle, "same trip, less money".\n• Colours if you make graphics: burnt orange #d94407 on white.\n• Tag @tryp.com and use #TrypCreators on every piece of program content.', 'Brand Guidelines', 'a0000000-0000-0000-0000-000000000001', now() - interval '9 days'),
('Do''s & Don''ts for program content', E'✅ DO show real prices and real screenshots from Tryp.com\n✅ DO disclose the partnership where required (#ad / paid partnership tools)\n✅ DO film your genuine experience, audiences smell fake\n\n❌ DON''T guarantee prices or availability ("from £39" is fine, "always £39" is not)\n❌ DON''T use footage you don''t own\n❌ DON''T bash competitors by name', 'Do''s & Don''ts', 'a0000000-0000-0000-0000-000000000001', now() - interval '9 days'),
('10 video hooks that always work', E'1. "I found a flight cheaper than my train to work…"\n2. "POV: you booked the trip everyone said was too expensive"\n3. Price reveal on screen in the first second\n4. "Rating [destination] so you don''t have to"\n5. "Nobody talks about [place] and it''s a crime"\n6. Before/after cost comparison\n7. "How far can £50 actually get you?"\n8. Packing-cam → airport-cam → arrival reveal\n9. "Things I wish I knew before visiting [place]"\n10. The 48-hour itinerary challenge', 'Video Ideas', 'a0000000-0000-0000-0000-000000000001', now() - interval '8 days'),
('Caption formula for challenge entries', E'Strong captions = more reach and an easy review for us:\n\n[Hook line with the destination + price]\n[1–2 lines of value: itinerary, tip, or story]\n[Call to action: "deal''s on Tryp.com"]\n[Hashtags: challenge tags + 2–3 niche tags]\n\nKeep it under 125 characters before the fold on Instagram.', 'Tips', 'a0000000-0000-0000-0000-000000000001', now() - interval '7 days'),
('Example: what a winning entry looks like', E'Amelia''s Hidden Gems winner (284k views) nailed every fundamental:\n\n• Hook: "Nobody talks about Puglia and it''s a crime", curiosity + place in 2 seconds\n• Pacing: a cut every 1.5–2s, no clip over 3s\n• Value: 3 specific spots with names on screen\n• Savings angle: flight price on screen at the midpoint\n• CTA: "found it on Tryp.com" + challenge hashtags\n\nStudy it, then make it yours.', 'Examples', 'a0000000-0000-0000-0000-000000000001', now() - interval '5 days');

-- ----------------------------------------------------------------------------
-- 13. Tidy notifications for a believable demo
-- ----------------------------------------------------------------------------
-- The triggers above just generated a flood of notifications. Mark the older
-- ones read so each demo account logs in with a tidy bell (a few unread).
update public.notifications set read = true where created_at < now() - interval '3 days';

-- ============================================================================
-- Done! Log in as ethan@tryp-demo.com / TrypDemo123! (admin)
--             or amelia@tryp-demo.com / TrypDemo123! (creator)
-- ============================================================================

-- ============================================================================
-- seed_v2, demo data for the v2 features (run after 003 migration)
-- ============================================================================

-- 1. Home city / country for the demo creators.
update public.profiles set city = 'London',     country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000002';
update public.profiles set city = 'Dublin',     country = 'Ireland'        where id = 'a0000000-0000-0000-0000-000000000003';
update public.profiles set city = 'Manchester', country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000004';
update public.profiles set city = 'Edinburgh',  country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000005';
update public.profiles set city = 'Cork',       country = 'Ireland'        where id = 'a0000000-0000-0000-0000-000000000006';
update public.profiles set city = 'Leeds',      country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000007';
update public.profiles set city = 'Galway',     country = 'Ireland'        where id = 'a0000000-0000-0000-0000-000000000008';
update public.profiles set city = 'Belfast',    country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000009';
update public.profiles set city = 'Birmingham', country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000010';
update public.profiles set city = 'London',     country = 'United Kingdom' where id = 'a0000000-0000-0000-0000-000000000001';

-- 2. Travel gallery for Amelia (placeholder travel imagery from Unsplash).
insert into public.creator_photos (creator_id, photo_url, caption, sort_order) values
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1503917988258-f87a78e3c995?w=600&q=70', 'Santorini blue hour 🇬🇷', 0),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=600&q=70', 'Lisbon trams', 1),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=600&q=70', 'Venice mornings', 2),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=600&q=70', 'Above the clouds ✈️', 3),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1504609773096-104ff2c73ba4?w=600&q=70', 'Amalfi coast road trip', 4),
('a0000000-0000-0000-0000-000000000002', 'https://images.unsplash.com/photo-1499678329028-101435549a4e?w=600&q=70', 'Paris from the rooftops', 5);

-- 3. Jobs the team is hiring for.
insert into public.jobs (title, description, location, job_type, apply_url, status, created_by) values
('Scotland Country Manager',
 E'We''re looking for a Scotland Country Manager to grow the Tryp.com creator community north of the border.\n\nYou''ll recruit and support creators, run local meet-ups, and own the Scotland challenge calendar. Travel-obsessed, well-connected, and a natural community builder? This is for you.',
 'Edinburgh / Glasgow', 'Permanent', null, 'open', 'a0000000-0000-0000-0000-000000000001'),
('Permanent Content Creator',
 E'Join Tryp.com as a full-time, salaried Content Creator. You''ll make flagship travel content for our global channels, set the creative bar for the community, and travel on the company''s dime.\n\nStrong short-form portfolio (Reels / TikTok) required.',
 'Remote (UK based)', 'Permanent', null, 'open', 'a0000000-0000-0000-0000-000000000001'),
('Video Editor (Freelance)',
 E'Freelance editor to turn creator footage into punchy branded edits. Paid per project, flexible hours, ongoing work for the right person.',
 'Remote', 'Freelance', null, 'open', 'a0000000-0000-0000-0000-000000000001');

-- 4. A live poll in announcements (where should the next challenge be themed?).
do $$
declare
  v_poll uuid := gen_random_uuid();
  v_opt_a uuid := gen_random_uuid();
  v_opt_b uuid := gen_random_uuid();
  v_opt_c uuid := gen_random_uuid();
  v_opt_d uuid := gen_random_uuid();
begin
  insert into public.polls (id, question, created_by, created_at)
  values (v_poll, 'Where should our next challenge be themed?', 'a0000000-0000-0000-0000-000000000001', now() - interval '1 day');

  insert into public.poll_options (id, poll_id, label, sort_order) values
    (v_opt_a, v_poll, 'City breaks ✈️', 0),
    (v_opt_b, v_poll, 'Beaches & islands 🏝️', 1),
    (v_opt_c, v_poll, 'Winter & ski ⛷️', 2),
    (v_opt_d, v_poll, 'Hidden gems 💎', 3);

  -- The announcement message that carries the poll.
  insert into public.messages (channel, sender_id, body, poll_id, created_at)
  values ('announcements', 'a0000000-0000-0000-0000-000000000001',
          '🗳️ Help shape the next challenge, vote below!', v_poll, now() - interval '1 day');

  -- A few votes so it looks alive.
  insert into public.poll_votes (poll_id, option_id, voter_id) values
    (v_poll, v_opt_a, 'a0000000-0000-0000-0000-000000000002'),
    (v_poll, v_opt_a, 'a0000000-0000-0000-0000-000000000003'),
    (v_poll, v_opt_b, 'a0000000-0000-0000-0000-000000000004'),
    (v_poll, v_opt_b, 'a0000000-0000-0000-0000-000000000006'),
    (v_poll, v_opt_b, 'a0000000-0000-0000-0000-000000000008'),
    (v_poll, v_opt_d, 'a0000000-0000-0000-0000-000000000005');
end $$;

-- 5. A referral or two.
insert into public.referrals (referrer_id, referred_name, referred_contact, note, status) values
('a0000000-0000-0000-0000-000000000002', 'Leo Fairbanks', '@leo.onfilm', 'Brilliant drone creator I met in Lisbon, 60k on IG.', 'new'),
('a0000000-0000-0000-0000-000000000003', 'Méabh Sterling', 'meabh.travels@example.com', 'Dublin-based, great storytelling style.', 'contacted');

-- 6. Add a Google Meet link to the existing Live Q&A event.
update public.events
set meeting_url = 'https://meet.google.com/abc-defg-hij'
where title = 'Live Q&A with Ethan';
