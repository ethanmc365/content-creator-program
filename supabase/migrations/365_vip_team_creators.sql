-- 365 (8 Oct 2026): TRYP.COM TEAM CREATORS INSIDE A VIP COMMUNITY.
--
-- Ethan: "for the VIP community, mark a few creators as the team and have a separate view for them on the VIP tools.
-- Marking them as the team means they are in the team as an official creator, but what they're not getting is admin
-- access to the entire platform." So it is a LABEL ON THE MEMBERSHIP, nothing more: a team creator is still a VIP
-- member (paid, fenced and closed exactly like the others) and gains no role, no is_admin and no VIP tools access.
-- The tools show them, and count their views, in a section of their own.
--
-- And "it's not showing correctly who's in the team ... I don't even see Marta": the staff who RUN a VIP community
-- (vip_managers) were only readable by the owner, so every list built for anybody else could not name them.
-- vip_team_people() lists them, with the team creators, to anybody who has VIP access.

alter table public.vip_members add column if not exists is_team boolean not null default false;
comment on column public.vip_members.is_team is 'A Tryp.com team creator: an official in-house creator in this VIP community. A label only - no admin rights, no VIP tools access.';

create or replace function public.vip_set_team(p_profile uuid, p_programme uuid, p_team boolean)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.vip_can_manage(p_programme) then
    raise exception 'Only the team running this VIP community can change that.';
  end if;
  update public.vip_members set is_team = coalesce(p_team, false)
   where profile_id = p_profile and programme_id = p_programme;
  if not found then raise exception 'They are not a member of this VIP community.'; end if;
  return coalesce(p_team, false);
end;
$function$;
revoke all on function public.vip_set_team(uuid, uuid, boolean) from public, anon;
grant execute on function public.vip_set_team(uuid, uuid, boolean) to authenticated;

-- Everybody on the team side of every VIP community the caller can see: the staff with access (kind 'staff') and
-- the members marked as team creators (kind 'creator'). One row per person per community.
create or replace function public.vip_team_people()
returns table (profile_id uuid, programme_id uuid, programme text, kind text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.profile_id, m.programme_id, p.name, 'staff'::text
    from public.vip_managers m
    join public.vip_programmes p on p.id = m.programme_id
   where public.vip_has_access()
  union all
  select v.profile_id, v.programme_id, p.name, 'creator'::text
    from public.vip_members v
    join public.vip_programmes p on p.id = v.programme_id
   where v.is_team and v.status <> 'left' and public.vip_has_access()
$function$;
revoke all on function public.vip_team_people() from public, anon;
grant execute on function public.vip_team_people() to authenticated;
