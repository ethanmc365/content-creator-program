-- 344 (6 Oct 2026): A VIP IS CONFINED TO THE VIP PAGE AND THEIR OWN MARKET'S GENERAL ROOMS; STAYING IN IS "5 VIDEOS OR ONE 20,000-VIEW VIDEO".
--
-- Ethan, 6 Oct 2026, with the Spanish VIPs signing up:
--   * "All the challenges ... are showing up for the VIP creators, and they're getting put into the Spanish global
--     challenges currently running." CAUSE: joining the Spain community fires trg_place_member_in_groups ->
--     place_in_challenge_groups, which deals every new ACTIVE creator of the market onto the smallest board of any live
--     split challenge. It never asked whether the creator was a VIP, and a VIP's sign-up (vip_settle_home) is exactly a
--     community_members insert. Four real VIPs were on RETO OCTUBRE ESPAÑA boards, and the managers were told so.
--     Now: place_in_challenge_groups refuses a VIP, a BEFORE INSERT guard on challenge_group_members refuses one from any
--     other door (the group editor's deal, an admin move), and the four rows are removed.
--   * A VIP is never sent a challenge notice (push and email ride the notifications row, so one guard stops both).
--   * "They can see all the charts from all the countries": vip_market_standings returned every VIP market to any VIP, and
--     views_leaderboard took any market. A VIP now sees their own programme's standings and their own community's board;
--     the team (vip_has_access) still sees every market.
--   * "5 videos or 1 video with 20k+ views": vip_req_check is OR again (it was AND from 4 Oct, migration 322). `views` is
--     the BEST SINGLE VIDEO's views, the number compared with the threshold, and `total_views` keeps the month's sum.
--
-- Function bodies are the LIVE ones with only the changed lines replaced (never retype a live function body).

-- ------------------------------------------------------------------------------------------------ challenges
do $$
declare v text;
begin
  v := pg_get_functiondef('public.place_in_challenge_groups(uuid, uuid)'::regprocedure);
  if v not like '%v_p.is_sandbox or v_p.status <> ''active'' then%' then raise exception 'place_in_challenge_groups changed shape'; end if;
  v := replace(v, 'v_p.is_sandbox or v_p.status <> ''active'' then',
    'v_p.is_sandbox or v_p.status <> ''active''
     or exists (select 1 from public.vip_members vm where vm.profile_id = p_profile and vm.status = ''active'') then');
  execute v;
end $$;

create or replace function public.vip_not_in_groups()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- A VIP is paid by views and is not in the challenges. Skip the row rather than fail the batch it came in.
  if exists (select 1 from public.vip_members vm where vm.profile_id = new.creator_id and vm.status = 'active')
     and not exists (select 1 from public.profiles p where p.id = new.creator_id and p.is_admin) then
    return null;
  end if;
  return new;
end $$;
revoke all on function public.vip_not_in_groups() from public;
revoke all on function public.vip_not_in_groups() from anon;
revoke all on function public.vip_not_in_groups() from authenticated;

drop trigger if exists trg_vip_not_in_groups on public.challenge_group_members;
create trigger trg_vip_not_in_groups before insert on public.challenge_group_members
  for each row execute function public.vip_not_in_groups();

delete from public.challenge_group_members g
 where exists (select 1 from public.vip_members vm where vm.profile_id = g.creator_id and vm.status = 'active')
   and not exists (select 1 from public.profiles p where p.id = g.creator_id and p.is_admin);

-- No challenge notice (and so no push, no email) for somebody who is not in the challenges.
create or replace function public.vip_no_challenge_notices()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.type = 'challenge'
     and exists (select 1 from public.vip_members vm where vm.profile_id = new.recipient_id and vm.status = 'active')
     and not exists (select 1 from public.profiles p where p.id = new.recipient_id and p.is_admin)
     and not exists (select 1 from public.vip_managers m where m.profile_id = new.recipient_id) then
    return null;
  end if;
  return new;
end $$;
revoke all on function public.vip_no_challenge_notices() from public;
revoke all on function public.vip_no_challenge_notices() from anon;
revoke all on function public.vip_no_challenge_notices() from authenticated;

drop trigger if exists trg_vip_no_challenge_notices on public.notifications;
create trigger trg_vip_no_challenge_notices before insert on public.notifications
  for each row execute function public.vip_no_challenge_notices();

-- ------------------------------------------------------------------------------------------------ charts
do $$
declare v text;
begin
  v := pg_get_functiondef('public.vip_market_standings()'::regprocedure);
  if v not like '%where (pr.active or public.is_owner()) order by pr.name loop%' then raise exception 'vip_market_standings changed shape'; end if;
  v := replace(v, 'where (pr.active or public.is_owner()) order by pr.name loop',
    'where (pr.active or public.is_owner()) and (v_all or pr.id = public.vip_my_programme()) order by pr.name loop');
  execute v;
end $$;

-- The community a VIP may read a board for: their own. Anybody else gets what they asked for.
create or replace function public.vip_lock_community(p_community uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select case
    when auth.uid() is null or not public.is_active_vip() or public.is_admin() or public.vip_has_access() then p_community
    else coalesce((select pr.community_id from public.vip_members vm join public.vip_programmes pr on pr.id = vm.programme_id
                    where vm.profile_id = auth.uid() and vm.status = 'active'
                      and (p_community is null or p_community = pr.community_id)),
                  '00000000-0000-0000-0000-000000000000'::uuid)
  end
$$;
revoke all on function public.vip_lock_community(uuid) from public;
revoke all on function public.vip_lock_community(uuid) from anon;
revoke all on function public.vip_lock_community(uuid) from authenticated;

do $$
declare v text;
begin
  v := pg_get_functiondef('public.views_leaderboard(uuid)'::regprocedure);
  if v not like '%p_community is null%' or v not like '%m.community_id = p_community%' then raise exception 'views_leaderboard changed shape'; end if;
  v := replace(v, 'p_community is null', 'public.vip_lock_community(p_community) is null');
  v := replace(v, 'm.community_id = p_community', 'm.community_id = public.vip_lock_community(p_community)');
  execute v;
end $$;

-- ------------------------------------------------------------------------------------------------ the stay-in rule
CREATE OR REPLACE FUNCTION public.vip_req_check(p_profile uuid, p_month uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mo public.vip_months; p public.vip_programmes; v_videos int; v_best bigint; v_total bigint; v_by_videos boolean; v_by_views boolean;
begin
  select * into mo from public.vip_months where id = p_month;
  select * into p from public.vip_programmes where id = mo.programme_id;
  select count(*) filter (where v.status = 'tracking'
           and coalesce(v.posted_at, v.submitted_at) >= mo.starts_at and coalesce(v.posted_at, v.submitted_at) < mo.ends_at)::int,
         coalesce(max(public.vip_video_counted(v, mo)), 0),
         coalesce(sum(public.vip_video_counted(v, mo)), 0)::bigint
    into v_videos, v_best, v_total
    from public.vip_videos v where v.profile_id = p_profile and v.programme_id = mo.programme_id;
  -- EITHER ROAD IS ENOUGH: enough videos in the month, OR one video that reaches the views. A road set to 0 is not a road.
  v_by_videos := coalesce(p.req_videos, 0) > 0 and coalesce(v_videos, 0) >= p.req_videos;
  v_by_views := coalesce(p.req_single_views, 0) > 0 and coalesce(v_best, 0) >= p.req_single_views;
  return jsonb_build_object('videos', coalesce(v_videos, 0), 'views', coalesce(v_best, 0), 'best_views', coalesce(v_best, 0), 'best_video', coalesce(v_best, 0),
    'total_views', coalesce(v_total, 0),
    'need_videos', p.req_videos, 'need_views', p.req_single_views, 'on', p.req_on,
    'met', not p.req_on or (coalesce(p.req_videos, 0) <= 0 and coalesce(p.req_single_views, 0) <= 0) or v_by_videos or v_by_views,
    'by', case when v_by_videos then 'videos' when v_by_views then 'views' else null end);
end $function$;

do $$
declare v text;
begin
  v := pg_get_functiondef('public.vip_requirement_decide(uuid, uuid, text, text)'::regprocedure);
  if position($a$' videos and ' ||$a$ in v) = 0 or position($a$ views. Reach both this month to keep your place.$a$ in v) = 0 then
    raise exception 'vip_requirement_decide changed shape';
  end if;
  v := replace(v, $a$' videos and ' ||$a$, $a$' videos, or one video with ' ||$a$);
  v := replace(v, $a$ views. Reach both this month to keep your place.$a$, $a$ views. Reach either one this month to keep your place.$a$);
  execute v;

  v := pg_get_functiondef('public.vip_requirement_nudges()'::regprocedure);
  if position($a$' to go and ' || to_char(greatest(0, req_single_views - (c ->> 'views')::bigint), 'FM999,999,999') || ' more views. ' ||$a$ in v) = 0 then
    raise exception 'vip_requirement_nudges changed shape';
  end if;
  v := replace(v, $a$' to go and ' || to_char(greatest(0, req_single_views - (c ->> 'views')::bigint), 'FM999,999,999') || ' more views. ' ||$a$,
                  $a$' to go, or one video that reaches ' || to_char(req_single_views, 'FM999,999,999') || ' views. ' ||$a$);
  execute v;
end $$;

-- Spain's rule, spelled out (it already held these numbers): 5 videos in the month OR one video with 20,000+ views.
update public.vip_programmes set req_on = true, req_videos = 5, req_single_views = 20000
 where community_id in (select id from public.communities where slug = 'spain');
