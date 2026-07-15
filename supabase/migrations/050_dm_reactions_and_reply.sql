-- Migration 050: bring DMs up to parity with the #general / #content-tips chat.
--   * reply_to  — quote an earlier message in the same thread
--   * dm_reactions — emoji reactions, private to the two participants
-- Mirrors the community `reactions` table + `messages.reply_to` (migration 045).

-- 1. Reply-to: a DM can quote an earlier DM. Nulled (not cascaded) if the
--    quoted message is later deleted, so the reply itself survives.
alter table public.direct_messages
  add column if not exists reply_to uuid references public.direct_messages (id) on delete set null;
create index if not exists idx_dms_reply_to on public.direct_messages (reply_to);

-- 2. DM reactions. Unlike community reactions (readable by any member), these
--    are visible ONLY to the two people in the underlying conversation.
create table if not exists public.dm_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  unique (message_id, creator_id, emoji)          -- one of each emoji per person
);
create index if not exists idx_dm_reactions_message on public.dm_reactions (message_id);

alter table public.dm_reactions enable row level security;

-- Only the sender / recipient of the underlying DM can see its reactions.
create policy "dm_reactions: participants read"
  on public.dm_reactions for select to authenticated
  using (exists (
    select 1 from public.direct_messages m
    where m.id = dm_reactions.message_id
      and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
  ));

-- You may react to a message in a conversation you're part of.
create policy "dm_reactions: add own"
  on public.dm_reactions for insert to authenticated
  with check (
    creator_id = auth.uid()
    and public.can_post()
    and exists (
      select 1 from public.direct_messages m
      where m.id = dm_reactions.message_id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

create policy "dm_reactions: remove own"
  on public.dm_reactions for delete to authenticated
  using (creator_id = auth.uid());

-- Realtime so a reaction appears instantly for both people (same as reactions).
alter publication supabase_realtime add table public.dm_reactions;
