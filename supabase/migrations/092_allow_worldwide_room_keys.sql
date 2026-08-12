-- 092: let a Worldwide room that is not one of the three legacy ones hold a message.
--
-- THE BUG. `messages_channel_check` allowed exactly two shapes:
--     'general' | 'announcements' | 'content_tips'      (the legacy UK chat)
--     '<slug>:<key>'                                     (every market room)
--
-- Worldwide is deliberately NOT namespaced - its General *is* the existing
-- 128-message conversation, so it keeps the bare key (see NetworkChat's
-- scopedKey). That is right for those three. But it means every OTHER worldwide
-- room writes a bare key too: 'introductions', 'staff'. Neither shape matched,
-- so every send in those rooms came back 400 and they have sat at zero messages
-- since the day they were created. Posting a poll or a resource card into one
-- failed the same way, and worse: the poll row was written first, so a failed
-- post left an orphan poll behind.
--
-- The fix widens the constraint to accept a bare key, which is what the network
-- rooms have always been writing. It does NOT weaken the separation the
-- namespacing exists for:
--   * a MARKET room still writes '<slug>:<key>' and can never collide,
--   * the legacy Chat.jsx reads a hard-coded list of three channels, so a
--     worldwide room called 'introductions' remains invisible to it - which is
--     exactly why those rooms are the safe ones to post in.
--
-- Widening a CHECK cannot invalidate an existing row, so this needs no backfill
-- and no data migration.

alter table public.messages drop constraint if exists messages_channel_check;

alter table public.messages add constraint messages_channel_check check (
  -- A room inside a market: spain:general, uk:meetups.
  channel ~ '^[a-z0-9-]{2,32}:[a-z0-9_]{2,32}$'
  -- A Worldwide room, including the three the legacy chat reads.
  or channel ~ '^[a-z0-9_]{2,32}$'
);

-- Same story on channel_reads, which is keyed by the identical string: a room
-- whose receipts cannot be written is a room where "seen by" is always empty.
-- (No constraint exists there today; this comment is the note for whoever adds
-- one, so they widen it in the same shape rather than reintroducing the bug.)
