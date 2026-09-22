-- 251: A LIVE LEADERBOARD IN THE ROOMS (22 Sep 2026).
--
-- Ethan: "whenever sharing it as an announcement or in general, I would like to
-- be able to embed the actual leaderboard in the chats, so it looks really
-- nice, it has animations and it would obviously update live when the views
-- are synced." The picture (a PNG of the board) stays - it is still what you
-- download and post anywhere else - but inside the app a shared board is now
-- the board itself.
--
-- A message can carry a challenge the way it already carries a poll or a
-- resource: the card IS the message. `leaderboard_group_id` picks one board on
-- a split challenge; null is the whole challenge.
--
-- The card follows the board through `challenges.results_updated_at`, which
-- `rebuild_challenge_results` stamps on every sync, every hand-typed view and
-- every points change - one row per challenge, rather than subscribing every
-- open card to the delete-and-reinsert of the whole `results` table. So
-- `challenges` joins the realtime publication; its RLS still decides who hears
-- about which row.

alter table public.messages
  add column if not exists leaderboard_challenge_id uuid references public.challenges(id) on delete set null,
  add column if not exists leaderboard_group_id uuid references public.challenge_groups(id) on delete set null;

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  char_length(body) <= 4000 and (
    body <> '' or image_url is not null or poll_id is not null or game_event_id is not null
    or birthday_for is not null or resource_id is not null or audio_url is not null
    or video_url is not null or leaderboard_challenge_id is not null
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenges'
  ) then
    alter publication supabase_realtime add table public.challenges;
  end if;
end $$;
