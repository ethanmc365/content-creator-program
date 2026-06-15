-- ============================================================================
-- 008 - notification preferences, web push, and signup application review
-- ============================================================================
set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- Notification preferences (per creator). Defaults to everything on.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists notif_prefs jsonb not null default
  '{"announcement": true, "challenge": true, "results": true, "reward": true,
    "dm": true, "event": true, "chat": true, "connection": true}'::jsonb;

-- ----------------------------------------------------------------------------
-- Web push subscriptions (one row per device/browser).
-- ----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create policy "push: manage own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Expand notification types with 'event', 'application' and 'chat'.
-- ----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'challenge', 'announcement', 'results', 'reward', 'deadline',
    'connection', 'dm', 'event', 'application', 'chat'
  ));

-- ----------------------------------------------------------------------------
-- Make the notify helpers respect each recipient's preferences.
-- ----------------------------------------------------------------------------
create or replace function public.notify_user(
  p_recipient uuid, p_type text, p_title text, p_body text, p_link text
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  -- Send unless the recipient has explicitly turned this type off.
  if coalesce((select (notif_prefs ->> p_type)::boolean from public.profiles where id = p_recipient), true) then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (p_recipient, p_type, p_title, p_body, p_link);
  end if;
end;
$$;

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
  where p.status = 'active'
    and (p_except is null or p.id <> p_except)
    and coalesce((p.notif_prefs ->> p_type)::boolean, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- New event on the calendar -> notify everyone (respecting prefs).
-- ----------------------------------------------------------------------------
create or replace function public.on_event_created()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  perform public.notify_all(
    new.created_by, 'event', 'New event: ' || new.title,
    'A new event has been added to the calendar.', '/events'
  );
  return new;
end;
$$;

drop trigger if exists trg_on_event_created on public.events;
create trigger trg_on_event_created
  after insert on public.events
  for each row execute function public.on_event_created();

-- ============================================================================
-- Signup application review
-- ============================================================================

-- Add 'pending' (awaiting review) and 'declined' to the allowed statuses.
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('pending', 'active', 'muted', 'suspended', 'declined'));

-- New signups now start as 'pending' and must be approved by an admin.
-- (Existing rows keep their current status.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    'pending'
  );
  return new;
end;
$$;

-- Notify the creator when their application is approved or declined.
-- Account-critical, so this bypasses notification preferences.
create or replace function public.on_application_decision()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status = 'active' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.id, 'application', 'You''re in! Welcome aboard',
      'Your application has been approved. Welcome to the Tryp.com Content Creator Program.', '/home');
  elsif old.status = 'pending' and new.status = 'declined' then
    insert into public.notifications (recipient_id, type, title, body, link)
    values (new.id, 'application', 'Application update',
      'Thanks for applying. After review, your application was not approved at this time.', '/');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_application_decision on public.profiles;
create trigger trg_on_application_decision
  after update on public.profiles
  for each row execute function public.on_application_decision();
