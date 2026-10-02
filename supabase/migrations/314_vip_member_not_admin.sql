-- 314: an admin is never added to a VIP programme as a creator (2 Oct 2026). Ethan: the profile popup "shows that I can
-- promote them to join the VIP community as a creator which is obviously wrong." The popup no longer offers it; this is
-- the half that holds whatever the client does. Team members get VIP ACCESS instead (vip_add_manager, team page).
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.vip_add_member(uuid,uuid,numeric,numeric,integer,bigint,text)'::regprocedure) into d;
  n := replace(d,
$a$  if v_name is null then raise exception 'No such creator.'; end if;$a$,
$b$  if v_name is null then raise exception 'No such creator.'; end if;
  if exists (select 1 from public.profiles where id = p_profile and (is_admin or platform_role in ('owner', 'global_admin'))) then
    raise exception 'That person is on the Tryp.com team. Give them VIP access from the team page instead of making them a VIP creator.';
  end if;$b$);
  assert n <> d, 'vip_add_member: anchor not found';
  execute n;
end $$;
