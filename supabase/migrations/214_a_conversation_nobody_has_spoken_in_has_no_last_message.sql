-- A CONVERSATION NOBODY HAS SPOKEN IN HAS NO LAST MESSAGE.
--
-- Ethan: "DMs showing up on mobile that don't show up on desktop. I think these
-- are the DMs that were partly started but then abandoned. I've mentioned it
-- shouldn't show up unless they've actually sent the first message - if you
-- just start a message but then don't send it, it shouldn't show up."
--
-- The half of this that was fixed earlier today was the CREATION path: pressing
-- Message no longer inserts a row, the row is minted on the first send (see the
-- note on `draftTo` in Messages.jsx). That stops new phantoms. It does nothing
-- about the three that already existed, which is what he is still looking at -
-- and nothing about detecting one, which is why the inbox could not simply
-- filter them out.
--
-- IT COULD NOT, BECAUSE `last_message_at` WAS NOT ALLOWED TO SAY SO. The column
-- is `not null default now()`, so a conversation created and never spoken in
-- carries a timestamp that is indistinguishable from one somebody messaged in a
-- second ago - and it sorts to the top of the inbox on exactly that basis. The
-- column named "when the last message arrived" was answering "when this row was
-- made", and those are the same number only in the case that never happens any
-- more.
--
-- Dropping the default and the NOT NULL makes the absence expressible, and it
-- is then maintained by the machinery that is already there: `touch_conversation`
-- fires on every insert into `direct_messages` and stamps this column, so a
-- conversation is null exactly until its first message and never again. There
-- is nothing new to keep in step - the client filters on a fact the database
-- already maintains.
--
-- (The mobile/desktop asymmetry Ethan noticed is the page cache in
-- lib/pageCache: the inbox is remembered per device, so two devices can be
-- looking at lists written at different moments. The rows were on both.)
--
-- NOTHING IS DELETED. Three rows carrying no messages are worth nothing, but
-- they are also somebody's data and this migration is not the place to decide
-- that: they stop being listed, they keep existing, and if one of them ever
-- receives a message it reappears in the right place with the right timestamp.
-- Same rule the video tracker's retirement follows, and `milestone_progress`
-- before it: a bookkeeping pass must not delete the thing it keeps books on.
--
-- GROUPS ARE EXEMPT, in the client rather than here. Being added to a group
-- nobody has posted in yet is a real thing that happened to you and belongs in
-- your inbox; opening and abandoning a 1:1 is not.

alter table public.conversations
  alter column last_message_at drop default,
  alter column last_message_at drop not null;

-- The backfill. `not exists` rather than a left join and a null check, because
-- this asks a question about existence and reads as one.
update public.conversations c
   set last_message_at = null
 where not exists (
   select 1 from public.direct_messages m where m.conversation_id = c.id
 );

comment on column public.conversations.last_message_at is
  'When the most recent message arrived. NULL means nobody has sent one yet - '
  'the inbox hides 1:1 threads in that state (see Messages.jsx). Maintained by '
  'trg_touch_conversation on direct_messages.';
