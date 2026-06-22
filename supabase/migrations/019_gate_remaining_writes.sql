-- ============================================================================
-- 019 - require an active account for the last two self-writes
--   connections + referrals INSERT were scoped to "as yourself" but missed the
--   can_post() check the other community writes have, so a pending/muted user
--   could still create them via the API. Both are only ever created from
--   member-only pages, so this changes nothing for real users.
-- ============================================================================
set check_function_bodies = off;

drop policy if exists "connections: connect as yourself" on public.connections;
create policy "connections: connect as yourself" on public.connections for insert to authenticated
  with check (creator_id = auth.uid() and public.can_post());

drop policy if exists "referrals: create own" on public.referrals;
create policy "referrals: create own" on public.referrals for insert to authenticated
  with check (referrer_id = auth.uid() and public.can_post());
