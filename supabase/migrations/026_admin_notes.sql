-- ============================================================================
-- 026 - private admin notes on creators
--   Stored in their own table (NOT a column on profiles, which members can
--   read) so notes are only ever visible to admins. RLS: admins only, full stop.
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.creator_admin_notes (
  creator_id uuid primary key references public.profiles (id) on delete cascade,
  note       text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.creator_admin_notes enable row level security;

drop policy if exists "admin notes: admins only" on public.creator_admin_notes;
create policy "admin notes: admins only" on public.creator_admin_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
