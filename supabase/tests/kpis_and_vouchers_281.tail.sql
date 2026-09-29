
-- ===================== REHEARSAL (everything below rolls back) =====================
do $$
declare
  v_ww uuid := '7ab54714-5c20-4ade-a19d-0f2e02929d44';
  v_uk uuid := 'c419b328-7d5f-429d-8ead-0778c497fac4';
  v_es uuid := '7a45f900-a53f-4820-9c85-d4e4d7b8076d';
  v_out text := '';
  r record;
  old_views numeric; new_views numeric;
  old_part numeric; new_part numeric;
  old_rec numeric; new_rec numeric;
  old_ch numeric; new_ch numeric;
  m text; det jsonb; num numeric; den numeric; card numeric; endv numeric;
  a uuid; b uuid; c uuid; cr uuid; g jsonb; n int; nn int;
  tot numeric; nb int;
begin
  perform set_config('request.jwt.claims', '{"sub":"c2fa2b7b-7491-481d-82ac-6ce6f6583eff","role":"authenticated"}', true);

  -- 1. the four old metrics did not move
  select value into new_views from kpi_actuals(v_ww, 2026, 3) where metric = 'views';
  select coalesce(sum(s.logged_views),0) into old_views from submissions s join challenges c on c.id=s.challenge_id join profiles p on p.id=s.creator_id
   where s.submitted_at >= '2026-07-01' and s.submitted_at < '2026-10-01' and coalesce(p.is_test,false)=false;
  if old_views <> new_views then raise exception 'views moved: % vs %', old_views, new_views; end if;
  select value into new_part from kpi_actuals(v_ww, 2026, 3) where metric = 'creators_participated';
  select count(distinct s.creator_id) into old_part from submissions s join profiles p on p.id=s.creator_id
   where s.submitted_at >= '2026-07-01' and s.submitted_at < '2026-10-01' and coalesce(p.is_test,false)=false;
  if old_part <> new_part then raise exception 'participated moved: % vs %', old_part, new_part; end if;
  select value into new_rec from kpi_actuals(v_ww, 2026, 3) where metric = 'creators_recruited';
  select count(*) into old_rec from community_members cm join profiles p on p.id=cm.profile_id
   where cm.community_id=v_ww and cm.joined_at >= '2026-07-01' and cm.joined_at < '2026-10-01' and coalesce(p.is_test,false)=false;
  if old_rec <> new_rec then raise exception 'recruited moved: % vs %', old_rec, new_rec; end if;
  select value into new_ch from kpi_actuals(v_ww, 2026, 3) where metric = 'challenges_run';
  select count(*) into old_ch from challenges where start_date >= '2026-07-01' and start_date < '2026-10-01';
  if old_ch <> new_ch then raise exception 'challenges moved: % vs %', old_ch, new_ch; end if;
  v_out := v_out || format(E'old four unchanged (views %s, participated %s, recruited %s, challenges %s)\n', new_views, new_part, new_rec, new_ch);

  -- 2. every metric for Total, Global, UK, Spain (September)
  for r in select * from (values ('Total', v_ww, 'all'), ('Global', v_ww, 'global'), ('UK', v_uk, 'all'), ('Spain', v_es, 'all')) t(name, id, basis) loop
    v_out := v_out || format(E'\n== %s September 2026 ==\n', r.name);
    for m in select metric || ' = ' || value from kpi_actuals(r.id, 2026, 3, 9, r.basis) loop
      v_out := v_out || '  ' || m || E'\n';
    end loop;
  end loop;

  -- 3. detail: every metric runs, and a ratio's series ends on the card's number
  for m in select unnest(array['challenges_run','creators_recruited','creators_participated','views','entries','avg_entries_per_creator','entries_per_challenge','avg_creators_per_challenge','avg_views_per_entry','avg_views_per_creator','videos_10k','top_video_views','participation_rate','first_time_creators','return_rate','activation_rate','referrals','creators_total','chat_messages','game_players','connections_made']) loop
    det := kpi_detail(v_ww, 2026, 3, 9, m, 'all');
    select value into card from kpi_actuals(v_ww, 2026, 3, 9, 'all') where metric = m;
    select coalesce(sum((e->>'v')::numeric),0) into num from jsonb_array_elements(det->'series') e;
    if det->'series_den' is not null and jsonb_typeof(det->'series_den') = 'array' then
      select coalesce(sum((e->>'v')::numeric),0) into den from jsonb_array_elements(det->'series_den') e;
    else den := null; end if;
    endv := case when den is not null then (case when den > 0 then num/den else 0 end)
                 when det->>'den_total' is not null then case when (det->>'den_total')::numeric > 0 then 100*num/(det->>'den_total')::numeric else 0 end
                 else num end;
    v_out := v_out || format(E'detail %-28s card=%-10s series_end=%-10s %s\n', m, card, round(endv,2), case when m in ('return_rate','activation_rate','participation_rate','top_video_views','creators_total') then '(rate/stock, checked by eye)' when abs(endv - card) <= 0.06 * greatest(1, abs(card)) then 'OK' else 'MISMATCH' end);
  end loop;

  -- 4. vouchers: combine, recode, use, split
  select id into cr from profiles where is_admin = false and is_test = false and status = 'active' limit 1;
  insert into rewards (creator_id, reward_type, amount, currency, status, distributed_at, voucher_code) values (cr, 'voucher', 10, 'EUR', 'distributed', now(), null) returning id into a;
  insert into rewards (creator_id, reward_type, amount, currency, status, distributed_at, voucher_code) values (cr, 'voucher', 10, 'EUR', 'distributed', now(), 'OLD10') returning id into b;
  select count(*) into nb from notifications where recipient_id = cr and created_at > now() - interval '1 minute';
  g := admin_combine_vouchers(array[a, b], 'TRYP-20-TEST', 'combined');
  select count(*) into nn from notifications where recipient_id = cr and created_at > now() - interval '1 minute';
  if (g->>'total')::numeric <> 20 then raise exception 'combine total %', g; end if;
  if nn - nb <> 1 then raise exception 'expected ONE notification, got %', nn - nb; end if;
  if (select count(distinct voucher_code) from rewards where id in (a,b)) <> 1 then raise exception 'codes differ'; end if;
  perform admin_set_voucher_code(a, 'TRYP-20-RECODED');
  if (select count(*) from rewards where id in (a,b) and voucher_code = 'TRYP-20-RECODED') <> 2 then raise exception 'recode did not reach the group'; end if;
  perform admin_set_voucher_used(a, true);
  if (select count(*) from rewards where id in (a,b) and used_at is not null) <> 2 then raise exception 'used did not reach the group'; end if;
  begin
    perform admin_combine_vouchers(array[a, b], 'X');
    raise exception 'combining a used voucher should have failed';
  exception when others then
    if sqlerrm not like '%already been used%' then raise; end if;
  end;
  perform admin_set_voucher_used(a, false);
  n := admin_split_vouchers(a);
  if n <> 2 or (select count(*) from rewards where id in (a,b) and voucher_group is null and voucher_code is null) <> 2 then raise exception 'split failed'; end if;
  begin
    perform admin_set_voucher_code(a, '');
    raise exception 'blank code without chat should have failed';
  exception when others then
    if sqlerrm not like '%sent by chat%' then raise; end if;
  end;
  perform admin_set_voucher_code(a, '', 'chat');
  if (select issued_via from rewards where id = a) <> 'chat' then raise exception 'chat flag'; end if;
  v_out := v_out || E'\nvouchers: combine (one notification), recode reaches group, used reaches group, used blocks combine, split, chat OK\n';
  v_out := v_out || format(E'legacy vouchers marked chat: %s\n', (select count(*) from rewards where issued_via = 'chat' and id not in (a,b)));

  -- 5. a market row cannot hold a global-basis target
  begin
    insert into kpi_targets (community_id, year, quarter, metric, label, target_value, basis, created_by) values (v_uk, 2026, 4, 'views', 'Views', 1, 'global', 'c2fa2b7b-7491-481d-82ac-6ce6f6583eff');
    raise exception 'global basis on a market should have failed';
  exception when others then
    if sqlerrm not like '%Only the Worldwide scope%' then raise; end if;
  end;
  v_out := v_out || E'global basis refused on a market row: OK\n';

  raise exception E'REHEARSAL PASSED - rolled back\n%', v_out;
end $$;
