-- 354: the team link puts you on the team (7 Oct 2026). Ethan approved both changes in chat.
--
-- 1. APPROVING SOMEBODY ONTO THE TEAM NEVER PUT THEM ON THE TEAM. approve_team_member set profiles.is_admin and
--    nothing else, but the Team page (team_roster), is_global_admin() and every "every market" check read
--    platform_role. Francesco (Head of Growth) signed up on the team link on 7 Oct, was approved, and had admin powers
--    without appearing anywhere on the Team page. Approval now makes a person a global admin: the worldwide team and
--    every market.
-- 2. NO APPROVAL STEP AT ALL FOR THE TEAM LINK. Ethan: "anyone that signs up with team link should automatically be in
--    the team." Finishing the profile with a claimed team invite (team_invite_id set) approves them onto the team in
--    the same update. The link itself is the credential, so keep it private and revoke it (Admin > Team) when it has
--    done its job.

create or replace function public.approve_team_member(p_profile uuid, p_role_title text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_global_admin() then
    raise exception 'Only a platform admin can approve somebody onto the team.';
  end if;
  update public.profiles
     set is_admin = true,
         platform_role = case when platform_role = 'owner' then platform_role else 'global_admin' end,
         status = 'active',
         role_title = coalesce(nullif(trim(coalesce(p_role_title, '')), ''), role_title, requested_role_title),
         team_application = false
   where id = p_profile;
end;
$function$;

create or replace function public.team_link_auto_join()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.team_invite_id is not null and new.onboarded and not coalesce(old.onboarded, false)
     and coalesce(new.platform_role, 'none') <> 'owner' then
    new.is_admin := true;
    new.platform_role := 'global_admin';
    new.status := 'active';
    new.team_application := false;
    new.accepted_at := coalesce(new.accepted_at, now());
    new.role_title := coalesce(new.role_title, new.requested_role_title);
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_team_link_auto_join on public.profiles;
create trigger trg_team_link_auto_join before update of onboarded on public.profiles
  for each row execute function public.team_link_auto_join();
revoke execute on function public.team_link_auto_join() from public, anon, authenticated;

-- Everybody approved through the old function (only Francesco).
update public.profiles set platform_role = 'global_admin'
 where is_admin and platform_role = 'none';
