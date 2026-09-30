-- DEMO DATA FOR THE THIRD VIP PASS (30 Sep 2026, after migration 299). Run AFTER vip_demo.sql. Everything here belongs
-- to the inactive "VIP Demo" programme and its is_test creators, so real creators and real markets never see it:
--   * the eight demo creators get a town and coordinates, so the VIP map has pins;
--   * two monthly challenges (September, October), three perks/trips, and their unlocked/claimed/delivered states;
--   * nothing here sends a notification (rows are inserted directly), pays anybody or makes an invoice.
-- Removed together with the programme by vip_demo_remove.sql (every table cascades from vip_programmes / profiles).
do $$
declare
  v_prog uuid; i int; uid uuid; p_views uuid; p_trip uuid; p_streak uuid; p_manual uuid;
  cities text[] := array['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao', 'Málaga', 'Zaragoza', 'Palma'];
  lats float8[] := array[40.4168, 41.3874, 39.4699, 37.3891, 43.2630, 36.7213, 41.6488, 39.5696];
  lngs float8[] := array[-3.7038, 2.1686, -0.3763, -5.9845, -2.9350, -4.4214, -0.8891, 2.6502];
  ids uuid[] := '{}';
begin
  select id into v_prog from public.vip_programmes where name = 'VIP Demo';
  if v_prog is null then raise exception 'Run vip_demo.sql first'; end if;
  if exists (select 1 from public.vip_briefs where programme_id = v_prog) then raise notice 'v3 demo already loaded'; return; end if;

  for i in 1 .. 8 loop
    select id into uid from auth.users where email = 'demo-vip-' || i || '@trypcreators.test';
    update public.profiles set city = cities[i], city_lat = lats[i], city_lng = lngs[i], show_on_map = true,
           country = 'Spain', bio = 'Demo creator. Travel videos from ' || cities[i] || '.' where id = uid;
    update public.vip_members set headline = case i when 1 then 'Budget city breaks' when 2 then 'Food and train trips' when 3 then 'Weekend escapes' end,
           accent = case i when 1 then '#d94407' when 2 then '#0d6b57' end
     where profile_id = uid;
  end loop;

  insert into public.vip_briefs (programme_id, year, month, title, theme, body, hooks, metric, target, prize) values
    (v_prog, 2026, 9, 'Hidden-gem city breaks', 'Autumn',
     E'Show a city break most people overlook.\n\n- Open with the price\n- Film the arrival and one detail nobody talks about\n- End with what you would do differently',
     array['A weekend in a city nobody visits, for under 100 euros', 'Do not book the famous one before you watch this', 'Three things I wish I knew before this trip'],
     'views', 200000, 'A 100 euro voucher for the most views'),
    (v_prog, 2026, 10, 'Weekend under 100 euros', 'Budget',
     E'Plan a whole weekend for under 100 euros and show every price on screen.\n\n1. Transport\n2. A place to sleep\n3. Food\n4. One free thing worth the trip',
     array['I spent a whole weekend in [city] for under 100 euros, here is the receipt', 'POV: you finally book the cheap trip you kept putting off'],
     'videos', 6, 'A feature in the VIP spotlight');

  insert into public.vip_perks (programme_id, kind, title, description, metric, threshold, sort, active)
  values (v_prog, 'milestone', '100,000 views', 'A shout-out to the whole VIP group.', 'lifetime_views', 100000, 10, true) returning id into p_views;
  insert into public.vip_perks (programme_id, kind, title, description, metric, threshold, sort, active)
  values (v_prog, 'trip', '1 million views: your trip', 'A trip to a destination planned with your market lead.', 'lifetime_views', 1000000, 20, true) returning id into p_trip;
  insert into public.vip_perks (programme_id, kind, title, description, metric, threshold, sort, active)
  values (v_prog, 'perk', 'Six videos in a month', 'A welcome pack from the team.', 'lifetime_videos', 6, 30, true) returning id into p_streak;
  insert into public.vip_perks (programme_id, kind, title, description, metric, threshold, sort, active)
  values (v_prog, 'perk', 'Creator of the month', 'Given by hand by the team.', 'manual', 0, 40, true) returning id into p_manual;

  insert into public.vip_perk_awards (perk_id, profile_id)
  select pk.id, m.profile_id from public.vip_members m
    join public.vip_perks pk on pk.programme_id = v_prog and pk.active and pk.metric <> 'manual'
   where m.programme_id = v_prog and m.status = 'active' and public.vip_metric(m.profile_id, pk.metric) >= pk.threshold;

  select array_agg(id order by email) into ids from auth.users where email like 'demo-vip-%@trypcreators.test';
  update public.vip_perk_awards set status = 'claimed', claimed_at = now() - interval '2 days' where perk_id = p_views and profile_id = ids[2];
  update public.vip_perk_awards set status = 'delivered', claimed_at = now() - interval '6 days', delivered_at = now() - interval '4 days' where perk_id = p_views and profile_id = ids[1];
  insert into public.vip_perk_awards (perk_id, profile_id, status, claimed_at, delivered_at, note)
  values (p_manual, ids[1], 'delivered', now() - interval '9 days', now() - interval '8 days', 'Featured in the August spotlight');
end $$;
