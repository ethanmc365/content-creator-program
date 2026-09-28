-- THE CERTIFICATE RESET, AND A WAY BACK FROM IT (28 Sep 2026).
--
-- Ethan: "I give you permission to do what I said, delete all the previous
-- certificates so I can set it up properly", and "ensure certificates are live
-- but creators shouldn't receive any yet ... only the ones I create and share
-- from now on should be seen by them."
--
-- Migration 273 exists because a trigger hard-deleted three of a creator's
-- entries and left no evidence, so when the question "were they really
-- duplicates" was asked the answer could not be produced. The same rule applies
-- here: a delete against live data is archived first, and archived IN THE
-- DATABASE rather than exported to a file, because these rows carry creators'
-- names and results and those do not belong in a repository.
--
-- WHAT THIS REMOVED on production: four designs seeded on 16 Sep, and three
-- awards generated for the top three of the UK "Tryp.com Creative Challenge".
-- None of the three had ever been opened - every one had `seen_at = null` - and
-- `certificates_live` was false throughout, so no creator could reach them at
-- all. Nobody lost a certificate they had seen.
--
-- `certificates_live` was flipped to true separately, once this had run, so the
-- feature went live against an empty slate.

create table if not exists public.certificate_designs_archive (
  like public.certificate_designs including defaults,
  archived_at timestamptz not null default now(),
  archived_reason text
);

create table if not exists public.certificate_awards_archive (
  like public.certificate_awards including defaults,
  archived_at timestamptz not null default now(),
  archived_reason text
);

alter table public.certificate_designs_archive enable row level security;
alter table public.certificate_awards_archive enable row level security;

-- Admins only. These hold creators' names and results, so they are not readable
-- by the creators' own policies the way the live tables are.
drop policy if exists "admins read archived designs" on public.certificate_designs_archive;
create policy "admins read archived designs" on public.certificate_designs_archive
  for select using (public.is_admin());

drop policy if exists "admins read archived awards" on public.certificate_awards_archive;
create policy "admins read archived awards" on public.certificate_awards_archive
  for select using (public.is_admin());

insert into public.certificate_designs_archive
  select d.*, now(), 'Reset before go-live, 28 Sep 2026 (Ethan)'
  from public.certificate_designs d;

insert into public.certificate_awards_archive
  select a.*, now(), 'Reset before go-live, 28 Sep 2026 (Ethan)'
  from public.certificate_awards a;

delete from public.certificate_awards;
delete from public.certificate_designs;
