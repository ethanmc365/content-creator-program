-- 253: TWO UNINDEXED FOREIGN KEYS ON `messages`, AND A ROOM'S OWN READ-RECEIPT
-- POLICY RE-EVALUATING auth.uid() ON EVERY ROW.
--
-- Ethan: "I've noticed some slowness on the platform, like when clicking on
-- rooms." The Supabase performance advisor flags 60 unindexed foreign keys and
-- 23 RLS policies that call `auth.<function>()` per row instead of once per
-- statement - most of them nowhere near a room (event_rsvps, board_questions,
-- admin_notes...) and out of scope for a targeted fix. Two of the findings sit
-- directly in the path of opening a room, though, and one of them is brand new:
--
-- 1. `messages.leaderboard_challenge_id` and `messages.leaderboard_group_id`
--    (migration 251, 22 Sep) have no index. An unindexed foreign key means
--    Postgres has no fast way to check "does any message reference this
--    challenge/group" - which it has to do on every UPDATE or DELETE to
--    `challenges` or `challenge_groups`, and `messages` is now the single
--    largest table a room touches. This shipped the same day the slowness was
--    reported.
--
-- 2. `channel_reads` - written every time a room is opened or left
--    (`mark_channel_read`, see [[tryp-creator-platform]]) - had both an
--    unindexed `user_id` foreign key AND two RLS policies
--    ("upsert own (insert)"/"(update)") that called `auth.uid()` per row
--    instead of `(select auth.uid())`, which Postgres cannot cache across a
--    statement the way it can a scalar subquery. Small table, but the ONE
--    write every room click makes.
--
-- Purely additive: two indexes and a like-for-like rewrite of two policies'
-- conditions (same rule, cheaper to evaluate). Nothing about who can read or
-- write changes.

create index if not exists idx_messages_leaderboard_challenge
  on public.messages (leaderboard_challenge_id)
  where leaderboard_challenge_id is not null;

create index if not exists idx_messages_leaderboard_group
  on public.messages (leaderboard_group_id)
  where leaderboard_group_id is not null;

create index if not exists idx_channel_reads_user
  on public.channel_reads (user_id);

drop policy if exists "channel_reads: upsert own (insert)" on public.channel_reads;
create policy "channel_reads: upsert own (insert)" on public.channel_reads
  for insert
  with check (user_id = (select auth.uid()) and can_post());

drop policy if exists "channel_reads: upsert own (update)" on public.channel_reads;
create policy "channel_reads: upsert own (update)" on public.channel_reads
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
