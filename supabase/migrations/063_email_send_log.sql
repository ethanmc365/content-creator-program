-- Per-message delivery log so the admin UI can show real send volume against the
-- provider's daily cap (Gmail ~500 recipients/day), plus monthly and all-time.
-- One row per RECIPIENT, because that is the unit the provider counts.
create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('broadcast','notification','invoice','auth')),
  recipient_id uuid references public.profiles(id) on delete set null,
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  subject text,
  status text not null default 'sent' check (status in ('sent','failed')),
  error text,
  created_at timestamptz not null default now()
);

alter table public.email_send_log enable row level security;

create policy "email_send_log: admin read" on public.email_send_log
  for select using (public.is_admin());

create index if not exists email_send_log_created_idx on public.email_send_log(created_at desc);
create index if not exists email_send_log_kind_idx on public.email_send_log(kind);

create or replace function public.email_usage()
returns table(
  sent_today bigint, sent_month bigint, sent_total bigint,
  failed_today bigint, daily_limit int
)
language sql security definer set search_path = public
as $$
  select
    count(*) filter (where created_at >= date_trunc('day', now()) and status = 'sent'),
    count(*) filter (where created_at >= date_trunc('month', now()) and status = 'sent'),
    count(*) filter (where status = 'sent'),
    count(*) filter (where created_at >= date_trunc('day', now()) and status = 'failed'),
    500
  from public.email_send_log
  where public.is_admin();
$$;

revoke execute on function public.email_usage() from public, anon;
grant execute on function public.email_usage() to authenticated;
