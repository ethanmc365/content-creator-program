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
