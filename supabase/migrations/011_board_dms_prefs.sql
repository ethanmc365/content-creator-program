-- ============================================================================
-- 011 - travel board sizes, admin DM delete, split push/email prefs,
--       and notifying admins about new signups
-- ============================================================================
set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- Travel board: each photo can be small (1x1) or large (2x2).
-- ----------------------------------------------------------------------------
alter table public.creator_photos add column if not exists size text not null default 'small'
  check (size in ('small', 'large'));

-- ----------------------------------------------------------------------------
-- Admins can fully delete a direct message (moderation).
-- ----------------------------------------------------------------------------
drop policy if exists "dms: admin delete" on public.direct_messages;
create policy "dms: admin delete" on public.direct_messages for delete to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Per-type EMAIL preferences (separate channel from in-app/push notif_prefs).
-- Defaults: email for the big moments, off for chatty types.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists email_prefs jsonb not null default
  '{"announcement": true, "challenge": true, "event": true, "results": true, "reward": true,
    "application": true, "dm": false, "chat": false, "connection": false}'::jsonb;

-- ----------------------------------------------------------------------------
-- Decouple channels: ALWAYS record the in-app notification (the bell is the
-- inbox). Push is gated by notif_prefs and email by email_prefs, both inside
-- the notify-dispatch Edge Function.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Notify every admin when a creator finishes onboarding and is awaiting review.
-- ----------------------------------------------------------------------------
create or replace function public.on_creator_ready()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'pending' and new.onboarded and (old.onboarded is distinct from new.onboarded) then
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'application', 'New creator awaiting review',
           coalesce(nullif(new.name, ''), 'A new creator') || ' has submitted their application.',
           '/admin/applications'
    from public.profiles p
    where p.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_creator_ready on public.profiles;
create trigger trg_on_creator_ready
  after update on public.profiles
  for each row execute function public.on_creator_ready();
