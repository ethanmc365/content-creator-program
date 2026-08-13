-- 093: what "active" actually means.
--
-- THE BUG, WITH NAMES ON IT.
--
-- `notify_inactive_creators` decided who had gone quiet using ONE column:
-- `auth.users.last_sign_in_at`. But a session here lasts a week and the refresh
-- token renews it, so a creator who opens the app every single day may not
-- "sign in" for months. On 13 Aug 2026 that produced:
--
--   kiera         signed in 13 Jul  ->  FLAGGED INACTIVE
--                 seen 13 Aug (today), posted a message 10 Aug, entered 31 Jul
--   Jacob Pulley  signed in 10 Jul  ->  FLAGGED INACTIVE
--                 seen 13 Aug (today), sent a DM yesterday
--   Mirsu         signed in 4 Jul   ->  FLAGGED INACTIVE, DM'd two days ago
--   Natalia       signed in 13 Jul  ->  FLAGGED INACTIVE, seen three days ago
--
-- Four of the fourteen most active creators on the platform. The alert was not
-- slightly noisy, it was measuring the wrong thing: signing in is not using the
-- app, and for a logged-in user it is close to unrelated to it.
--
-- WHAT REPLACES IT
--
-- One definition of "last active", in one place, computed from everything that
-- is actually evidence of a person being here:
--
--   * signing in,
--   * the app's own heartbeat (profiles.last_seen_at, beaten every minute a
--     tab is open),
--   * posting in a room, sending a DM, entering a challenge, reacting.
--
-- Both the daily alert and the admin roster read it, so the roster can never
-- again say "active 2 months ago" beside an "inactive" badge that was computed
-- from a different column. That contradiction was the same bug wearing a
-- different hat.

-- ---------------------------------------------------------------- the source
create or replace function public.creator_activity()
returns table (
  id uuid,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
  last_posted_at timestamptz,
  last_active_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    u.last_sign_in_at,
    p.last_seen_at,
    -- Anything the creator DID, as opposed to anything the session did.
    greatest(
      coalesce((select max(m.created_at) from public.messages m where m.sender_id = p.id), 'epoch'::timestamptz),
      coalesce((select max(d.created_at) from public.direct_messages d where d.sender_id = p.id), 'epoch'::timestamptz),
      coalesce((select max(s.submitted_at) from public.submissions s where s.creator_id = p.id), 'epoch'::timestamptz),
      coalesce((select max(r.created_at) from public.reactions r where r.creator_id = p.id), 'epoch'::timestamptz)
    ) as last_posted_at,
    greatest(
      coalesce(u.last_sign_in_at, 'epoch'::timestamptz),
      coalesce(p.last_seen_at, 'epoch'::timestamptz),
      coalesce((select max(m.created_at) from public.messages m where m.sender_id = p.id), 'epoch'::timestamptz),
      coalesce((select max(d.created_at) from public.direct_messages d where d.sender_id = p.id), 'epoch'::timestamptz),
      coalesce((select max(s.submitted_at) from public.submissions s where s.creator_id = p.id), 'epoch'::timestamptz),
      coalesce((select max(r.created_at) from public.reactions r where r.creator_id = p.id), 'epoch'::timestamptz)
    ) as last_active_at
  from public.profiles p
  join auth.users u on u.id = p.id;
$$;

-- SECURITY DEFINER over auth.users, so it is granted to NOBODY by default and
-- exposed only through the admin wrapper below. Postgres grants EXECUTE to
-- PUBLIC on new functions unless told otherwise - the trap migration 081 was
-- written to fix - so this revoke is load-bearing.
revoke execute on function public.creator_activity() from public, anon, authenticated;

-- ------------------------------------------------------- the admin-facing RPC
-- Replaces admin_list_last_seen, which returned only the two session columns
-- the admin panel then combined by SORTING TWO ISO STRINGS - fine until one
-- came back with a `Z` suffix and the other with `+00:00`, which sort in the
-- wrong order at the same instant.
create or replace function public.admin_list_activity()
returns table (
  id uuid,
  last_sign_in_at timestamptz,
  last_seen_at timestamptz,
  last_posted_at timestamptz,
  last_active_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return query
    select a.id, a.last_sign_in_at, a.last_seen_at,
           nullif(a.last_posted_at, 'epoch'::timestamptz),
           nullif(a.last_active_at, 'epoch'::timestamptz)
    from public.creator_activity() a;
end; $$;

revoke execute on function public.admin_list_activity() from public, anon;
grant execute on function public.admin_list_activity() to authenticated;

-- --------------------------------------------------------- the daily alert
create or replace function public.notify_inactive_creators()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with quiet as (
    select p.id, p.name, a.last_active_at
    from public.profiles p
    join public.creator_activity() a on a.id = p.id
    where p.status = 'active'
      and not p.is_admin
      and p.is_test = false
      and p.deletion_requested_at is null
      -- Never alerted about somebody who has done nothing at all yet: that is
      -- an onboarding problem, and there is a separate reminder for it.
      and a.last_active_at > 'epoch'::timestamptz
      and a.last_active_at < now() - interval '30 days'
      and (p.inactive_alerted_at is null or p.inactive_alerted_at < a.last_active_at)
  )
  insert into public.notifications (recipient_id, type, title, body, link)
  select adm.id, 'inactive', 'Creator has gone quiet',
         q.name || ' has not posted, entered or opened the app in over 30 days.',
         '/profile/' || q.id
  from quiet q cross join public.profiles adm where adm.is_admin and adm.is_test = false;

  update public.profiles p
  set inactive_alerted_at = now()
  from public.creator_activity() a
  where a.id = p.id
    and p.status = 'active' and not p.is_admin and p.is_test = false
    and p.deletion_requested_at is null
    and a.last_active_at > 'epoch'::timestamptz
    and a.last_active_at < now() - interval '30 days'
    and (p.inactive_alerted_at is null or p.inactive_alerted_at < a.last_active_at);
end; $$;

revoke execute on function public.notify_inactive_creators() from public, anon, authenticated;

-- CLEAR THE FALSE ALARMS ALREADY SITTING IN ADMIN INBOXES.
-- Every 'inactive' notification about somebody who is, by the corrected
-- definition, active. Leaving them would mean the fix ships and the wrong list
-- is still the one on screen.
delete from public.notifications n
where n.type = 'inactive'
  and exists (
    select 1 from public.creator_activity() a
    where n.link = '/profile/' || a.id
      and a.last_active_at > now() - interval '30 days'
  );

-- And let the corrected function re-decide from scratch for anybody it wrongly
-- marked, rather than staying silent because a stale watermark says "told them".
update public.profiles p
set inactive_alerted_at = null
from public.creator_activity() a
where a.id = p.id and a.last_active_at > now() - interval '30 days';
