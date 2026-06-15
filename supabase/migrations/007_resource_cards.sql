-- ============================================================================
-- 007 - admins can drop a clickable resource card into any chat channel
-- ============================================================================
set check_function_bodies = off;

-- A chat message can carry a resource-library card (rendered inline, like polls
-- and game challenges).
alter table public.messages add column if not exists resource_id uuid references public.resources (id) on delete cascade;

-- Allow an empty body when the message is a poll / game / birthday / resource card.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (
    char_length(body) <= 4000
    and (body <> '' or image_url is not null or poll_id is not null
         or game_event_id is not null or birthday_for is not null
         or resource_id is not null)
  );
