-- Applied to production 21 Aug 2026. Kept here so the schema history is in the
-- repo rather than only in Supabase.
--
-- NOTE: 106 added `connections.note`, and 107 REMOVES it again. The reasoning
-- was wrong and the correction is documented there; read them together.

create table if not exists public.creator_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.profiles(id) on delete cascade,
  reported_id   uuid not null references public.profiles(id) on delete cascade,
  reason        text not null,
  details       text,
  status        text not null default 'new'
                check (status in ('new','reviewing','actioned','dismissed')),
  admin_note    text,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint creator_reports_not_self check (reporter_id <> reported_id)
);

-- One OPEN report per pair, so pressing the button twice does not file two
-- identical cases. Closed reports are deliberately not covered, so somebody who
-- reoffends can be reported again.
create unique index if not exists creator_reports_one_open
  on public.creator_reports (reporter_id, reported_id)
  where status in ('new','reviewing');

create index if not exists creator_reports_queue
  on public.creator_reports (status, created_at desc);

alter table public.creator_reports enable row level security;

create policy "creator_reports: file your own" on public.creator_reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "creator_reports: admins read" on public.creator_reports
  for select to authenticated using (public.is_admin());
create policy "creator_reports: admins update" on public.creator_reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
