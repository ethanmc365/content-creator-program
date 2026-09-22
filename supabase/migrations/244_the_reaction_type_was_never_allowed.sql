-- 244: THE 'reaction' NOTIFICATION TYPE WAS NEVER ALLOWED (22 Sep 2026).
--
-- Migration 243 wrote notifications of type 'reaction', and
-- `notifications_type_check` lists every allowed type by name - 'reaction' was
-- not on it. Every insert failed, and the trigger's `exception when others`
-- (there so a notification can never cost somebody their reaction) swallowed
-- it: reactions worked, nobody was ever told. Found by rehearsing a real
-- reaction inside a rolled-back block, which is the only reason it was found.
--
-- Two fixes. The type is allowed. And the safety net now REPORTS what it
-- catches into client_errors (report_system_error, which the admin panel
-- already surfaces), so the next silent failure here is not silent.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'challenge', 'announcement', 'results', 'reward', 'deadline', 'connection', 'dm', 'event',
  'application', 'chat', 'submission', 'deletion', 'referral', 'new_member', 'inactive',
  'feedback', 'collab', 'mention', 'daily_streak', 'daily_reminder', 'board_answer', 'report',
  'event_reminder', 'event_rating', 'reaction'
]));

create or replace function public.on_room_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m public.messages%rowtype;
  v_preview text;
begin
  select * into m from public.messages where id = new.message_id;
  if not found or coalesce(m.deleted, false) then return new; end if;
  v_preview := nullif(trim(coalesce(m.body, '')), '');
  if v_preview is null then
    v_preview := case when m.video_url is not null then 'Your video' when m.image_url is not null then 'Your photo' else 'Your message' end;
  end if;
  perform public.notify_reaction_internal(
    m.sender_id, new.creator_id, new.emoji, v_preview,
    public.channel_route(coalesce(m.channel, 'general')));
  return new;
exception when others then
  begin
    perform public.report_system_error('reaction_notify', 'room', sqlerrm, sqlstate, null);
  exception when others then null;
  end;
  return new;
end;
$$;

create or replace function public.on_dm_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m public.direct_messages%rowtype;
  v_preview text;
begin
  select * into m from public.direct_messages where id = new.message_id;
  if not found then return new; end if;
  v_preview := nullif(trim(coalesce(m.body, '')), '');
  if v_preview is null then
    v_preview := case when m.image_url is not null then 'Your photo' else 'Your message' end;
  end if;
  perform public.notify_reaction_internal(
    m.sender_id, new.creator_id, new.emoji, v_preview,
    '/messages/' || m.conversation_id);
  return new;
exception when others then
  begin
    perform public.report_system_error('reaction_notify', 'dm', sqlerrm, sqlstate, null);
  exception when others then null;
  end;
  return new;
end;
$$;
