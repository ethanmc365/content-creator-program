-- ============================================================================
-- 005 — Geography game (flag quiz + find-on-map), scores, events
-- ============================================================================
set check_function_bodies = off;

-- Admin-created game events that can be dropped into the chat as a card.
create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  mode text not null,                 -- 'flags' | 'map'
  region text not null,               -- 'World' or a continent name
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.game_events enable row level security;
create policy "game_events: read for signed-in" on public.game_events for select to authenticated using (true);
create policy "game_events: admin manage" on public.game_events for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- One row per completed game run (feeds the leaderboards).
create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null,                 -- 'flags' | 'map'
  region text not null,               -- 'World' or a continent name
  correct int not null,
  total int not null,
  time_ms int not null,               -- elapsed time in milliseconds
  event_id uuid references public.game_events (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_game_scores_board on public.game_scores (mode, region, correct desc, time_ms);
create index if not exists idx_game_scores_event on public.game_scores (event_id);

alter table public.game_scores enable row level security;
create policy "game_scores: read for signed-in" on public.game_scores for select to authenticated using (true);
create policy "game_scores: insert own" on public.game_scores for insert to authenticated with check (player_id = auth.uid() and public.can_post());

-- A chat message can carry a game-event card (rendered inline, like polls).
alter table public.messages add column if not exists game_event_id uuid references public.game_events (id) on delete set null;

-- Live leaderboards.
alter publication supabase_realtime add table public.game_scores;

-- ----------------------------------------------------------------------------
-- Resource categories are now admin-defined free text (no fixed set).
-- ----------------------------------------------------------------------------
alter table public.resources drop constraint if exists resources_category_check;
