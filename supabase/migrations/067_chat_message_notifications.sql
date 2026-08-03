-- 067: notifications for new community chat messages.
--
-- Settings has advertised a "General chat - new messages in the #general
-- channel" push toggle since notifications shipped, but nothing ever created a
-- `chat` notification: the only message triggers were on_announcement
-- (announcements channel), on_message_mention (@name) and on_message_everyone
-- (@everyone). So the toggle was dead and no push ever arrived for #general.
-- `select type, count(*) from notifications` confirmed zero rows of type 'chat'.
--
-- This adds the missing trigger, with three guards so a busy channel cannot
-- turn into a stream of buzzes:
--
--   1. THROTTLE - at most one chat notification per person per channel every
--      CHAT_NOTIFY_THROTTLE minutes. A back-and-forth conversation therefore
--      costs one push, not thirty.
--   2. ACTIVE NOW - anyone whose presence heartbeat (profiles.last_seen_at,
--      stamped every 60s by AppLayout while the tab is visible) fired in the
--      last 2 minutes is already looking at the app, so they get the in-app
--      unread badge instead of a push.
--   3. MENTIONED - if the same message @mentions someone, on_message_mention
--      already notifies them personally; don't double up.
--
-- Card-only messages (birthday cards, polls, resource/leaderboard shares post
-- with an empty body) are skipped: the daily birthday card must not push the
-- whole community.
create or replace function public.on_chat_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  throttle interval := interval '15 minutes';
  sender_name text;
  ch text;
  preview text;
  rec record;
begin
  ch := coalesce(new.channel, 'general');

  -- Allowlist, not a blocklist: announcements have their own broadcast trigger
  -- (on_announcement), and anything else is not a community channel, so a stray
  -- or future channel value can never notify 40 people by accident.
  if ch not in ('general', 'content_tips') then return new; end if;
  if coalesce(new.deleted, false) then return new; end if;

  -- Real messages only: text, a photo or a video. Inline cards post an empty
  -- body and are announced by their own flows.
  if coalesce(new.body, '') = '' and new.image_url is null and new.video_url is null then
    return new;
  end if;

  select name into sender_name from public.profiles where id = new.sender_id;

  preview := nullif(trim(coalesce(new.body, '')), '');
  if preview is null then
    preview := case when new.video_url is not null then 'Sent a video' else 'Sent a photo' end;
  end if;
  preview := left(preview, 140);

  for rec in
    select p.id
    from public.profiles p
    where p.id <> new.sender_id
      and p.status in ('active', 'muted')
      and not coalesce(p.is_test, false)
      -- respect the Settings toggle: only skip when explicitly switched off
      and coalesce((p.notif_prefs ->> 'chat')::boolean, true)
      -- guard 2: already active in the app right now
      and (p.last_seen_at is null or p.last_seen_at < now() - interval '2 minutes')
      -- guard 3: personally @mentioned in this very message
      and not (
        length(coalesce(p.name, '')) > 1
        and position('@' || p.name in coalesce(new.body, '')) > 0
      )
      -- guard 1: throttle per person per channel
      and not exists (
        select 1
        from public.notifications n
        where n.recipient_id = p.id
          and n.type = 'chat'
          and n.link = '/chat/' || ch
          and n.created_at > now() - throttle
      )
  loop
    perform public.notify_user(
      rec.id,
      'chat',
      coalesce(sender_name, 'Someone') || ' posted in #' || ch,
      preview,
      '/chat/' || ch
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.on_chat_message() from public, anon, authenticated;

drop trigger if exists trg_on_chat_message on public.messages;
create trigger trg_on_chat_message
  after insert on public.messages
  for each row execute function public.on_chat_message();
