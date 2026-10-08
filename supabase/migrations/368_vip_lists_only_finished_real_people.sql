-- 368: VIP lists show only finished, real people; manual views for a video the platform will not state.
--
-- 9 Oct 2026. Ethan: "the test VIP account is still showing up", "the Tryp.com demo VIP team shows as an account at the
-- bottom of the members page", a VIP who has not finished her profile appears in recent activity, and Julia Flores'
-- Facebook video "cannot be read".
--
--  * vip_unfinished(profile): a person who signed up with a VIP link but whose profile is not finished (or not approved
--    yet) is not a VIP creator yet. They are kept out of the lists, counts and activity, and named separately.
--  * vip_members_live (the view every count reads) drops them; vip_admin_overview names them under `waiting`.
--  * vip_timeline hides their events until they are in.
--  * vip_team_people no longer names the sandbox demo account (or any test account) as somebody who runs a programme.
--  * vip_set_video_views: Facebook states no public view count for a video posted from a personal profile, so the team can
--    type it. A later automatic reading that succeeds still wins; a failure leaves the typed number alone.

create or replace function public.vip_unfinished(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not (coalesce(pf.onboarded, false) and pf.status = 'active') from public.profiles pf where pf.id = p_profile), false)
$$;
revoke execute on function public.vip_unfinished(uuid) from public, anon;
grant execute on function public.vip_unfinished(uuid) to authenticated, service_role;

create or replace view public.vip_members_live as
 select m.profile_id, m.programme_id, m.status, m.cpm, m.monthly_cap, m.target_videos, m.target_views, m.joined_on, m.left_on,
        m.source, m.terms_accepted_at, m.terms_version, m.notes, m.created_by, m.created_at, m.milestone_notified, m.auto_home,
        m.headline, m.accent, m.own_goal_views, m.show_on_map, m.rate_review_on, m.tiers, m.monthly_fee, m.fee_min_videos,
        m.bonuses_on, m.auto_payout, m.join_notice_pending
   from public.vip_members m
  where not exists (select 1 from public.profiles p
                     where p.id = m.profile_id
                       and (coalesce(p.is_test, false) or coalesce(p.is_sandbox, false)
                            or not (coalesce(p.onboarded, false) and p.status = 'active')));

