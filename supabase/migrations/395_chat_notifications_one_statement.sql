-- 395: chat notifications in one statement (12 Oct 2026)
--
-- Migration 391 made the push dispatch one call per INSERT statement. Checking it live, a room message to 82 people
-- still made 82 calls: on_chat_message looped and called notify_user (one INSERT) per recipient. Now it is a single
-- INSERT ... SELECT over exactly the same recipients, so the statement trigger batches it.

CREATE OR REPLACE FUNCTION public.on_chat_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  throttle interval := interval '15 minutes';
  sender_name text;
  ch          text;
  room        text;
  route       text;
  room_label  text;
  staff_only  boolean := false;
  preview     text;
begin
  ch := coalesce(new.channel, 'general');
  room := public.channel_key(ch);

  -- Announcements has its own trigger, its own type and its own audience rule.
  if room = 'announcements' then return new; end if;
  if coalesce(new.deleted, false) then return new; end if;

  if coalesce(new.body, '') = '' and new.image_url is null and new.video_url is null then
    return new;
  end if;

  select name into sender_name from public.profiles where id = new.sender_id;

  -- The room's own name, so the notification reads "Ana posted in Meetups"
  -- rather than naming a slug. Falls back to the key for the legacy rows that
  -- have no `channel_id`.
  select c.label, c.visibility = 'staff'
    into room_label, staff_only
    from public.channels c
   where c.id = new.channel_id;
  room_label := coalesce(room_label, initcap(replace(room, '_', ' ')));

  route := public.channel_route(ch);

  preview := nullif(trim(coalesce(new.body, '')), '');
  if preview is null then
    preview := case when new.video_url is not null then 'Sent a video' else 'Sent a photo' end;
  end if;
  preview := left(preview, 140);

  -- 395: ONE INSERT FOR EVERY RECIPIENT, so the statement trigger (391) sends the pushes in batches of 50 instead of
  -- calling the push function once per person. Same people, same text: notify_user only ever did this insert.
  insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'chat', coalesce(sender_name, 'Someone') || ' posted in ' || room_label, preview, route
    from public.profiles p
    where p.id <> new.sender_id
      and p.status in ('active', 'muted')
      and not coalesce(p.is_test, false)
      and coalesce((p.notif_prefs ->> 'chat')::boolean, true)
      -- One room switched off, rather than all of them.
      and not public.room_muted(p.notif_prefs, ch)
      -- A staff room reaches staff.
      and (not coalesce(staff_only, false) or coalesce(p.is_admin, false))
      -- THE ROOM'S OWN MEMBERS. A creator who is not in this market has no
      -- reason to hear about it. The `is null` arm covers the handful of legacy
      -- rows written before messages carried a community.
      and (
        new.community_id is null
        or exists (
          select 1 from public.community_members cm
          where cm.community_id = new.community_id
            and cm.profile_id = p.id
            and cm.status = 'active'
        )
      )
      -- Not while they are reading it anyway.
      and (p.last_seen_at is null or p.last_seen_at < now() - interval '2 minutes')
      -- Somebody named in the message gets a mention, not a room nudge.
      and not (
        length(coalesce(p.name, '')) > 1
        and position('@' || p.name in coalesce(new.body, '')) > 0
      )
      -- One nudge per room per quarter hour, whatever the room's traffic.
      and not exists (
        select 1
        from public.notifications n
        where n.recipient_id = p.id
          and n.type = 'chat'
          and n.link = route
          and n.created_at > now() - throttle
      );

  return new;
end;
$function$;
