-- ============================================================================
-- 023 - extra admin notifications
--   Adds four admin-only alerts (in-app + push by default, email opt-in):
--     submission  - a creator submitted a challenge entry
--     deletion    - a creator scheduled their account for deletion
--     referral    - a creator logged a referral lead
--     new_member  - a creator was approved and is now active
--   Each notifies every admin. Trigger functions are SECURITY DEFINER and not
--   part of the API, so EXECUTE is revoked from the API roles (like migration 020).
-- ============================================================================
set check_function_bodies = off;

-- Allow the new notification types.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'challenge', 'announcement', 'results', 'reward', 'deadline',
    'connection', 'dm', 'event', 'application', 'chat',
    'submission', 'deletion', 'referral', 'new_member'
  ));

-- 1) New challenge submission → notify admins.
create or replace function public.on_new_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link)
  select p.id, 'submission', 'New challenge entry',
         coalesce((select nullif(name, '') from public.profiles where id = new.creator_id), 'A creator')
           || ' submitted an entry (' || new.platform || ').',
         '/challenges/' || new.challenge_id
  from public.profiles p
  where p.is_admin and p.id <> new.creator_id;
  return new;
end; $$;
drop trigger if exists trg_on_new_submission on public.submissions;
create trigger trg_on_new_submission after insert on public.submissions
  for each row execute function public.on_new_submission();

-- 2) Account deletion requested → notify admins.
create or replace function public.on_deletion_requested()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deletion_requested_at is not null and old.deletion_requested_at is null then
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'deletion', 'Account deletion requested',
           coalesce(nullif(new.name, ''), 'A creator') || ' scheduled their account for deletion.',
           '/admin/creators'
    from public.profiles p
    where p.is_admin and p.id <> new.id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_on_deletion_requested on public.profiles;
create trigger trg_on_deletion_requested after update on public.profiles
  for each row execute function public.on_deletion_requested();

-- 3) New referral lead logged → notify admins.
create or replace function public.on_new_referral()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link)
  select p.id, 'referral', 'New referral',
         coalesce((select nullif(name, '') from public.profiles where id = new.referrer_id), 'A creator')
           || ' referred ' || coalesce(nullif(new.referred_name, ''), 'someone') || '.',
         '/admin/referrals'
  from public.profiles p
  where p.is_admin and p.id <> new.referrer_id;
  return new;
end; $$;
drop trigger if exists trg_on_new_referral on public.referrals;
create trigger trg_on_new_referral after insert on public.referrals
  for each row execute function public.on_new_referral();

-- 4) Creator approved / became active → notify admins.
create or replace function public.on_new_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and old.status is distinct from 'active' and not new.is_admin then
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'new_member', 'New creator joined',
           coalesce(nullif(new.name, ''), 'A creator') || ' was approved and is now an active member.',
           '/profile/' || new.id
    from public.profiles p
    where p.is_admin and p.id <> new.id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_on_new_member on public.profiles;
create trigger trg_on_new_member after update on public.profiles
  for each row execute function public.on_new_member();

-- These are trigger functions, not API calls: keep them off the exposed API.
revoke execute on function public.on_new_submission() from public, anon, authenticated;
revoke execute on function public.on_deletion_requested() from public, anon, authenticated;
revoke execute on function public.on_new_referral() from public, anon, authenticated;
revoke execute on function public.on_new_member() from public, anon, authenticated;
