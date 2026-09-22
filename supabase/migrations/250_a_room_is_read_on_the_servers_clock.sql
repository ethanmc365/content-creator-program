-- 250: A ROOM IS READ ON THE SERVER'S CLOCK, AND NEVER BACKWARDS (22 Sep 2026).
--
-- Ethan: "on rooms it will show the dot that there's a notification, then I
-- open the chat to see it, and it's something I've already seen - maybe
-- because I refreshed or used different tabs or the mobile app. Everything
-- doesn't seem to be syncing correctly."
--
-- The watermark in `channel_reads` was written by the browser with the
-- browser's own time, `upsert`ed over whatever was there. Two ways that lit a
-- dot on a room already read:
--
--   * A PHONE WHOSE CLOCK RUNS BEHIND writes a watermark earlier than the
--     message it just displayed (`messages.created_at` is the server's clock),
--     so that message stays "newer than what you read" for ever.
--   * A SECOND DEVICE OR A STALE TAB writes an OLDER watermark over a newer one:
--     the upsert has no notion of "later wins", so reading on the phone and then
--     a laptop tab that had been open since this morning moved it backwards.
--
-- AND READING A ROOM NEVER CLEARED ITS NOTIFICATIONS. The bell is cleared by
-- `mark_notifications_read_for_path`, an EXACT match on the page you land on -
-- but room notifications were written with links the room is no longer at:
-- `/chat/general` (421 unread in the last week) REDIRECTS to
-- `/global/chat/general`, so arriving on the room never matched its own
-- notifications, and the bell kept saying "new in General" about messages
-- already read. Reading a room now clears every notification that points at
-- it, under any of the paths it has had.
--
-- `mark_channel_read` stamps `now()` from the database and only ever moves the
-- watermark forward. It writes your own row and nothing else, so it needs no
-- more than a signed-in caller (the table's insert policy also demanded
-- `can_post()`, which quietly refused a watermark from anybody who could read
-- a room but not post in it).

create or replace function public.mark_channel_read(p_channel text)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz;
begin
  if v_uid is null or coalesce(btrim(p_channel), '') = '' then
    return null;
  end if;
  insert into public.channel_reads as r (channel, user_id, last_read_at)
  values (p_channel, v_uid, now())
  on conflict (channel, user_id) do update
     set last_read_at = greatest(r.last_read_at, excluded.last_read_at)
  returning r.last_read_at into v_at;

  -- The bell, for this room, under every path it has been linked by: a
  -- worldwide room is `/global/chat/<key>` and was `/chat/<key>`; a market's is
  -- `/c/<slug>/chat/<key>`. Query strings and anchors are ignored.
  update public.notifications n
     set read = true
   where n.recipient_id = v_uid
     and n.read = false
     and n.type in ('chat', 'announcement', 'mention', 'reaction')
     and split_part(split_part(coalesce(n.link, ''), '?', 1), '#', 1) = any (
           case when position(':' in p_channel) > 0
             then array['/c/' || split_part(p_channel, ':', 1) || '/chat/' || split_part(p_channel, ':', 2)]
             else array['/global/chat/' || p_channel, '/chat/' || p_channel]
           end);

  return v_at;
end;
$function$;
revoke all on function public.mark_channel_read(text) from public, anon;
grant execute on function public.mark_channel_read(text) to authenticated;
