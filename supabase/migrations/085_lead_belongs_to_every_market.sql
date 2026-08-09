-- The programme lead is in every market, and stays in every market.
--
-- Not a vanity membership. Membership is what the rooms sidebar, the standings
-- and "your places" all read, so a lead who is only in the UK cannot reach the
-- Spanish General from the Spanish room list and sees an empty "your other
-- rooms" card on the page built to show them.
--
-- Safe for the creator-facing numbers: every member count on the platform is
-- filtered with `profiles.is_admin = false`, so this adds nobody to any roster
-- a creator sees. There is no trigger on community_members, so it notifies
-- nobody either.

insert into public.community_members (community_id, profile_id, role, is_home, status)
select c.id, p.id, 'manager', false, 'active'
from public.communities c
cross join public.profiles p
where c.kind = 'chapter' and p.platform_role = 'owner'
on conflict (community_id, profile_id) do update
  set role = 'manager', status = 'active';

create or replace function public.add_lead_to_new_market()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'chapter' then return new; end if;
  insert into public.community_members (community_id, profile_id, role, is_home, status)
  select new.id, p.id, 'manager', false, 'active'
  from public.profiles p where p.platform_role = 'owner'
  on conflict (community_id, profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_lead_to_new_market on public.communities;
create trigger trg_add_lead_to_new_market
  after insert on public.communities
  for each row execute function public.add_lead_to_new_market();
