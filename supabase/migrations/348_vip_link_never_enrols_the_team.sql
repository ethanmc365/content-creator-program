-- 348: a VIP link never enrols the team.
--
-- Opening a VIP invite while signed in saved its token on the device, and the
-- next visit to /onboarding (the team link goes there) spent it on whoever was
-- signed in. Ethan became a "VIP Worldwide" creator on 7 Oct 2026 at 09:37 and
-- the VIP page stopped showing him the tools and the other markets, because a
-- VIP member is shown their own creator page. The client no longer keeps the
-- token for a signed-in visitor; this is the server half: admins and people
-- with VIP access are never made VIP members by a link.
create or replace function public.vip_claim_blocked()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select is_admin or platform_role in ('owner', 'global_admin')
                     from public.profiles where id = auth.uid()), false)
      or exists (select 1 from public.vip_managers where profile_id = auth.uid())
$$;

-- claim_vip_invite: the live body (pg_get_functiondef, 7 Oct) with one guard
-- added after the session check.
create or replace function public.claim_vip_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare i public.vip_invites; v_prog uuid; v_comm uuid; v_auto boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if public.vip_claim_blocked() then return false; end if;
  if exists (select 1 from public.vip_members where profile_id = auth.uid() and status = 'active') then return true; end if;
  select * into i from public.vip_invites where token = p_token;
  if i.id is null then return false; end if;
  if not i.is_global and (i.revoked_at is not null or (i.expires_at is not null and i.expires_at < now())
     or (i.max_uses is not null and i.uses >= i.max_uses)) then
    return false;
  end if;
  if i.programme_id is null then
    select pr.id into v_prog from public.community_members cm
      join public.communities cc on cc.id = cm.community_id and cc.kind = 'chapter'
      join public.vip_programmes pr on pr.community_id = cm.community_id and pr.active
     where cm.profile_id = auth.uid() and cm.status = 'active' and cm.role <> 'manager' limit 1;
    if v_prog is null then
      select id into v_prog from public.vip_programmes where is_default and active;
      v_auto := true;
    end if;
    if v_prog is null then select id into v_prog from public.vip_programmes where active order by name limit 1; v_auto := true; end if;
  else
    v_prog := i.programme_id;
  end if;
  if v_prog is null then return false; end if;
  insert into public.vip_members (profile_id, programme_id, status, source, created_by, auto_home)
  values (auth.uid(), v_prog, 'active', 'invite', i.created_by, v_auto)
  on conflict (profile_id) do update set programme_id = excluded.programme_id, status = 'active', left_on = null, auto_home = excluded.auto_home;
  if i.programme_id is not null then
    select community_id into v_comm from public.vip_programmes where id = v_prog;
    insert into public.community_members (community_id, profile_id, role, status)
    values (v_comm, auth.uid(), 'creator', 'active')
    on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';
  end if;
  update public.vip_invites set uses = uses + 1 where id = i.id;
  perform public.vip_ensure_month(v_prog);
  return true;
end $function$;

-- The accidental membership itself: Ethan's account, enrolled by the link on
-- 7 Oct, with no videos. Undoing it puts the VIP page back to the team view.
delete from public.vip_members m
 using public.profiles p
 where p.id = m.profile_id and p.platform_role = 'owner' and m.source = 'invite'
   and not exists (select 1 from public.vip_videos v where v.profile_id = m.profile_id);
