-- 319 (3 Oct 2026): moving a VIP back to the community asks WHERE. Ethan: "pressing that, it should show up which place to
-- actually move them in like worldwide, Spain, etc. and show the suggested one." p_community null = Worldwide only (they
-- keep whatever markets they were already in); a market makes it their home market, joining it if they were not in it.
create or replace function public.vip_move_back(p_profile uuid, p_community uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare m public.vip_members;
begin
  select * into m from public.vip_members where profile_id = p_profile;
  if m is null then raise exception 'That creator is not a VIP.'; end if;
  if not public.vip_can_manage(m.programme_id) then raise exception 'Only the market lead or the team can do this.'; end if;
  perform public.vip_update_member(p_profile => p_profile, p_status => 'left');
  if p_community is not null then
    if not exists (select 1 from public.communities where id = p_community and kind = 'chapter') then raise exception 'No such market.'; end if;
    update public.community_members set is_home = false where profile_id = p_profile and community_id <> p_community and is_home;
    insert into public.community_members (community_id, profile_id, role, is_home, status)
    values (p_community, p_profile, 'creator', true, 'active')
    on conflict (community_id, profile_id) do update set status = 'active', is_home = true;
  end if;
end $function$;
