-- THE REAL VIP PAGE, FOR THE VIP TEAM (2 Oct 2026).
--
-- Ethan: "for the new VIP tab we have at the top on desktop for admins managing VIP communities, it opens a
-- VIP in a test preview, but I want it to be the actual VIP view."
--
-- The tab used to sign the admin into the sandbox VIP account, so what they saw was a test creator's empty
-- month, with a "viewing as" bar over it. Now the admin stays themselves and the VIP page draws the REAL
-- market: its month so far (every VIP's counted views and the pay they add up to), its real leaderboard,
-- announcements, briefs, perks, library and map. The two functions below are the staff halves of
-- vip_my_overview() and vip_board(); both are for people with VIP access (the owner and the access list),
-- and only for a programme they can manage.

create or replace function public.vip_staff_overview(p_programme uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  p public.vip_programmes; mo public.vip_months;
  v_views bigint := 0; v_videos int := 0; v_base numeric := 0; v_members int := 0; v_posting int := 0;
  v_f numeric; v_proj numeric; v_progs jsonb;
begin
  if not public.vip_has_access() then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'name', pr.name, 'community_id', pr.community_id, 'country_codes', c.country_codes, 'slug', c.slug,
      'members', (select count(*) from public.vip_members m where m.programme_id = pr.id and m.status = 'active'
                    and not public.vip_hidden_profile(m.profile_id)))
      order by pr.name), '[]'::jsonb)
    into v_progs
    from public.vip_programmes pr
    left join public.communities c on c.id = pr.community_id
   where pr.active and public.vip_can_manage(pr.id);

  select * into p from public.vip_programmes pr
   where pr.active and public.vip_can_manage(pr.id) and (p_programme is null or pr.id = p_programme)
   order by pr.name limit 1;
  if p.id is null then return null; end if;

  mo := public.vip_ensure_month(p.id);

  select coalesce(sum(s.views), 0), coalesce(sum(s.videos), 0),
         coalesce(sum(least(coalesce(m.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(s.views, p.cpm, p.tiers, m.cpm))), 0),
         count(*) filter (where s.videos > 0)
    into v_views, v_videos, v_base, v_posting
    from public.vip_month_stats(mo.id) s
    join public.vip_members m on m.profile_id = s.profile_id and m.programme_id = p.id and m.status = 'active'
   where not public.vip_hidden_profile(s.profile_id);

  select count(*) into v_members from public.vip_members m
   where m.programme_id = p.id and m.status = 'active' and not public.vip_hidden_profile(m.profile_id);

  v_f := greatest(0.0001, least(1, extract(epoch from (now() - mo.starts_at)) / nullif(extract(epoch from (mo.ends_at - mo.starts_at)), 0)));
  v_proj := case when v_f >= 0.08 and v_f < 1 then round(v_base / v_f, 2) else null end;

  return jsonb_build_object(
    'staff', true,
    'programmes', v_progs,
    'programme', jsonb_build_object('id', p.id, 'name', p.name, 'currency', p.currency, 'cpm', p.cpm, 'tiers', p.tiers,
        'min_payout', p.min_payout, 'monthly_cap', p.monthly_cap, 'window_days', p.window_days,
        'terms', p.terms, 'terms_version', p.terms_version, 'community_id', p.community_id),
    'member', jsonb_build_object('status', 'active', 'cpm', null, 'monthly_cap', null, 'target_videos', null,
        'target_views', null, 'joined_on', null, 'terms_ok', true),
    'month', jsonb_build_object('id', mo.id, 'year', mo.year, 'month', mo.month, 'starts_at', mo.starts_at,
        'ends_at', mo.ends_at, 'status', mo.status),
    'stats', jsonb_build_object('views', v_views, 'videos', v_videos, 'base', v_base, 'effective_cpm', p.cpm,
        'projected_views', null, 'projected_base', v_proj, 'rank', null, 'of', v_members,
        'members', v_members, 'posting', v_posting),
    'lifetime', jsonb_build_object('views', v_views, 'videos', v_videos, 'best_month', v_base),
    'videos', '[]'::jsonb,
    'payment_ready', true);
end $$;

create or replace function public.vip_staff_board(p_programme uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare mo public.vip_months;
begin
  if not public.vip_can_manage(p_programme) then return '[]'::jsonb; end if;
  mo := public.vip_ensure_month(p_programme);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'rank', z.rk, 'name', split_part(pr.name, ' ', 1), 'photo', pr.photo_url, 'views', z.views, 'videos', z.videos,
        'me', false) order by z.rk)
      from (
        select s.profile_id, s.views, s.videos, row_number() over (order by s.views desc, s.profile_id) rk
          from public.vip_month_stats(mo.id) s
          join public.vip_members vm on vm.profile_id = s.profile_id and vm.programme_id = p_programme and vm.status = 'active'
         where not public.vip_hidden_profile(s.profile_id)
      ) z join public.profiles pr on pr.id = z.profile_id
  ), '[]'::jsonb);
end $$;

select public.lock_down_definer_functions();
