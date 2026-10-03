-- DEMO DATA IN VIP SPAIN (3 Oct 2026). Ethan: "fill in the VIP Spain one with actual test data so I can properly review
-- it. This can easily be cleared in the next session." Eight invented creators ("... Demo", is_test, on
-- demo-vip-N@trypcreators.test addresses nobody can receive mail at) placed in the REAL VIP Spain programme, so every
-- screen of the VIP page and the VIP tools has something on it:
--   * each with their own deal: the market rate, a higher flat rate, a personal ladder, a monthly fee, a cap;
--   * September (already closed) with videos, statements worked out by the real pipeline and five of them approved -
--     so balances, the payout window, one cash payout (a real reward + its invoice) and one voucher request exist;
--   * October so far: videos with a reading a day, so the live board, the stay-in check and the KPIs move;
--   * past months on the CPM sheet, and a demo top-three bonus rule (note = 'demo').
-- Video reads are switched off for these rows (views_synced_at far ahead), so the hourly sync never asks TikTok about
-- videos that do not exist. Run scripts/seed-vip-demo.mjs first; remove with vip_spain_demo_remove.sql, then
-- `node scripts/seed-vip-demo.mjs --remove`.
do $$
declare
  v_prog uuid := 'a6a88268-eda9-4e50-b830-a105f54e294d';
  v_comm uuid; v_sep uuid; v_oct uuid; v_uid uuid; v_vid uuid; v_st uuid;
  v_owner uuid := (select id from public.profiles where platform_role = 'owner' limit 1);
  names text[] := array['Lucía', 'Carlos', 'Marina', 'Pablo', 'Sofía', 'Iker', 'Elena', 'Daniel'];
  cities text[] := array['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Málaga', 'Bilbao', 'Granada', 'Zaragoza'];
  power numeric[] := array[1.0, 0.8, 0.6, 0.45, 0.35, 0.25, 0.3, 0.12];
  plats text[] := array['TikTok', 'YouTube'];
  i int; j int; n int; posted timestamptz; final_views bigint; plat text; url text; d int; age int; v numeric; mo int;
