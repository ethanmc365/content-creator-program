-- DEMO DATA FOR THE VIP PROGRAMME (30 Sep 2026): a "VIP Demo" programme with eight invented creators, two months of
-- videos, a closed August with drafted statements, bonus rules and a live September - so every screen of the VIP tools
-- has something to show. Ethan-only by construction:
--   * the programme is INACTIVE (no month is auto-created, nothing is synced, closed or nudged, and "Make a VIP" never offers it);
--   * its community is inactive (not in any market list);
--   * the eight creators are is_test profiles on @trypcreators.test addresses (hidden from every list and count);
--   * only the owner, or someone the owner gives "VIP Demo" access to, can open it.
-- Nothing here creates a reward or an invoice: statements are drafted, and two are marked approved by hand with no payout.
-- Run scripts/seed-vip-demo.mjs first (creates the users), then this file. Remove with supabase/seeds/vip_demo_remove.sql.
do $$
declare
  v_comm uuid; v_prog uuid; v_aug uuid; v_sep uuid; v_uid uuid; v_vid uuid;
  names text[] := array['Lucía', 'Carlos', 'Marina', 'Pablo', 'Sofía', 'Iker', 'Elena', 'Daniel'];
  power numeric[] := array[1.0, 0.8, 0.55, 0.4, 0.3, 0.25, 0.35, 0.1];
  plats text[] := array['TikTok', 'Instagram', 'YouTube'];
  i int; j int; n_vids int; posted timestamptz; final_views bigint; plat text; url text; d int; age int; v numeric;
  tz text := 'Europe/Madrid';
