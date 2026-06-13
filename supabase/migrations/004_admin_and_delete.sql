-- ============================================================================
-- 004 — auto-admin for the owner + full creator deletion
-- ============================================================================
set check_function_bodies = off;

-- The program owner's email is granted admin automatically on signup.
-- Change this if you transfer ownership.
-- (Other admins are still promoted from Admin → Creators.)

-- ----------------------------------------------------------------------------
-- 1. New-user trigger: keep referral handling AND auto-admin the owner email.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ref_code text;
  v_referrer uuid;
  v_is_admin boolean;
begin
  v_ref_code := new.raw_user_meta_data ->> 'ref';
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = upper(v_ref_code);
  end if;

  -- Owner email is admin from the very first login.
  v_is_admin := lower(new.email) = 'ethanmc365@gmail.com';

  insert into public.profiles (id, name, referral_code, referred_by, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    upper(right(replace(new.id::text, '-', ''), 8)),
    v_referrer,
    v_is_admin
  );
  return new;
end;
$$;

-- If that account already exists, make sure it's an admin right now too.
update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id and lower(u.email) = 'ethanmc365@gmail.com';

-- ----------------------------------------------------------------------------
-- 2. admin_delete_creator(uuid)
-- ----------------------------------------------------------------------------
-- Fully removes a creator: deleting their auth.users row cascades to their
-- profile and (via on-delete-cascade FKs) all their submissions, messages,
-- DMs, rewards, photos, etc. Admins only; an admin cannot delete themselves.
create or replace function public.admin_delete_creator(target uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot delete your own account here';
  end if;
  delete from auth.users where id = target;
end;
$$;

revoke all on function public.admin_delete_creator(uuid) from public, anon;
grant execute on function public.admin_delete_creator(uuid) to authenticated;
