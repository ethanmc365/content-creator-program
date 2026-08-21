-- Applied to production 21 Aug 2026.
--
-- THE NOTE CANNOT LIVE ON `connections`, AND THIS IS THE FIX FOR THAT.
--
-- 106 added `connections.note` on the assumption that the table's select policy
-- scoped rows to the two people involved. It does not:
--
--     "connections: read for members"  SELECT  using (is_member())
--
-- Every member can read every connection row, which is correct and necessary -
-- mutual-connection counts and the network graph are built by reading the whole
-- edge list. But RLS is ROW level, so one column of a world-readable row cannot
-- be kept private, and a note written to one person would have been legible to
-- all 45 creators. Verified after the fix: author 1, recipient 1, unrelated
-- creator 0 - while all three still read all 128 connection rows.

alter table public.connections drop constraint if exists connections_note_len;
alter table public.connections drop column if exists note;

create table if not exists public.connection_notes (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 300),
  created_at    timestamptz not null default now()
);

alter table public.connection_notes enable row level security;

create policy "connection_notes: the two of you" on public.connection_notes
  for select to authenticated using (
    exists (select 1 from public.connections c
            where c.id = connection_id
              and (c.creator_id = auth.uid() or c.connected_creator_id = auth.uid())));

create policy "connection_notes: write your own" on public.connection_notes
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.connections c
                where c.id = connection_id and c.creator_id = auth.uid()));

create policy "connection_notes: remove your own" on public.connection_notes
  for delete to authenticated using (author_id = auth.uid());
