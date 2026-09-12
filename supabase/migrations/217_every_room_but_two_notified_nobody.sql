-- 217. EVERY ROOM BUT TWO NOTIFIED NOBODY.
--
-- Ethan: "for the rooms, when there's new chats, for example the romanian
-- community, it didn't show up that there were new chats, no one can tell
-- there's new messages unless they actually click into it."
--
-- He is describing two separate holes and this migration closes the server-side
-- one. `on_chat_message` opened with
--
--     if ch not in ('general', 'content_tips') then return new; end if;
--
-- which is the two channel keys the platform had before markets existed. Every
-- namespaced room - `romania:general`, `uk:meetups`, `spain:content_tips`, and
-- every room in every market opened from now on - fell out of that `if` on the
-- first line and nobody was ever told a word had been said in it. Measured
-- against production on 12 Sep 2026: `romania:general` carries eight messages,
-- the most recent one minutes old, and the `notifications` table holds not one
-- row pointing at it.
--
-- `on_announcement` had the same shape (`new.channel = 'announcements'`), so a
-- market's own Announcements room - the one room whose entire purpose is to
-- reach people who are not looking - was silent too.
--
-- And `on_message_mention` built its link by hand as '/chat/' || ch, which for
-- a namespaced channel is a route that does not exist: being @-mentioned in the
-- Romanian room sent you to /chat/romania:general and bounced you to /rooms.
-- `channel_route` has been the right answer since the markets shipped; two of
-- the three triggers never learned about it.
--
-- THE AUDIENCE IS NOW THE ROOM'S OWN MEMBERS. The old function walked every
-- active profile on the platform, which was survivable when the only rooms were
-- worldwide and is wrong the moment a room belongs to a market: a creator in
-- the UK has no business being buzzed about the Nordics. `messages.community_id`
-- has been written by the chat page since the markets shipped, so the audience
-- is `community_members` and the fallback to "everybody" only covers the legacy
-- rows that predate the column.
--
-- AND A CREATOR CAN NOW SWITCH ONE ROOM OFF. Ethan: "creators should have
-- ability to choose custom settings like turn off notifications for certain
-- chats, but never for announcements or anything from the Tryp.com, but for
-- example be able to turn off 'meetups' chat." `notif_prefs.muted_rooms` is an
-- array of channel keys; `room_muted` is the one place that reads it, and it
-- answers FALSE for an announcements room whatever the array says. The rule
-- lives in the database rather than in the settings screen because a client
-- that forgets to hide a switch must not be able to turn off the one broadcast
-- channel the programme depends on.

-- ---------------------------------------------------------------- helpers

-- The key part of a namespaced channel: `romania:general` -> `general`,
-- `general` -> `general`. The rooms are addressed both ways and every rule
-- below cares about the room, not about which market it is in.
create or replace function public.channel_key(ch text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case when position(':' in coalesce(ch, '')) > 0
    then split_part(ch, ':', 2)
    else coalesce(ch, '')
  end;
$$;

-- Has this creator switched THIS room off?
--
-- Announcements is never mutable - it is how the programme reaches people, and
-- it is the one thing Ethan named as off limits. The check is on the room's key
-- so it holds for every market's announcements room, including markets that do
-- not exist yet.
create or replace function public.room_muted(prefs jsonb, ch text)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select case
    when public.channel_key(ch) = 'announcements' then false
    when prefs is null then false
    when jsonb_typeof(prefs -> 'muted_rooms') <> 'array' then false
    else (prefs -> 'muted_rooms') ? ch
  end;
$$;

comment on function public.room_muted(jsonb, text) is
  'True when notif_prefs.muted_rooms names this channel. Always false for an announcements room: that one cannot be switched off.';

-- ------------------------------------------------------- a message in a room

create or replace function public.on_chat_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  throttle interval := interval '15 minutes';
  sender_name text;
  ch          text;
  room        text;
  route       text;
  room_label  text;
  staff_only  boolean := false;
  preview     text;
  rec         record;
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

  for rec in
    select p.id
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
      )
  loop
    perform public.notify_user(
      rec.id,
      'chat',
      coalesce(sender_name, 'Someone') || ' posted in ' || room_label,
      preview,
      route
    );
  end loop;

  return new;
end;
$function$;

-- --------------------------------------------------------- an announcement

create or replace function public.on_announcement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  place_name text;
  route      text;
  rec        record;