begin
  if exists (select 1 from public.communities where slug = 'vip-demo') then raise notice 'VIP Demo already exists; remove it first'; return; end if;
  perform setseed(0.42);

  insert into public.communities (slug, name, kind, country_codes, language, currency, timezone, is_active, join_mode, join_policy)
  values ('vip-demo', 'VIP Demo', 'chapter', '{ES}', 'es', 'EUR', tz, false, 'review', 'country') returning id into v_comm;
  insert into public.vip_programmes (community_id, name, currency, cpm, tiers, min_payout, budget_monthly, window_days, active)
  values (v_comm, 'VIP Demo', 'EUR', 0.25, '[{"from_views": 1000000, "cpm": 0.30}]'::jsonb, 10, 900, 60, false) returning id into v_prog;

  insert into public.vip_months (programme_id, year, month, starts_at, ends_at, status, final_sync_at, closed_at)
  select v_prog, 2026, 8, b.starts_at, b.ends_at, 'closed', b.ends_at - interval '20 minutes', b.ends_at + interval '40 minutes'
    from public.vip_month_bounds(2026, 8, tz) b returning id into v_aug;
  insert into public.vip_months (programme_id, year, month, starts_at, ends_at, status)
  select v_prog, 2026, 9, b.starts_at, b.ends_at, 'open' from public.vip_month_bounds(2026, 9, tz) b returning id into v_sep;

  for i in 1 .. 8 loop
    select id into v_uid from auth.users where email = 'demo-vip-' || i || '@trypcreators.test';
    if v_uid is null then raise exception 'Run scripts/seed-vip-demo.mjs first: demo-vip-% is missing', i; end if;
    update public.profiles set name = names[i] || ' Demo', is_test = true, status = 'active', onboarded = true, country = 'Spain', city = 'Madrid' where id = v_uid;
    insert into public.creator_private (id, pay_name, pay_iban, pay_currency)
    select v_uid, names[i] || ' Demo', 'ES00 0000 0000 00 0000000' || i, 'EUR' where i <> 8
    on conflict (id) do update set pay_name = excluded.pay_name, pay_iban = excluded.pay_iban, pay_currency = excluded.pay_currency;
    insert into public.community_members (community_id, profile_id, role, status) values (v_comm, v_uid, 'creator', 'active') on conflict do nothing;

    insert into public.vip_members (profile_id, programme_id, status, cpm, monthly_cap, target_videos, target_views, joined_on, source, terms_accepted_at, terms_version, notes)
    values (v_uid, v_prog, 'active',
            case when i = 2 then 0.30 end, case when i = 1 then 400 end,
            case when i <= 5 then 4 end, case when i <= 3 then (300000 * power[i])::bigint end,
            case when i = 8 then current_date - 5 else date '2026-07-01' + (i * 3) end,
            case when i = 4 then 'invite' when i = 3 then 'transfer' else 'admin' end,
            case when i = 8 then null else now() - interval '30 days' end, case when i = 8 then null else 1 end,
            case when i = 1 then 'Top performer. Prefers travel-hack videos.' end);

    if i = 8 then continue; end if;   -- the newest VIP has not posted yet
    n_vids := 3 + (random() * 4)::int;
    for j in 1 .. n_vids loop
      posted := timestamptz '2026-08-04 12:00+02' + (random() * 54) * interval '1 day';
      plat := plats[1 + ((i + j) % 3)];
      final_views := ((20000 + random() * 380000) * power[i])::bigint;
      url := case plat
               when 'TikTok' then 'https://www.tiktok.com/@demo' || i || '/video/' || ((extract(epoch from posted)::bigint) << 32)::text
               when 'Instagram' then 'https://www.instagram.com/reel/DEMO' || i || 'x' || j || 'Q/'
               else 'https://www.youtube.com/shorts/demo' || i || 'x' || j || 'Qzz' end;
      insert into public.vip_videos (profile_id, programme_id, platform, video_url, caption, logged_views, views_source, views_synced_at, posted_at, submitted_at, status)
      values (v_uid, v_prog, plat, url, 'Demo video ' || j, 0, 'manual', now(), posted, posted + interval '2 hours', 'tracking') returning id into v_vid;
      -- one reading a day from the day it was posted, easing towards its final total
      age := greatest(1, extract(day from (now() - posted))::int);
      for d in 0 .. age loop
        v := final_views * (1 - exp(-(d + 1)::numeric / 9));
        insert into public.vip_view_readings (video_id, views, source, read_at)
        select v_vid, v::bigint, 'manual', posted + (d * interval '1 day') + interval '3 hours'
         where posted + (d * interval '1 day') + interval '3 hours' < now();
      end loop;
      update public.vip_videos set logged_views = coalesce((select views from public.vip_view_readings where video_id = v_vid order by read_at desc limit 1), 0) where id = v_vid;
    end loop;
  end loop;

  -- one paused, one moved back to the community (both write timeline events and notify the demo creators)
  update public.vip_members set status = 'paused' where profile_id = (select id from auth.users where email = 'demo-vip-6@trypcreators.test');
  update public.vip_members set status = 'left', left_on = current_date - 12 where profile_id = (select id from auth.users where email = 'demo-vip-7@trypcreators.test');

  insert into public.vip_bonus_rules (programme_id, label, kind, scope, reward, amount, places, conditions, active) values
    (v_prog, 'Top of the month', 'top_n', 'market', 'cash', 0, '[{"place":1,"amount":100},{"place":2,"amount":50},{"place":3,"amount":25}]'::jsonb, '{}'::jsonb, true),
    (v_prog, 'Hit your target', 'target', 'creator', 'cash', 20, '[]'::jsonb, '{"own": true}'::jsonb, true),
    (v_prog, 'Reach 1M views as a VIP', 'milestone', 'creator', 'cash', 150, '[]'::jsonb, '{"metric":"lifetime_views","threshold":1000000}'::jsonb, true);

  perform public.vip_compute_statements(v_aug);                    -- August, drafted by the real pipeline
  update public.vip_statements set status = 'approved', approved_at = now() - interval '20 days'
   where month_id = v_aug and profile_id in (select id from auth.users where email in ('demo-vip-1@trypcreators.test', 'demo-vip-2@trypcreators.test'));

  if to_regclass('public.vip_events') is not null then              -- spread the history over the last weeks
    update public.vip_events e set at = now() - ((10 - (e.id % 9)) * interval '3 days') - interval '2 hours'
     where e.programme_id = v_prog and e.kind = 'joined';
  end if;
  if to_regclass('public.vip_announcements') is not null then
    insert into public.vip_announcements (programme_id, title, body, pinned) values
      (v_prog, 'New bonus for October', E'Top three creators by views each month now earn 100, 50 and 25 euros.\nBonuses are added to the statement automatically.', true),
      (v_prog, 'Reminder: payment details', 'Please check your payment details are saved before month end so your payout is not delayed.', false);
  end if;
end $$;
