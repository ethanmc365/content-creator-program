-- Admin Notes: a private, Notion-lite notes space for the Tryp.com Team (e.g. a
-- bank of "Weekly questions" for the community chat). Admin-only via RLS.
create table if not exists public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled',
  emoji text,
  body text not null default '',
  sort_order double precision not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_notes enable row level security;

drop policy if exists "admin_notes: admin all" on public.admin_notes;
create policy "admin_notes: admin all" on public.admin_notes
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_admin_notes_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_admin_notes_updated on public.admin_notes;
create trigger trg_admin_notes_updated before update on public.admin_notes
  for each row execute function public.touch_admin_notes_updated_at();