create or replace function public.vip_admin_overview(p_programme uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.vip_programmes; mo public.vip_months; v_members jsonb; v_waiting jsonb; v_views bigint; v_spend numeric; v_f numeric;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  select * into p from public.vip_programmes where id = p_programme;
  mo := public.vip_ensure_month(p_programme);
  v_f := greatest(0.0001, least(1, extract(epoch from (now() - mo.starts_at)) / nullif(extract(epoch from (mo.ends_at - mo.starts_at)), 0)));

  select coalesce(jsonb_agg(row_json order by (row_json ->> 'views')::bigint desc), '[]'::jsonb) into v_members from (
    select jsonb_build_object(
      'profile_id', vm.profile_id, 'name', pr.name, 'photo', pr.photo_url, 'status', vm.status,
      'cpm', vm.cpm, 'cap', vm.monthly_cap, 'target_videos', vm.target_videos, 'target_views', vm.target_views,
      'joined_on', vm.joined_on, 'source', vm.source, 'notes', vm.notes,
      'terms_ok', public.vip_terms_ok(vm.profile_id),
      'videos', coalesce(s.videos, 0), 'views', coalesce(s.views, 0),
      'base', least(coalesce(vm.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(coalesce(s.views, 0), coalesce(vm.cpm, p.cpm), coalesce(vm.tiers, p.tiers), case when vm.tiers is null then vm.cpm end)),
      'projected_base', case when v_f >= 0.08 then least(coalesce(vm.monthly_cap, p.monthly_cap, 1e12),
                         public.vip_views_pay(round(coalesce(s.views, 0) / v_f)::bigint, coalesce(vm.cpm, p.cpm), coalesce(vm.tiers, p.tiers), case when vm.tiers is null then vm.cpm end)) end,
      'payment_ready', public.vip_payment_ready(vm.profile_id, p.currency),
      'lifetime_views', coalesce((select sum(x.views) from public.vip_statements x where x.profile_id = vm.profile_id and x.status <> 'void' and x.month_id <> mo.id), 0) + coalesce(s.views, 0)
    ) as row_json
    from public.vip_members_live vm
    join public.profiles pr on pr.id = vm.profile_id
    left join public.vip_month_stats(mo.id) s on s.profile_id = vm.profile_id
   where vm.programme_id = p_programme and vm.status <> 'left' and not public.vip_hidden_profile(vm.profile_id)
  ) q;

  -- Signed up with the link, but the profile is not finished or not approved yet.
  select coalesce(jsonb_agg(jsonb_build_object('profile_id', m.profile_id, 'name', pr.name, 'photo', pr.photo_url, 'joined_on', m.joined_on)
                            order by m.joined_on desc, pr.name), '[]'::jsonb) into v_waiting
    from public.vip_members m join public.profiles pr on pr.id = m.profile_id
   where m.programme_id = p_programme and m.status = 'active'
     and not (coalesce(pr.is_test, false) or coalesce(pr.is_sandbox, false))
     and not (coalesce(pr.onboarded, false) and pr.status = 'active');

  select coalesce(sum((x ->> 'views')::bigint), 0),
         coalesce(sum((x ->> 'base')::numeric), 0)
    into v_views, v_spend from jsonb_array_elements(v_members) x;

  return jsonb_build_object(
    'programme', to_jsonb(p),
    'month', to_jsonb(mo),
    'members', v_members,
    'waiting', v_waiting,
    'totals', jsonb_build_object('views', v_views, 'spend_so_far', v_spend,
        'spend_projected', case when v_f >= 0.08 then (select coalesce(sum((x ->> 'projected_base')::numeric), 0) from jsonb_array_elements(v_members) x) end,
        'budget', p.budget_monthly));
end $$;

create or replace function public.vip_timeline(p_programme uuid, p_profile uuid default null, p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vip_can_see(p_programme) then raise exception 'Not yours to see.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'detail', e.detail, 'at', e.at, 'profile_id', e.profile_id,
             'name', pf.name, 'photo', pf.photo_url, 'actor', ac.name) order by e.at desc)
      from (select * from public.vip_events ev
             where ev.programme_id = p_programme and (p_profile is null or ev.profile_id = p_profile)
               and (ev.profile_id is null or (not public.vip_hidden_profile(ev.profile_id) and not public.vip_unfinished(ev.profile_id)))
             order by ev.at desc limit greatest(1, least(coalesce(p_limit, 40), 200))) e
      left join public.profiles pf on pf.id = e.profile_id
      left join public.profiles ac on ac.id = e.actor_id), '[]'::jsonb);
end $$;

create or replace function public.vip_team_people()
returns table(profile_id uuid, programme_id uuid, programme text, kind text)
language sql stable security definer set search_path = public as $$
  select m.profile_id, m.programme_id, p.name, 'staff'::text
    from public.vip_managers m
    join public.vip_programmes p on p.id = m.programme_id
   where public.vip_has_access() and not public.vip_hidden_profile(m.profile_id)
     and not coalesce((select is_test from public.profiles where id = m.profile_id), false)
  union all
  select v.profile_id, v.programme_id, p.name, 'creator'::text
    from public.vip_members v
    join public.vip_programmes p on p.id = v.programme_id
   where v.is_team and v.status <> 'left' and public.vip_has_access() and not public.vip_hidden_profile(v.profile_id)
     and not coalesce((select is_test from public.profiles where id = v.profile_id), false)
$$;

create or replace function public.vip_set_video_views(p_video uuid, p_views bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vip_videos;
begin
  select * into v from public.vip_videos where id = p_video;
  if v.id is null then raise exception 'No such video.'; end if;
  if not public.vip_can_manage(v.programme_id) then raise exception 'Only the market lead or the team can do that.'; end if;
  if p_views is null or p_views < 0 then raise exception 'That is not a number of views.'; end if;
  update public.vip_videos set logged_views = p_views, views_source = 'manual', views_approx = false,
         views_synced_at = now(), views_sync_error = null where id = p_video;
  insert into public.vip_view_readings (video_id, views, source) values (p_video, p_views, 'manual');
end $$;
revoke execute on function public.vip_set_video_views(uuid, bigint) from public, anon;
grant execute on function public.vip_set_video_views(uuid, bigint) to authenticated, service_role;
