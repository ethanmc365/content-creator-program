-- Approval queue: broadcast emails wait here for an admin to review, edit,
-- approve or decline BEFORE they reach every creator. Push still goes instantly.
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  subject text not null,
  body text not null,
  cta_label text,
  cta_path text not null default '/home',
  status text not null default 'pending' check (status in ('pending','sent','declined')),
  recipient_count int,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null
);

alter table public.email_outbox enable row level security;
create policy "email_outbox: admin read" on public.email_outbox for select using (public.is_admin());
create policy "email_outbox: admin update" on public.email_outbox for update using (public.is_admin()) with check (public.is_admin());
create policy "email_outbox: admin delete" on public.email_outbox for delete using (public.is_admin());

-- notify_all fires one notification per recipient; this makes the first enqueue
-- win and the rest no-op.
create unique index if not exists email_outbox_pending_unique
  on public.email_outbox (type, subject, cta_path) where status = 'pending';
create index if not exists email_outbox_status_idx on public.email_outbox(status, created_at desc);

-- Templates are always applied now, with defaults that greet by first name.
alter table public.email_templates add column if not exists auto_send boolean not null default false;
alter table public.email_templates alter column subject set default '{{title}}';
alter table public.email_templates alter column body set default 'Hi {{name}},' || chr(10) || chr(10) || '{{body}}';
