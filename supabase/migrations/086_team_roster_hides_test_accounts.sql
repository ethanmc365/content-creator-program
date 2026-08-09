-- The QA account is not on the team. `team_roster()` filtered on status but not
-- on is_test, so the hidden QA admin appeared beside real people. Every other
-- roster on the platform excludes test accounts; this was the one that forgot.
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
    and coalesce(p.is_test, false) = false
    and (p.platform_role in ('global_admin', 'owner') or m.profile_id is not null)
  group by p.id
  order by case p.platform_role when 'owner' then 0 when 'global_admin' then 1 else 2 end, p.name;
$$;

revoke all on function public.team_roster() from public, anon;
grant execute on function public.team_roster() to authenticated;
