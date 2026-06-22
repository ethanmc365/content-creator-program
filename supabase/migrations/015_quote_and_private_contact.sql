-- ============================================================================
-- 015 - favourite quote (public) + private contact details (admin-only)
--   * favourite_quote shows on the public profile.
--   * Phone number is sensitive: it lives in its own table so other creators
--     can never read it via the API. Only the owner and admins can.
--   * admin_get_email lets an admin see one creator's login email (which lives
--     in auth.users, not profiles) on that creator's profile page.
-- ============================================================================
set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- Favourite quote: public, shown on the profile next to the bio.
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists favourite_quote text default '';

-- ----------------------------------------------------------------------------
-- Private contact details. Kept OUT of public.profiles (which every signed-in
-- user can read) so a creator's phone number is only ever visible to the
-- creator themselves and to admins. phone_country holds the dial code ("+44").
-- ----------------------------------------------------------------------------
create table if not exists public.creator_private (
  id            uuid primary key references public.profiles (id) on delete cascade,
  phone         text not null default '',
  phone_country text not null default '',
  updated_at    timestamptz not null default now()
);

alter table public.creator_private enable row level security;

-- Read: only the owner or an admin.
drop policy if exists "creator_private: read own or admin" on public.creator_private;
create policy "creator_private: read own or admin"
  on public.creator_private for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Insert: only your own row.
drop policy if exists "creator_private: insert own" on public.creator_private;
create policy "creator_private: insert own"
  on public.creator_private for insert to authenticated
  with check (id = auth.uid());

-- Update: only your own row.
drop policy if exists "creator_private: update own" on public.creator_private;
create policy "creator_private: update own"
  on public.creator_private for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- Admin-only: look up a single creator's login email (in auth.users).
-- Mirrors admin_list_emails() but scoped to one id, for the profile page.
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_email(target uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare e text;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  select u.email::text into e from auth.users u where u.id = target;
  return e;
end;
$$;

grant execute on function public.admin_get_email(uuid) to authenticated;
