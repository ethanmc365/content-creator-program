-- THE STAFF ROOM WAS NOT PRIVATE, AND NEITHER WAS ANY OTHER MARKET'S.
--
-- `messages` had exactly one SELECT policy: `is_member()`. And `is_member()` is
-- not what its name suggests - it is "are you an active profile", nothing to do
-- with which community. So every signed-in creator could read EVERY message in
-- EVERY channel: Spain's General from the UK, and the Worldwide staff room from
-- anywhere. The `channels` table has always been gated properly
-- (`channels_read` checks my_scopes() and refuses `visibility = 'staff'` unless
-- you manage the community), so the ROOM LIST was correct and the room CONTENTS
-- were not. Nothing leaked - the staff room holds zero messages and the market
-- rooms three - but the door was open.
--
-- Ethan: "ensure only admins have access to all the announcement chats and the
-- staff chat. Everyone should have access to everything else. And, obviously,
-- they can still view the announcements, but not view the staff chat."
-- Announcements are already read-by-everyone / posted-by-staff via
-- `post_policy`, which is a separate axis and is untouched here. This is the
-- READ axis: staff rooms, and other markets.
--
-- VERIFIED against a plain UK creator with a self-rolling-back jwt.claims
-- block: total 164, staff 0, spain 0, worldwide 157, uk 7.

-- ---------------------------------------------------------------- backfill
--
-- 30 rows predate `community_id` / `channel_id` and carry a bare channel key.
-- A bare key IS a Worldwide room (that is the whole namespacing convention:
-- chapters write `<slug>:<key>`, the network writes the key alone), so they can
-- be pointed at the real row rather than left as a null the policy would have
-- to make an exception for. Doing this FIRST means the policy needs no
-- "or community_id is null" escape hatch, which is the kind of clause that
-- quietly becomes the way in.
update public.messages m
   set community_id = c.id,
       channel_id   = ch.id
  from public.communities c
  join public.channels ch on ch.community_id = c.id
 where c.kind = 'network'
   and m.channel = ch.key
   and m.channel !~ ':'
   and (m.community_id is null or m.channel_id is null);

-- Anything still unresolved (a key with no channel row) is left alone and will
-- simply not be readable, which is the correct failure direction.

-- ------------------------------------------------------------------ policy
drop policy if exists "messages: read for members" on public.messages;

create policy "messages: read in rooms you can open"
on public.messages
for select
using (
  public.is_admin()
  or (
    -- You are in the community the message belongs to...
    community_id in (select public.my_scopes())
    -- ...and the room is not a staff room, unless you manage that community.
    and (
      channel_id is null
      or exists (
        select 1
          from public.channels ch
         where ch.id = messages.channel_id
           and (
             ch.visibility = 'scope'
             or ch.community_id in (select public.my_managed_scopes())
           )
      )
    )
  )
);

notify pgrst, 'reload schema';
