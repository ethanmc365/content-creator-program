-- Roles for the Tryp.com team.
--
-- THREE LEVELS, and only three.
--
--   owner        exactly one person. Runs the programme. Cannot be demoted,
--                deleted or stripped of admin by anybody but themselves, and
--                the only thing they CAN do to the role is hand it on.
--   global_admin the rest of the Tryp.com team. Everything the owner can do
--                except touch the owner.
--   none         a creator.
--
-- A TITLE IS NOT A PERMISSION. `role_title` is free text ("Spain Country
-- Manager", "Spanish Lead") and is display only. Keeping it separate from
-- platform_role is what lets the team be named however the programme grows
-- without every new label needing a policy written for it.

alter table public.profiles add column if not exists role_title text;

comment on column public.profiles.role_title is
  'Display-only job title for Tryp.com team members. Never grants permission.';

do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%platform_role%';
  if v_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_name);
  end if;
end $$;

alter table public.profiles
  add constraint profiles_platform_role_check
  check (platform_role in ('none', 'global_admin', 'owner'));

-- Exactly one owner, enforced by the database rather than by remembering.
create unique index if not exists profiles_one_owner
  on public.profiles ((platform_role)) where platform_role = 'owner';

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select platform_role = 'owner' from public.profiles where id = auth.uid()), false);
$$;

-- The owner is a global admin too, so every policy already written against
-- is_global_admin() keeps working unchanged.
create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select platform_role in ('global_admin', 'owner') from public.profiles where id = auth.uid()),
    false);
$$;

-- --------------------------------------------------------------- protection
create or replace function public.protect_admin_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if not public.is_admin() then
      if new.is_admin is distinct from old.is_admin
         or new.status is distinct from old.status then
        raise exception 'Only admins can change admin or status flags';
      end if;
    end if;

    if old.platform_role = 'owner' and auth.uid() <> old.id then
      if new.platform_role is distinct from old.platform_role
         or new.role_title is distinct from old.role_title
         or new.is_admin is distinct from old.is_admin
         or new.status is distinct from old.status then
        raise exception 'The programme lead cannot be changed by anyone else';
      end if;
    end if;

    if new.platform_role is distinct from old.platform_role and not public.is_owner() then
      raise exception 'Only the programme lead can change platform roles';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_owner_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.platform_role = 'owner' and coalesce(auth.uid(), old.id) <> old.id then
    raise exception 'The programme lead cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_owner_delete on public.profiles;
create trigger trg_protect_owner_delete
  before delete on public.profiles
  for each row execute function public.protect_owner_delete();

create or replace function public.admin_set_admin(target uuid, make_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if target = auth.uid() then raise exception 'You cannot change your own admin status'; end if;
  if (select platform_role from public.profiles where id = target) = 'owner' then
    raise exception 'The programme lead cannot be removed as an admin';
  end if;
  update public.profiles set is_admin = make_admin where id = target;
  if not found then raise exception 'Creator not found'; end if;
end;
$$;

create or replace function public.admin_delete_creator(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if target = auth.uid() then raise exception 'You cannot delete your own account here'; end if;
  if (select platform_role from public.profiles where id = target) = 'owner' then
    raise exception 'The programme lead cannot be deleted';
  end if;
  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  select auth.uid(), (select name from public.profiles where id = auth.uid()),
         'Deleted creator', target, (select name from public.profiles where id = target);
  delete from auth.users where id = target;
end;
$$;

-- ------------------------------------------------------------ managing them
create or replace function public.set_team_member(
  target uuid, p_admin boolean default null,
  p_title text default null, p_clear_title boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_target_role text;
begin
  if not public.is_global_admin() then
    raise exception 'Only the Tryp.com team can do this';
  end if;

  select platform_role into v_target_role from public.profiles where id = target;
  if v_target_role is null then raise exception 'No such person'; end if;
  if v_target_role = 'owner' and target <> auth.uid() then
    raise exception 'The programme lead cannot be changed by anyone else';
  end if;

  update public.profiles set
    is_admin   = coalesce(p_admin, is_admin),
    role_title = case
                   when p_clear_title then null
                   when p_title is not null then nullif(btrim(p_title), '')
                   else role_title end,
    platform_role = case
      when v_target_role = 'owner' then platform_role
      when p_admin is true  then 'global_admin'
      when p_admin is false then 'none'
      else platform_role end
  where id = target;

  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  select auth.uid(), (select name from public.profiles where id = auth.uid()),
         case when p_admin is true  then 'Promoted to Tryp.com team'
              when p_admin is false then 'Removed from Tryp.com team'
              else 'Changed role title' end,
         target, (select name from public.profiles where id = target);
end;
$$;

create or replace function public.transfer_ownership(target uuid, p_new_title text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if not public.is_owner() then
    raise exception 'Only the programme lead can hand the programme on';
  end if;
  if target = v_me then raise exception 'You already lead the programme'; end if;
  if not exists (select 1 from public.profiles where id = target and status = 'active') then
    raise exception 'That person is not an active creator';
  end if;

  update public.profiles set platform_role = 'global_admin' where id = v_me;
  update public.profiles set
    platform_role = 'owner', is_admin = true,
    role_title = coalesce(nullif(btrim(p_new_title), ''), 'Tryp.com CCC Lead')
  where id = target;

  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  select v_me, (select name from public.profiles where id = v_me),
         'Handed over the programme lead', target,
         (select name from public.profiles where id = target);
end;
$$;

revoke all on function public.set_team_member(uuid, boolean, text, boolean) from public, anon;
revoke all on function public.transfer_ownership(uuid, text) from public, anon;
grant execute on function public.set_team_member(uuid, boolean, text, boolean) to authenticated;
grant execute on function public.transfer_ownership(uuid, text) to authenticated;
grant execute on function public.is_owner() to authenticated, anon;

create or replace function public.team_roster()
returns table (
  id uuid, name text, photo_url text, platform_role text, role_title text,
  is_admin boolean, country_code text, last_seen_at timestamptz,
  markets text[], market_slugs text[])
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.photo_url, p.platform_role, p.role_title,
         p.is_admin, p.country_code::text, p.last_seen_at,
         coalesce(array_agg(c.name order by c.name) filter (where c.id is not null), '{}'),
         coalesce(array_agg(c.slug order by c.name) filter (where c.id is not null), '{}')
  from public.profiles p
  left join public.community_members m
    on m.profile_id = p.id and m.role = 'manager' and m.status = 'active'
  left join public.communities c on c.id = m.community_id
  where p.status = 'active'
    and (p.platform_role in ('global_admin', 'owner') or m.profile_id is not null)
  group by p.id
  order by case p.platform_role when 'owner' then 0 when 'global_admin' then 1 else 2 end, p.name;
$$;

revoke all on function public.team_roster() from public, anon;
grant execute on function public.team_roster() to authenticated;

update public.profiles
set platform_role = 'owner', role_title = 'Tryp.com Content Creator Community Lead'
where id = (select id from public.profiles
            where platform_role = 'global_admin' and is_test = false
            order by created_at asc limit 1);
