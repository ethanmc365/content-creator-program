-- Migration 051: interim challenge leaderboards, leaderboard-update cards,
-- and group-chat read receipts.

-- 1. Challenge results phase. 'none' before any leaderboard is published,
--    'interim' for a mid-challenge snapshot (views logged so far), 'final'
--    once the challenge has closed and views are re-logged for the real ranking.
alter table public.challenges
  add column if not exists results_status text not null default 'none'
    check (results_status in ('none', 'interim', 'final'));
alter table public.challenges
  add column if not exists results_updated_at timestamptz;

-- 2. A chat message can carry a challenge leaderboard card (rendered inline,
--    like polls / game events / resources). Admins post these to #announcements.
alter table public.messages
  add column if not exists leaderboard_challenge_id uuid references public.challenges (id) on delete set null;

-- 3. Group-chat read receipts: one row per (channel, member) tracking how far
--    each person has read. Powers the "seen by" avatars on the latest message,
--    mirroring the per-message read flag DMs already have.
create table if not exists public.channel_reads (
  channel text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel, user_id)
);

alter table public.channel_reads enable row level security;

-- Any community member can see who has read a channel; you only write your own row.
create policy "channel_reads: members read"
  on public.channel_reads for select to authenticated
  using (public.is_member());

create policy "channel_reads: upsert own (insert)"
  on public.channel_reads for insert to authenticated
  with check (user_id = auth.uid() and public.can_post());

create policy "channel_reads: upsert own (update)"
  on public.channel_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter publication supabase_realtime add table public.channel_reads;
