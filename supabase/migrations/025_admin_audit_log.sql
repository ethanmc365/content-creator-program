-- ============================================================================
-- 025 - admin audit log
--   Records account-affecting admin actions (approve, decline/delete, mute,
--   suspend, reactivate, promote/demote admin, restore) for accountability.
--   Rows are tiny (~200 bytes) so storage impact is negligible. Admins read;
--   only SECURITY DEFINER triggers/functions write (no API write policy).
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text,
  action      text not null,
  target_id   uuid,            -- no FK: keep the record even after the target is deleted
  target_name text,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_created on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists "audit: admin read" on public.admin_audit_log;
create policy "audit: admin read" on public.admin_audit_log for select to authenticated
  using (public.is_admin());

-- Log when an admin changes another creator's status / admin flag / deletion.
create or replace function public.log_admin_profile_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_action text;
begin
  if v_actor is null or v_actor = new.id or not public.is_admin() then
    return new;
  end if;
  if new.status is distinct from old.status then
    v_action := case
      when new.status = 'active' and old.status = 'pending' then 'Approved creator'
      when new.status = 'muted' then 'Muted creator'
      when new.status = 'suspended' then 'Suspended creator'
      when new.status = 'active' then 'Reactivated creator'
      else 'Changed status to ' || new.status end;
  elsif new.is_admin is distinct from old.is_admin then
    v_action := case when new.is_admin then 'Promoted to admin' else 'Removed admin rights' end;
  elsif (new.deletion_requested_at is null) is distinct from (old.deletion_requested_at is null) then
    v_action := case when new.deletion_requested_at is null then 'Restored account' else 'Scheduled deletion' end;
  else
    return new;
  end if;
  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  values (v_actor, (select name from public.profiles where id = v_actor), v_action, new.id, new.name);
  return new;
end; $$;
drop trigger if exists trg_log_admin_profile_change on public.profiles;
create trigger trg_log_admin_profile_change after update on public.profiles
  for each row execute function public.log_admin_profile_change();

-- Log permanent deletions (record the name before the row disappears).
create or replace function public.admin_delete_creator(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if target = auth.uid() then raise exception 'You cannot delete your own account here'; end if;
  insert into public.admin_audit_log (actor_id, actor_name, action, target_id, target_name)
  select auth.uid(), (select name from public.profiles where id = auth.uid()),
         'Deleted creator', target, (select name from public.profiles where id = target);
  delete from auth.users where id = target;
end; $$;

revoke execute on function public.log_admin_profile_change() from public, anon, authenticated;
revoke execute on function public.admin_delete_creator(uuid) from public, anon;
grant execute on function public.admin_delete_creator(uuid) to authenticated;