begin
  if public.channel_key(coalesce(new.channel, '')) <> 'announcements' then return new; end if;
  if coalesce(new.deleted, false) then return new; end if;
  if coalesce(new.body, '') = '' and new.image_url is null and new.video_url is null then
    return new;
  end if;

  route := public.channel_route(new.channel);

  select name into place_name from public.communities where id = new.community_id;

  -- NOT notify_all. An announcement in the Romanian room is an announcement to
  -- Romania; `notify_all` sent every one of them to all 46 active creators
  -- regardless of which market it was posted in.
  for rec in
    select p.id
    from public.profiles p
    where p.id is distinct from new.sender_id
      and p.status = 'active'
      and not coalesce(p.is_test, false)
      and (
        new.community_id is null
        or exists (
          select 1 from public.community_members cm
          where cm.community_id = new.community_id
            and cm.profile_id = p.id
            and cm.status = 'active'
        )
      )
  loop
    perform public.notify_user(
      rec.id,
      'announcement',
      case when place_name is null or place_name = 'Worldwide'
        then 'New announcement'
        else 'New announcement in ' || place_name end,
      left(coalesce(nullif(trim(new.body), ''), 'Open the room to read it'), 140),
      route
    );
  end loop;

  return new;
end;
$function$;

-- ------------------------------------------------------------- a mention

create or replace function public.on_message_mention()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  sender_name text;
  room_label  text;
  route       text;
  rec         record;
begin
  if new.body is null or new.body = '' or coalesce(new.deleted, false) or position('@' in new.body) = 0 then
    return new;
  end if;

  select name into sender_name from public.profiles where id = new.sender_id;
  select c.label into room_label from public.channels c where c.id = new.channel_id;
  room_label := coalesce(room_label, initcap(replace(public.channel_key(coalesce(new.channel, 'general')), '_', ' ')));

  -- BY `channel_route`, NOT BY HAND. '/chat/' || 'romania:general' is not a
  -- route; being mentioned in a market room bounced you to /rooms.
  route := public.channel_route(coalesce(new.channel, 'general'));

  for rec in
    select p.id from public.profiles p
    where p.id <> new.sender_id
      and p.status in ('active', 'muted')
      and not coalesce(p.is_test, false)
      and length(coalesce(p.name, '')) > 1
      and position('@' || p.name in new.body) > 0
  loop
    -- A MENTION IGNORES A ROOM MUTE. Muting Meetups means "stop telling me
    -- every time somebody posts there", not "stop telling me when somebody is
    -- talking to me".
    perform public.notify_user(rec.id, 'mention',
      coalesce(sender_name, 'Someone') || ' mentioned you in ' || room_label,
      left(new.body, 140),
      route);
  end loop;
  return new;
end;
$function$;

-- --------------------------------------------------- what is unread, in one go
--
-- The client used to work this out by pulling the last 300 messages across
-- every room it could see and diffing them against `channel_reads` in
-- JavaScript, on one page only. Three surfaces need the answer now - the rooms
-- index, the chat sidebar and the mobile tab strip - so it is one query that
-- returns it, scoped by the caller's own membership.
--
-- The rules are the ones the rooms page already applied, and each is a state
-- that would otherwise light a dot for nothing: your own message never counts,
-- an empty room is empty rather than unread, and a room you have never opened
-- that HAS messages in it IS unread (there is no `channel_reads` row at all for
-- most creators and most rooms, which is precisely the case that matters).
create or replace function public.my_unread_rooms()
returns table (channel text, unread_count integer, last_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  with mine as (
    select c.id as community_id,
           case when c.kind = 'network' then ch.key else c.slug || ':' || ch.key end as channel
    from public.community_members cm
    join public.communities c on c.id = cm.community_id
    join public.channels ch on ch.community_id = c.id
    where cm.profile_id = auth.uid()
      and cm.status = 'active'
      and (ch.visibility <> 'staff'
           or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  )
  select m.channel,
         count(msg.id)::int as unread_count,
         max(msg.created_at) as last_at
  from mine m
  join public.messages msg
    on msg.channel = m.channel
   and not coalesce(msg.deleted, false)
   and msg.sender_id is distinct from auth.uid()
   and msg.created_at > coalesce(
         (select r.last_read_at from public.channel_reads r
           where r.channel = m.channel and r.user_id = auth.uid()),
         'epoch'::timestamptz)
  group by m.channel
  having count(msg.id) > 0;
$$;

comment on function public.my_unread_rooms() is
  'Every room the caller belongs to that has messages they have not seen, with a count and the time of the newest.';

revoke all on function public.my_unread_rooms() from public;
grant execute on function public.my_unread_rooms() to authenticated;
grant execute on function public.channel_key(text) to authenticated, anon;
grant execute on function public.room_muted(jsonb, text) to authenticated;

-- The unread query is `where channel = ? and created_at > ?` once per room.
create index if not exists messages_channel_created_idx
  on public.messages (channel, created_at desc)
  where deleted = false;
