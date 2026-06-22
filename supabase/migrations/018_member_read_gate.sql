-- ============================================================================
-- 018 - gate community READS to approved members (defense in depth)
--   Many SELECT policies were `using (true)`, so ANY signed-in user - including
--   a brand-new pending signup awaiting review - could read community data
--   (chat, profiles, submissions, challenges, ...) straight from the API, even
--   though the UI tried to gate them. This locks reads to approved members
--   (status active/muted) or admins. Each user keeps access to their OWN rows
--   so onboarding still works. Owner-scoped tables (DMs, conversations,
--   notifications, rewards, referrals, creator_private) were already safe.
-- ============================================================================
set check_function_bodies = off;

-- Approved-member check. Pending / declined / suspended => false.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status in ('active', 'muted') from public.profiles where id = auth.uid()), false)
         or public.is_admin();
$$;
grant execute on function public.is_member() to authenticated, anon;

-- Your own profile is always readable (AuthContext + onboarding need it);
-- everyone else's only for approved members.
drop policy if exists "profiles: read for signed-in users" on public.profiles;
create policy "profiles: read for members" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_member());

-- Your own travel photos (you may add them during onboarding) or members.
drop policy if exists "creator_photos: read for signed-in users" on public.creator_photos;
create policy "creator_photos: read for members" on public.creator_photos for select to authenticated
  using (creator_id = auth.uid() or public.is_member());

-- Plain community content: approved members only.
drop policy if exists "messages: read for signed-in users" on public.messages;
create policy "messages: read for members" on public.messages for select to authenticated using (public.is_member());

drop policy if exists "submissions: read for signed-in users" on public.submissions;
create policy "submissions: read for members" on public.submissions for select to authenticated using (public.is_member());

drop policy if exists "events: read for signed-in users" on public.events;
create policy "events: read for members" on public.events for select to authenticated using (public.is_member());

drop policy if exists "polls: read for signed-in users" on public.polls;
create policy "polls: read for members" on public.polls for select to authenticated using (public.is_member());

drop policy if exists "poll_options: read for signed-in users" on public.poll_options;
create policy "poll_options: read for members" on public.poll_options for select to authenticated using (public.is_member());

drop policy if exists "poll_votes: read for signed-in users" on public.poll_votes;
create policy "poll_votes: read for members" on public.poll_votes for select to authenticated using (public.is_member());

drop policy if exists "resources: read for signed-in users" on public.resources;
create policy "resources: read for members" on public.resources for select to authenticated using (public.is_member());

drop policy if exists "results: read for signed-in users" on public.results;
create policy "results: read for members" on public.results for select to authenticated using (public.is_member());

drop policy if exists "connections: read for signed-in users" on public.connections;
create policy "connections: read for members" on public.connections for select to authenticated using (public.is_member());

drop policy if exists "reactions: read for signed-in users" on public.reactions;
create policy "reactions: read for members" on public.reactions for select to authenticated using (public.is_member());

drop policy if exists "game_events: read for signed-in" on public.game_events;
create policy "game_events: read for members" on public.game_events for select to authenticated using (public.is_member());

drop policy if exists "game_scores: read for signed-in" on public.game_scores;
create policy "game_scores: read for members" on public.game_scores for select to authenticated using (public.is_member());

-- Keep published/admin visibility, but require membership too.
drop policy if exists "challenges: read published" on public.challenges;
create policy "challenges: read published" on public.challenges for select to authenticated
  using ((public.is_member() and status <> 'draft') or public.is_admin());

drop policy if exists "jobs: read open or admin" on public.jobs;
create policy "jobs: read open or admin" on public.jobs for select to authenticated
  using ((public.is_member() and status = 'open') or public.is_admin());

drop policy if exists "wall_of_fame: read published" on public.wall_of_fame;
create policy "wall_of_fame: read published" on public.wall_of_fame for select to authenticated
  using ((public.is_member() and published) or public.is_admin());
