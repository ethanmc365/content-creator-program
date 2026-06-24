-- ============================================================================
-- 022 - self-service account deletion with a 30-day grace period (GDPR erasure)
--   A creator can request deletion themselves: we stamp deletion_requested_at,
--   hide them from the community immediately, and lock them out (the app shows a
--   "scheduled for deletion / restore" screen). Within 30 days either the
--   creator (on login) or an admin can restore by clearing the stamp. A daily
--   cron job permanently purges anything past 30 days.
-- ============================================================================
set check_function_bodies = off;

alter table public.profiles add column if not exists deletion_requested_at timestamptz;

-- Hide creators who are scheduled for deletion from public teasers + counts.
create or replace function public.featured_creators()
returns table(name text, photo_url text, bio text, countries integer)
language sql stable security definer set search_path to 'public'
as $$
  select p.name, p.photo_url, p.bio, coalesce(array_length(p.countries_visited, 1), 0)
  from public.profiles p
  where p.status = 'active' and p.photo_url is not null and not p.is_admin
    and p.deletion_requested_at is null
  order by coalesce(array_length(p.countries_visited, 1), 0) desc
  limit 4;
$$;
grant execute on function public.featured_creators() to anon, authenticated;

create or replace function public.landing_stats()
returns json language sql stable security definer set search_path to 'public'
as $$
  select json_build_object(
    'creators',   (select count(*) from public.profiles
                    where status = 'active' and not is_admin and deletion_requested_at is null),
    'challenges', (select count(*) from public.challenges where status <> 'draft'),
    'prizes',     (select coalesce(sum(amount), 0) from public.rewards where status = 'distributed')
  );
$$;
grant execute on function public.landing_stats() to anon, authenticated;

-- Permanently remove accounts whose 30-day grace has elapsed. Runs from cron
-- (as the owner), so it does NOT use the admin-only check. Not part of the API.
create or replace function public.purge_deleted_creators()
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare n integer;
begin
  with gone as (
    delete from auth.users
    where id in (
      select id from public.profiles
      where deletion_requested_at is not null
        and deletion_requested_at < now() - interval '30 days'
    )
    returning 1
  )
  select count(*) into n from gone;
  return n;
end;
$$;
revoke execute on function public.purge_deleted_creators() from public, anon, authenticated;

-- Daily purge at 03:00 UTC (idempotent re-schedule).
do $$ begin
  perform cron.unschedule('purge-deleted-creators');
exception when others then null; end $$;
select cron.schedule('purge-deleted-creators', '0 3 * * *', $$select public.purge_deleted_creators()$$);
