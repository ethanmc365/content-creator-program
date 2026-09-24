-- 261: THE HOOK BANK (24 Sep 2026)
--
-- Ethan: "a button that should show up on every challenge... Whenever you click
-- it, it should just pop up with a hook... I only want you to take the ones
-- that are in English and ensure they're all structured correctly... It should
-- randomly show one, but filtered by the best-performing ones first. Don't
-- actually give me any information on how many times it's been used... There
-- should be a new admin page called Hooks where I can add in other hooks or
-- just see all the hooks that are in."
--
-- The rows come from the team's "Best videos of the team" decks (the tryp-hooks
-- bank: 1,723 hooks, Jul 2025 - Jul 2026), cleaned to 1,516 English hooks -
-- internal deck notes removed, glued words split, stray quotes fixed - in
-- supabase/seeds/hooks_bank.sql.
--
--   family   the formula the hook belongs to (admin grouping only; the
--            creator's button never shows it)
--   uses     how many times the hook or a near-identical variant was posted
--            across markets and months. It is the ORDER the button deals in
--            (best first) and is never shown to a creator.
--   source   'bank' for the import, 'team' for anything added from the admin
--            page.

create table if not exists public.hooks (
  id uuid primary key default gen_random_uuid(),
  text text not null check (length(btrim(text)) between 3 and 400),
  family text not null default 'More ideas',
  uses int not null default 1 check (uses >= 0),
  language text not null default 'en',
  is_active boolean not null default true,
  source text not null default 'team' check (source in ('bank', 'team')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hooks_text_key on public.hooks (lower(btrim(text)));
create index if not exists hooks_active_uses_idx on public.hooks (uses desc) where is_active;

alter table public.hooks enable row level security;

drop policy if exists "hooks: members read the active ones" on public.hooks;
create policy "hooks: members read the active ones" on public.hooks
  for select to authenticated
  using ((is_active and public.is_member()) or public.is_admin());

drop policy if exists "hooks: admins add" on public.hooks;
create policy "hooks: admins add" on public.hooks
  for insert to authenticated with check (public.is_admin());

drop policy if exists "hooks: admins change" on public.hooks;
create policy "hooks: admins change" on public.hooks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "hooks: admins remove" on public.hooks;
create policy "hooks: admins remove" on public.hooks
  for delete to authenticated using (public.is_admin());

create or replace function public.hooks_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists hooks_touch on public.hooks;
create trigger hooks_touch before update on public.hooks
  for each row execute function public.hooks_touch();

drop trigger if exists trg_audit_hooks on public.hooks;
create trigger trg_audit_hooks after insert or delete on public.hooks
  for each row execute function public.audit_change('content', 'hook', 'text');
drop trigger if exists trg_audit_hooks_upd on public.hooks;
create trigger trg_audit_hooks_upd after update on public.hooks
  for each row execute function public.audit_change('content', 'hook', 'text', 'text', 'family', 'is_active');
