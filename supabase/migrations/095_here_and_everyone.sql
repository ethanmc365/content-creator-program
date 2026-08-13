-- 095: @here beside @everyone, and a link that points at the room you posted in.
--
-- TWO THINGS ARE WRONG WITH THE @everyone WE HAVE.
--
-- 1. IT IS THE ONLY BLUNT INSTRUMENT IN THE BOX. A market lead who wants the
--    six people currently reading a room has to choose between messaging them
--    one at a time and buzzing all 44 creators on the platform. @here is the
--    missing middle: the people whose heartbeat says they are in the app right
--    now. It costs nothing to the 38 who are asleep.
--
-- 2. THE LINK IS WRONG EVERYWHERE EXCEPT THE THREE LEGACY ROOMS. It was
--    hard-coded `'/chat/' || channel`, written when `channel` could only be
--    general / announcements / content_tips. Since the network shipped, a
--    channel is either a bare worldwide key (`introductions`) or a namespaced
--    market key (`spain:general`), and both produced a notification that opened
--    a room that does not exist - `/chat/spain:general`. So the one feature
--    whose entire job is "come and look at this" sent people nowhere.
--
-- Admin-only, both of them, as @everyone always was. A creator @-ing a person
-- by name is untouched (on_message_mention).

-- ------------------------------------------------------------- where a room is
-- The app route for a channel key, so a notification opens the room it is about.
--   general | announcements | content_tips  ->  /chat/<key>       (legacy chat)
--   <other bare key>                        ->  /global/chat/<key> (worldwide)
--   <slug>:<key>                            ->  /c/<slug>/chat/<key>
--
-- IMMUTABLE and pure: it is string arithmetic on the key, no lookups, so it
-- cannot drift from whatever the channels table happens to hold today.
create or replace function public.channel_route(ch text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when ch is null then '/chat'
    when ch in ('general', 'announcements', 'content_tips') then '/chat/' || ch
    when position(':' in ch) > 0
      then '/c/' || split_part(ch, ':', 1) || '/chat/' || split_part(ch, ':', 2)
    else '/global/chat/' || ch
  end;
$$;

grant execute on function public.channel_route(text) to authenticated;

-- ------------------------------------------------------------- the broadcast
-- ONE TRIGGER FOR BOTH, because they differ only in who is in the loop. Two
-- triggers would mean a message saying "@here and @everyone" fires twice and
-- the people who are online get notified about it two times.
--
-- WHO IS "HERE". `profiles.last_seen_at` is stamped every 60 seconds by the
-- shell's heartbeat while a tab is visible, so the window has to be wider than
-- the beat or somebody who is plainly reading the room misses it in the 59
-- seconds between beats. Five minutes is what lib/presence.js already calls
-- online; there must not be a second answer to that question.
--
-- And "here" means here, in this room: if the message belongs to a community,
-- only that community's active members are in the loop. A market lead saying
-- @here in the German room has not asked to interrupt anybody in Portugal.
create or replace function public.on_message_everyone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  is_adm boolean;
  body_lc text;
  wants_all boolean;
  wants_here boolean;
  route text;
  label text;
  rec record;
begin
  if new.body is null or coalesce(new.deleted, false) then return new; end if;
  body_lc := lower(new.body);
  wants_all := position('@everyone' in body_lc) > 0;
  wants_here := position('@here' in body_lc) > 0;
  if not (wants_all or wants_here) then return new; end if;

  select is_admin, name into is_adm, sender_name from public.profiles where id = new.sender_id;
  if not coalesce(is_adm, false) then return new; end if;

  route := public.channel_route(new.channel);
  -- @everyone wins when both are present: it is the larger promise, and telling
  -- somebody they were pinged as "here" when the whole network was pinged is a
  -- smaller truth than the one they need.
  label := case when wants_all then '@everyone' else '@here' end;

  for rec in
    select p.id
    from public.profiles p
    where p.id <> new.sender_id
      and p.status in ('active', 'muted')
      and not coalesce(p.is_test, false)
      and (
        wants_all
        or (
          -- @here: in the app in the last five minutes...
          p.last_seen_at is not null
          and p.last_seen_at > now() - interval '5 minutes'
          -- ...and a member of the community this room belongs to, when it
          -- belongs to one. A legacy-chat message has no community_id and the
          -- legacy chat is network-wide, so that case is everybody.
          and (
            new.community_id is null
            or exists (
              select 1 from public.community_members cm
              where cm.community_id = new.community_id
                and cm.profile_id = p.id
                and cm.status = 'active'
            )
          )
        )
      )
  loop
    perform public.notify_user(
      rec.id,
      'mention',
      coalesce(sender_name, 'The team') || ' used ' || label,
      left(new.body, 140),
      route
    );
  end loop;

  return new;
end $$;

revoke all on function public.on_message_everyone() from public, anon, authenticated;

drop trigger if exists trg_on_message_everyone on public.messages;
create trigger trg_on_message_everyone after insert on public.messages
  for each row execute function public.on_message_everyone();
