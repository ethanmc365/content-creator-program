-- 042_test_accounts.sql
-- A hidden flag for QA/test accounts so they can log in and exercise flows
-- without ever appearing "in the group" (directory, landing, counts, maps).
alter table public.profiles add column if not exists is_test boolean not null default false;

-- Landing figures exclude test accounts.
create or replace function public.landing_stats()
returns json language sql stable security definer set search_path to 'public' as $function$
  select json_build_object(
    'creators',   (select count(*) from public.profiles
                    where status = 'active' and not is_admin and deletion_requested_at is null and not is_test),
    'challenges', (select count(*) from public.challenges where status <> 'draft'),
    'prizes',     (select coalesce(sum(amount), 0) from public.rewards where status = 'distributed')
  );
$function$;

create or replace function public.featured_creators()
returns table(name text, photo_url text, bio text, countries integer)
language sql stable security definer set search_path to 'public' as $function$
  select p.name, p.photo_url, p.bio, coalesce(array_length(p.countries_visited, 1), 0)
  from public.profiles p
  where p.status = 'active' and p.photo_url is not null and not p.is_admin
    and p.deletion_requested_at is null and not p.is_test
  order by coalesce(array_length(p.countries_visited, 1), 0) desc
  limit 4;
$function$;
