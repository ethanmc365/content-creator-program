-- ============================================================================
-- 021 - landing stats should only count real, approved creators
--   Previously the "creators" stat counted every profile that wasn't suspended,
--   which included pending and half-finished signups (inflating the number,
--   e.g. "19+"). Count only active, non-admin members - people who were
--   approved and actually joined the community.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.landing_stats()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object(
    'creators',   (select count(*) from public.profiles where status = 'active' and not is_admin),
    'challenges', (select count(*) from public.challenges where status <> 'draft'),
    'prizes',     (select coalesce(sum(amount), 0) from public.rewards where status = 'distributed')
  );
$$;

-- CREATE OR REPLACE preserves grants, but make the public-landing access explicit.
grant execute on function public.landing_stats() to anon, authenticated;
