-- 049: automated prize invoices.
-- Creators store private payout details (GBP or EUR); admins generate and
-- email a branded invoice when a creator wins a cash prize.

-- ---- Payment details live in creator_private (owner + admin read, owner write) ----
alter table public.creator_private add column if not exists pay_currency text check (pay_currency in ('GBP','EUR'));
alter table public.creator_private add column if not exists pay_name text;            -- account holder / legal name
alter table public.creator_private add column if not exists pay_bank text;            -- bank name
alter table public.creator_private add column if not exists pay_sort_code text;       -- GBP: 6-digit sort code
alter table public.creator_private add column if not exists pay_account_number text;  -- GBP: 8-digit account number
alter table public.creator_private add column if not exists pay_iban text;            -- EUR: IBAN
alter table public.creator_private add column if not exists pay_bic text;             -- EUR: BIC / SWIFT
alter table public.creator_private add column if not exists pay_address text;         -- billing address shown on the invoice

-- ---- Invoice history ----
create sequence if not exists public.invoice_number_seq;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number int not null unique,
  creator_id uuid references public.profiles(id) on delete set null,
  creator_name text not null,
  amount numeric(10,2) not null,
  currency text not null check (currency in ('GBP','EUR')),
  description text not null,
  issue_date date not null default current_date,
  bill_to text not null default '',
  payment jsonb not null default '{}'::jsonb,  -- snapshot of the bank details used
  notes text,
  sent_to text,
  cc text,
  status text not null default 'sent',
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists invoices_creator_id_idx on public.invoices (creator_id);

alter table public.invoices enable row level security;

drop policy if exists "invoices: admin all" on public.invoices;
create policy "invoices: admin all" on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invoices: own read" on public.invoices;
create policy "invoices: own read" on public.invoices
  for select using (creator_id = (select auth.uid()));

-- ---- Admin-editable app settings (e.g. the company block shown on invoices) ----
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "app_settings: admin all" on public.app_settings;
create policy "app_settings: admin all" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- Sequential invoice numbers (admin-only) ----
create or replace function public.next_invoice_number()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return nextval('public.invoice_number_seq');
end;
$$;

revoke execute on function public.next_invoice_number() from public, anon;
grant execute on function public.next_invoice_number() to authenticated;
