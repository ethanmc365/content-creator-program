-- A FULL VIP MONTH, REHEARSED AND ROLLED BACK (2 Oct 2026).
-- Run through the SQL runner; every write is undone by the exception at the end, which also carries the
-- findings (`raise notice` is not returned by the tool). It uses two real Spanish creators and one real
-- admin ONLY as ids inside a transaction that never commits.
--
-- What it proves: membership + flag, terms gate, submit + duplicate refusal, views gained in a month
-- (posted in month / older tracked / older submitted later), tiers and cap, all five bonus kinds, the
-- minimum-payout rollover, approval -> cash reward -> invoice -> approved, late bank details following the
-- approval, the fence (a VIP cannot enter a challenge; a non-VIP cannot read a VIP room).
do $$
declare
  out text := '';
  prog uuid; mo public.vip_months;
  a uuid := '9b3ed657-4d39-43a4-9737-361c069b17c9';  -- Lucia Rodriguez
  b uuid := '49548829-a3a3-4019-bc54-f92921d520b4';  -- Noemi
  admin uuid := 'ff5460bc-91d3-46f1-8733-8a2ef846b3b5'; -- Marta Lara (global admin)
  v1 uuid; v2 uuid; v3 uuid; n int; r record; j jsonb; st uuid; st_b uuid; ok boolean; msg text;
  v_ch uuid; seen int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);

  select p.id into prog from public.vip_programmes p join public.communities c on c.id = p.community_id where c.slug = 'spain';
  mo := public.vip_ensure_month(prog);
  out := out || format('month %s-%s %s -> %s%s', mo.year, mo.month, mo.starts_at, mo.ends_at, E'\n');

  -- a tiered programme with a small minimum, so every rule has something to bite on
  update public.vip_programmes set tiers = '[{"from_views": 1000000, "cpm": 0.30}]'::jsonb, min_payout = 10 where id = prog;

  perform public.vip_add_member(a, prog, null, null, 2, 300000);
  perform public.vip_add_member(b, prog);
  out := out || format('flags a=%s b=%s%s', (select is_vip from public.profiles where id = a), (select is_vip from public.profiles where id = b), E'\n');

  -- terms gate and submit
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  begin
    perform public.vip_submit_video('https://www.youtube.com/watch?v=aaaaaaaaaaa', 'YouTube');
    out := out || 'TERMS GATE FAILED' || E'\n';
  exception when others then out := out || 'terms gate ok: ' || sqlerrm || E'\n'; end;
  perform public.vip_accept_terms();
  v1 := public.vip_submit_video('https://www.youtube.com/watch?v=aaaaaaaaaaa', 'YouTube', 'first');
  begin
    perform public.vip_submit_video('https://youtu.be/aaaaaaaaaaa', 'YouTube');
    out := out || 'DUPLICATE ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'duplicate refused: ' || sqlerrm || E'\n'; end;
  begin
    perform public.vip_submit_video('https://www.tiktok.com/@x/video/6500000000000000000', 'TikTok');
    out := out || 'OLD VIDEO ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'old video refused: ' || sqlerrm || E'\n'; end;

  -- readings, written the way the sync writes them
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  -- v1: posted inside the month -> counts from zero to what it has now
  update public.vip_videos set posted_at = mo.starts_at + interval '1 day', logged_views = 250000, views_synced_at = now() where id = v1;
  insert into public.vip_view_readings (video_id, views, read_at) values (v1, 100000, now() - interval '1 hour'), (v1, 250000, now());
  -- v2: an older video (posted before the month), submitted a day into it, first reading 400k, now 450k -> 50k
  insert into public.vip_videos (profile_id, programme_id, platform, video_url, posted_at, submitted_at, logged_views)
  values (a, prog, 'YouTube', 'https://www.youtube.com/watch?v=bbbbbbbbbbb', mo.starts_at - interval '20 days', mo.starts_at + interval '1 day', 450000)
  returning id into v2;
  insert into public.vip_view_readings (video_id, views, read_at) values (v2, 400000, mo.starts_at + interval '2 days'), (v2, 450000, now());
  -- v3 (Noemi): tracked before the month began, 1,000,000 then, 1,300,000 now -> 300k
  insert into public.vip_videos (profile_id, programme_id, platform, video_url, posted_at, submitted_at, logged_views)
  values (b, prog, 'YouTube', 'https://www.youtube.com/watch?v=ccccccccccc', mo.starts_at - interval '10 days', mo.starts_at - interval '9 days', 1300000)
  returning id into v3;
  insert into public.vip_view_readings (video_id, views, read_at) values (v3, 1000000, mo.starts_at - interval '1 day'), (v3, 1300000, now());

  for r in select * from public.vip_month_stats(mo.id) loop
    out := out || format('stats %s videos=%s views=%s%s', left(r.profile_id::text, 4), r.videos, r.views, E'\n');
  end loop;
  out := out || format('pay 300000 tiered=%s flat=%s 1.5M tiered=%s%s',
    public.vip_views_pay(300000, 0.25, '[{"from_views":1000000,"cpm":0.30}]', null),
    public.vip_views_pay(300000, 0.25, '[]', null),
    public.vip_views_pay(1500000, 0.25, '[{"from_views":1000000,"cpm":0.30}]', null), E'\n');

  -- every rule kind
  insert into public.vip_bonus_rules (programme_id, label, kind, scope, reward, amount, conditions)
    values (prog, 'Hit your target', 'target', 'creator', 'cash', 20, '{"own": true}');
  insert into public.vip_bonus_rules (programme_id, label, kind, scope, reward, places)
    values (prog, 'Top of the month', 'top_n', 'market', 'cash', '[{"place":1,"amount":100,"reward":"cash"},{"place":2,"amount":50,"reward":"voucher"}]');
  insert into public.vip_bonus_rules (programme_id, label, kind, scope, reward, amount)
    values (prog, 'Best video', 'best_video', 'market', 'cash', 30);
  insert into public.vip_bonus_rules (programme_id, label, kind, scope, reward, amount, conditions)
    values (prog, 'First 250k as a VIP', 'milestone', 'creator', 'cash', 15, '{"metric":"lifetime_views","threshold":250000}');

  n := public.vip_compute_statements(mo.id);
  out := out || format('drafted %s%s', n, E'\n');
  for r in select s.*, pr.name from public.vip_statements s join public.profiles pr on pr.id = s.profile_id where s.month_id = mo.id loop
    out := out || format('  %s views=%s videos=%s base=%s bonuses=%s total=%s roll_out=%s flags=%s%s',
      r.name, r.views, r.videos, r.base, r.bonuses, r.total, r.rollover_out, r.flags, E'\n');
    if r.profile_id = a then st := r.id; else st_b := r.id; end if;
  end loop;

  -- a recompute changes nothing it should not (milestone stays claimed by the same draft)
  n := public.vip_compute_statements(mo.id);
  out := out || format('recompute total a=%s%s', (select total from public.vip_statements where id = st), E'\n');

  -- an adjustment, then approval with bank details
  perform public.vip_add_adjustment(st, 'Goodwill', 5, 'late brief');
  out := out || format('after adjustment total a=%s%s', (select total from public.vip_statements where id = st), E'\n');
  insert into public.creator_private (id, pay_currency, pay_name, pay_iban, pay_bic)
    values (a, 'EUR', 'Lucia Rodriguez', 'ES9121000418450200051332', 'CAIXESBBXXX')
    on conflict (id) do update set pay_currency = 'EUR', pay_name = 'Lucia Rodriguez', pay_iban = 'ES9121000418450200051332', pay_bic = 'CAIXESBBXXX';
  j := public.vip_approve_statement(st);
  out := out || format('approved a -> %s; invoice stage=%s amount=%s desc=%s%s', j,
    (select stage from public.invoices where id = (j ->> 'invoice_id')::uuid),
    (select amount from public.invoices where id = (j ->> 'invoice_id')::uuid),
    (select description from public.invoices where id = (j ->> 'invoice_id')::uuid), E'\n');

  -- Noemi has no bank details: approved, reward made, invoice not yet; saving details later raises it AND the trigger approves it
  j := public.vip_approve_statement(st_b);
  out := out || format('approved b -> %s%s', j, E'\n');
  insert into public.creator_private (id, pay_currency, pay_name, pay_iban, pay_bic)
    values (b, 'EUR', 'Noemi X', 'ES7921000813610123456789', 'CAIXESBBXXX')
    on conflict (id) do update set pay_currency = 'EUR', pay_name = 'Noemi X', pay_iban = 'ES7921000813610123456789', pay_bic = 'CAIXESBBXXX';
  begin
    perform public.raise_invoice_for_reward((j ->> 'reward_id')::uuid);
  exception when others then out := out || 'raise err ' || sqlerrm || E'\n'; end;
  out := out || format('late invoice for b: stage=%s linked=%s%s',
    (select i.stage from public.invoices i where i.reward_id = (j ->> 'reward_id')::uuid),
    (select invoice_id is not null from public.vip_statements where id = st_b), E'\n');

  -- THE FENCE
  -- (1) a VIP cannot enter a challenge
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  begin
    insert into public.submissions (creator_id, challenge_id, platform, video_url)
      select a, id, 'YouTube', 'https://www.youtube.com/watch?v=zzzzzzzzzzz' from public.challenges where status = 'active' limit 1;
    out := out || 'VIP ENTERED A CHALLENGE (bad)' || E'\n';
  exception when others then out := out || 'vip cannot enter: ' || sqlerrm || E'\n'; end;
  select count(*) into seen from public.challenges;
  out := out || format('challenges visible to a vip: %s%s', seen, E'\n');
  select count(*) into seen from public.channels where visibility = 'vip';
  out := out || format('vip rooms visible to a vip: %s%s', seen, E'\n');
  reset role;

  -- (2) a creator who is not a VIP sees no VIP room and cannot post in one
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where status = 'active' and not is_admin and not is_test and country = 'Spain' and id not in (a, b) limit 1), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', (select id from public.profiles where status = 'active' and not is_admin and not is_test and country = 'Spain' and id not in (a, b) limit 1)::text, true);
  set local role authenticated;
  select count(*) into seen from public.channels where visibility = 'vip';
  out := out || format('vip rooms visible to a normal Spanish creator: %s%s', seen, E'\n');
  select id into v_ch from public.channels where visibility = 'vip' and key = 'vip' limit 1;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.profiles where status = 'active' and not is_admin and not is_test and country = 'Spain' and id not in (a, b) limit 1), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.messages (sender_id, community_id, channel_id, channel, body)
      select auth.uid(), c.community_id, c.id, c.key, 'sneaking in' from public.channels c where c.visibility = 'vip' and c.key = 'vip' limit 1;
    out := out || 'NON-VIP POSTED IN A VIP ROOM (bad)' || E'\n';
  exception when others then out := out || 'non-vip cannot post in a vip room: ' || sqlerrm || E'\n'; end;
  reset role;

  raise exception E'REHEARSAL\n%', out;
end $$;