begin
  if exists (select 1 from public.vip_members m join auth.users u on u.id = m.profile_id where u.email like 'demo-vip-%@trypcreators.test') then
    raise exception 'VIP Spain demo data is already loaded; remove it first';
  end if;
  perform setseed(0.31);
  -- act as the owner, so approvals and payouts pass the same checks the screens use
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select community_id into v_comm from public.vip_programmes where id = v_prog;
  select id into v_sep from public.vip_months where programme_id = v_prog and year = 2026 and month = 9;
  select id into v_oct from public.vip_months where programme_id = v_prog and year = 2026 and month = 10;

  for i in 1 .. 8 loop
    select id into v_uid from auth.users where email = 'demo-vip-' || i || '@trypcreators.test';
    if v_uid is null then raise exception 'Run scripts/seed-vip-demo.mjs first: demo-vip-% is missing', i; end if;
    update public.profiles set name = names[i] || ' Demo', is_test = true, status = 'active', onboarded = true,
           country = 'Spain', city = cities[i] where id = v_uid;
    if i not in (6, 8) then  -- two without payment details, so the nudge list has something real to say
      insert into public.creator_private (id, pay_name, pay_iban, pay_currency)
      values (v_uid, names[i] || ' Demo', 'ES91 2100 0418 4502 0005 13' || lpad(i::text, 2, '0'), 'EUR')
      on conflict (id) do update set pay_name = excluded.pay_name, pay_iban = excluded.pay_iban, pay_currency = excluded.pay_currency;
    end if;
    insert into public.community_members (community_id, profile_id, role, status) values (v_comm, v_uid, 'creator', 'active') on conflict do nothing;

    insert into public.vip_members (profile_id, programme_id, status, cpm, monthly_cap, target_videos, target_views, joined_on, source,
                                    terms_accepted_at, terms_version, notes, tiers, monthly_fee, fee_min_videos, auto_payout)
    values (v_uid, v_prog, 'active',
            case i when 2 then 0.30 when 4 then 0.35 end,                          -- own flat rates
            case when i = 1 then 450 end,                                          -- a cap
            case when i <= 5 then 5 end, case when i <= 3 then (400000 * power[i])::bigint end,
            case when i = 8 then current_date - 2 else date '2026-08-20' + i end,
            case when i = 3 then 'transfer' when i = 5 then 'invite' else 'admin' end,
            case when i = 7 then null else now() - interval '30 days' end, case when i = 7 then null else 1 end,
            case i when 1 then 'Top performer. Travel-hack videos do best.' when 4 then 'Negotiated 0.35 for exclusivity.' end,
            case when i = 3 then '[{"from_views": 250000, "cpm": 0.30}, {"from_views": 600000, "cpm": 0.35}]'::jsonb end,
            case when i = 5 then 50 end, case when i = 5 then 4 end,
            i = 2);

    if i = 8 then continue; end if;   -- the newest VIP has not posted yet
    for mo in 9 .. 10 loop
      n := case when mo = 9 then 3 + (random() * 4)::int else 1 + (random() * 2)::int end;
      if i = 6 and mo = 10 then n := 0; end if;      -- one quiet VIP this month (the stay-in check flags them)
      for j in 1 .. n loop
        posted := case when mo = 9 then timestamptz '2026-09-02 12:00+02' + (random() * 26) * interval '1 day'
                       else least(now() - interval '4 hours', timestamptz '2026-10-01 09:00+02' + (random() * 2.2) * interval '1 day') end;
        plat := plats[1 + ((i + j) % 2)];
        final_views := ((25000 + random() * 300000) * power[i] * case when mo = 10 then 0.55 else 1 end)::bigint;
        url := case plat
                 when 'TikTok' then 'https://www.tiktok.com/@demo' || i || '/video/' || ((extract(epoch from posted)::bigint) << 32)::text
                 else 'https://www.youtube.com/shorts/dm' || i || 'x' || mo || 'x' || j || 'Qz' end;
        insert into public.vip_videos (profile_id, programme_id, platform, video_url, caption, logged_views, views_source,
                                       views_synced_at, posted_at, submitted_at, status)
        values (v_uid, v_prog, plat, url, 'Demo video ' || j, 0, 'manual', now() + interval '400 days', posted, posted + interval '2 hours', 'tracking')
        returning id into v_vid;
        age := greatest(0, extract(day from (now() - posted))::int);
        for d in 0 .. age loop
          v := final_views * (1 - exp(-(d + 1)::numeric / 5));
          insert into public.vip_view_readings (video_id, views, source, read_at)
          select v_vid, v::bigint, 'manual', posted + (d * interval '1 day') + interval '3 hours'
           where posted + (d * interval '1 day') + interval '3 hours' < now();
        end loop;
        update public.vip_videos set logged_views = coalesce((select views from public.vip_view_readings where video_id = v_vid order by read_at desc limit 1), 0),
               posted_at = posted
         where id = v_vid;
      end loop;
    end loop;

    -- the CPM sheet's past months (July and August, before the platform)
    insert into public.vip_sheet_history (programme_id, profile_id, name, year, month, views, earned, cpm, created_by)
    select v_prog, v_uid, names[i] || ' Demo', 2026, m, x.vw, round(x.vw * y.c / 1000, 2), y.c, v_owner
      from generate_series(7, 8) m
      cross join lateral (select (180000 * power[i] * (0.7 + random() * 0.6))::bigint vw) x
      cross join lateral (select coalesce(case i when 2 then 0.30 when 4 then 0.35 end, 0.25)::numeric c) y;
  end loop;

  update public.vip_members set status = 'paused', notes = 'Paused while travelling, back in November.'
   where profile_id = (select id from auth.users where email = 'demo-vip-7@trypcreators.test');

  insert into public.vip_bonus_rules (programme_id, label, kind, scope, reward, amount, places, conditions, active, note) values
    (v_prog, 'Top of the month', 'top_n', 'market', 'cash', 0, '[{"place":1,"amount":60},{"place":2,"amount":30},{"place":3,"amount":15}]'::jsonb, '{}'::jsonb, true, 'demo');

  -- September, worked out by the real pipeline, then five approved: balances and an open payout window
  perform public.vip_compute_statements(v_sep);
  for v_st in select s.id from public.vip_statements s join auth.users u on u.id = s.profile_id
               where s.month_id = v_sep and u.email in ('demo-vip-1@trypcreators.test', 'demo-vip-2@trypcreators.test', 'demo-vip-3@trypcreators.test', 'demo-vip-4@trypcreators.test', 'demo-vip-5@trypcreators.test')
                 and s.status = 'draft' loop
    perform public.vip_approve_statement(v_st);
  end loop;
  -- Lucía takes hers in cash (a reward and an approved invoice); Pablo asks for a voucher (waits for a code)
  if public.vip_balance((select id from auth.users where email = 'demo-vip-1@trypcreators.test')) >= 100 then
    perform public.vip_pay_out((select id from auth.users where email = 'demo-vip-1@trypcreators.test'), 'cash', false);
  end if;
  if public.vip_balance((select id from auth.users where email = 'demo-vip-4@trypcreators.test')) > 0 then
    perform public.vip_pay_out((select id from auth.users where email = 'demo-vip-4@trypcreators.test'), 'voucher', false);
  end if;

  -- the history reads as weeks, not one second
  update public.vip_events e set at = now() - ((12 - (abs(hashtext(e.profile_id::text)) % 10)) * interval '3 days')
   where e.programme_id = v_prog and e.kind = 'joined'
     and e.profile_id in (select id from auth.users where email like 'demo-vip-%@trypcreators.test');

  -- the seed's own alerts to the team are noise, not news
  -- every notification this transaction wrote (welcome notes, "an invoice needs approving", statements) is noise
  delete from public.notifications n where n.created_at >= now();
end $$;
