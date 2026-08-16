-- 105: a notification centre you can actually clear.
--
-- The bell could mark things read and nothing else, so the list only ever grew:
-- a creator who had been here six months opened it on a hundred rows of things
-- that had already happened. Dismissing one, and clearing what you have read,
-- are the two operations that make it a centre rather than a log.
--
-- DELETE, not a `dismissed` flag. The row has no value once its owner has
-- dismissed it - it is not referenced, not reported on, and the audit log is
-- what records that something happened. A flag would mean every read on this
-- table grows a predicate for ever.
--
-- Scoped to the recipient exactly the way the read and update policies are, so
-- nobody can clear anyone else's bell.
create policy "notifications: clear own"
  on public.notifications for delete
  to authenticated
  using (recipient_id = (select auth.uid()));

-- The bell reads "mine, newest first" on every page load and the centre pages
-- through the same order. There was no index for it: `recipient_id` alone made
-- Postgres sort a creator's whole history every time.
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
