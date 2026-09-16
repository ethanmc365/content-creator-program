-- A PORTFOLIO THE CREATOR OWNS.
--
-- Ethan: "similarly to how we have the 'my rewards' page for each creator on the
-- profile drop down we should also have a 'my portfolio' page... the big
-- functionality is that they can customise and export a pdf of their own
-- portfolio... it's a way we can provide a lot of free value to the creators."
--
-- APPLIED 16 Sep 2026 as `a_portfolio_the_creator_owns`.
--
-- THERE ARE TWO SWITCHES AND THEY ARE NOT THE SAME DECISION. `is_public` puts
-- the page on the open web at a real URL where Google can index it.
-- `show_on_profile` shows it inside the community, to people who are already
-- members. Plenty of creators will want the second without the first, and
-- collapsing them into one would force that choice on everybody. Both are OFF
-- by default: this page carries a face, a city and view counts, and defaulting
-- it on would publish forty-six people who never asked.

create table if not exists public.creator_portfolios (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  is_public   boolean not null default false,
  slug        text unique check (slug is null or slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  headline    text,
  intro       text,
  about       text,
  tools       text[] not null default '{}',
  -- Platforms they post on that the platform cannot infer. Their entries
  -- already prove Instagram and TikTok; this is for the ones they have never
  -- submitted from. [{platform, handle, url, followers}]
  extra_platforms jsonb not null default '[]'::jsonb,
  -- WHICH VIDEOS, IN WHICH ORDER. Empty means "the top ones by views", which is
  -- the sensible default and the state every portfolio starts in; a non-empty
  -- array is the creator having chosen and arranged them by hand.
  picks       uuid[] not null default '{}',
  -- The editable titles and paragraphs, keyed by slot. A jsonb blob for the
  -- same reason the challenge template payload is one: the page will grow
  -- slides, and a column per slide means a migration per slide.
  copy        jsonb not null default '{}'::jsonb,
  show_on_profile boolean not null default false,
  updated_at  timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists creator_portfolios_public on public.creator_portfolios (slug) where is_public;

alter table public.creator_portfolios enable row level security;

-- YOUR OWN, ALWAYS. An admin sees everybody's, which is what lets them check a
-- creator's portfolio the way they can already open a creator's rewards page.
drop policy if exists "read portfolios" on public.creator_portfolios;
create policy "read portfolios" on public.creator_portfolios
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select public.is_admin())
    or show_on_profile
    or is_public
  );

-- ONLY YOU EDIT YOURS. Deliberately NOT extended to admins: an admin needs to
-- LOOK at a creator's portfolio to check it works, and nobody needs to be able
-- to rewrite somebody else's bio. Reading is the ask; writing was not.
drop policy if exists "own portfolio insert" on public.creator_portfolios;
create policy "own portfolio insert" on public.creator_portfolios
  for insert to authenticated with check (profile_id = (select auth.uid()));

drop policy if exists "own portfolio update" on public.creator_portfolios;
create policy "own portfolio update" on public.creator_portfolios
  for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

drop policy if exists "own portfolio delete" on public.creator_portfolios;
create policy "own portfolio delete" on public.creator_portfolios
  for delete to authenticated using (profile_id = (select auth.uid()));

revoke all on public.creator_portfolios from anon, public;
grant select, insert, update, delete on public.creator_portfolios to authenticated;

comment on table public.creator_portfolios is
  'A creator''s media kit. is_public puts it on the open web at /p/<slug>; show_on_profile is the smaller, separate decision to show it inside the community.';
