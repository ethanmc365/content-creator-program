-- 355: a VIP is only notified about what a VIP can open (7 Oct 2026).
--
-- Marta: the Spanish VIPs were "still getting notifications for things they shouldn't, such as the general groups".
-- Migration 350 hid General, Content tips, Announcements, Meetups and Feedback from VIPs, but the room-notice triggers
-- still addressed every member of the market, so in three days the Spanish VIPs got dozens of "X posted in General"
-- pushes for a room they could no longer open. They also got the community's own "You're in! Welcome aboard" on top
-- of the two VIP welcomes.
--
-- One gate, BEFORE INSERT on notifications (it replaces the challenge-only body of migration 344): for a fenced VIP
-- (active VIP, not an admin, not a VIP manager) a notice is dropped when
--   * it is about challenges, results, deadlines, entries, the leaderboard or milestones; or
--   * it links to a room other than Introductions or a VIP room; or
--   * it is the community welcome ("You're in!").
-- Dropping it here also stops the push and the email, which hang off the insert.
create or replace function public.vip_fenced(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.vip_members vm where vm.profile_id = p_profile and vm.status = 'active')
     and not exists (select 1 from public.profiles p where p.id = p_profile and p.is_admin)
     and not exists (select 1 from public.vip_managers m where m.profile_id = p_profile)
$$;
revoke execute on function public.vip_fenced(uuid) from public, anon, authenticated;

-- The room key a notification link points at, or null when it is not a room: /chat/<k>, /global/chat/<k>,
-- /c/<market>/chat/<k> (with anything after it).
create or replace function public.notice_room_key(p_link text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select (regexp_match(coalesce(p_link, ''), '^/(?:c/[^/]+/|global/)?chat/([^/?#]+)'))[1]
$$;

create or replace function public.vip_no_challenge_notices()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_key text;
begin
  if not public.vip_fenced(new.recipient_id) then return new; end if;
  if new.type in ('challenge', 'results', 'deadline', 'submission') then return null; end if;
  if coalesce(new.link, '') ~ '^/(challenges|leaderboard|milestones|c/[^/]+/challenges)' then return null; end if;
  v_key := public.notice_room_key(new.link);
  if v_key is not null and v_key not in ('introductions', 'vip', 'vip_announcements', 'vip_global') then return null; end if;
  if new.type = 'application' and new.title like 'You''re in!%' then return null; end if;
  return new;
end $function$;

-- What already landed: unread notices of those kinds in VIPs' bells.
delete from public.notifications n
 where not n.read and public.vip_fenced(n.recipient_id)
   and (n.type in ('challenge', 'results', 'deadline', 'submission')
        or coalesce(n.link, '') ~ '^/(challenges|leaderboard|milestones|c/[^/]+/challenges)'
        or (public.notice_room_key(n.link) is not null
            and public.notice_room_key(n.link) not in ('introductions', 'vip', 'vip_announcements', 'vip_global')));
