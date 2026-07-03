-- 034_collab_posts.sql
-- Travel collab board: creators post "I'll be in <city> on <dates>, anyone
-- around to meet / collab?" Other members browse and reach out via DM.

create table if not exists public.collab_posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  city text not null,
  country text,
  start_date date not null,
  end_date date not null,
  note text,
  created_at timestamptz not null default now()
);

-- FK covering index + a browse-order index.
create index if not exists idx_collab_posts_creator_id on public.collab_posts(creator_id);
create index if not exists idx_collab_posts_start_date on public.collab_posts(start_date);

alter table public.collab_posts enable row level security;

-- Members read all posts; each user reads their own regardless (parity with the
-- other community tables). auth.uid() wrapped in a select per the initplan lint.
create policy "collab: read for members" on public.collab_posts
  for select using (((creator_id = (select auth.uid())) or is_member()));

-- Only active members can post, and only as themselves.
create policy "collab: create own" on public.collab_posts
  for insert with check (((creator_id = (select auth.uid())) and can_post()));

-- Edit / delete your own; admins can delete any (moderation).
create policy "collab: update own" on public.collab_posts
  for update using ((creator_id = (select auth.uid())))
  with check ((creator_id = (select auth.uid())));

create policy "collab: delete own or admin" on public.collab_posts
  for delete using (((creator_id = (select auth.uid())) or is_admin()));
