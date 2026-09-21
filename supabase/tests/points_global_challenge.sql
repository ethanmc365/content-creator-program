-- THE GLOBAL CHALLENGE, PLAYED THROUGH AGAINST THE REAL DATABASE, THEN UNDONE.
--
-- Run it with any SQL runner that shows the error text (the MCP execute_sql
-- tool, the dashboard's SQL editor). It builds a throwaway points challenge
-- with the Global Challenge's exact rules, enters seven real creators with
-- entries whose times and view counts are chosen so every rule is exercised,
-- checks every number, and ENDS BY RAISING, which rolls the whole lot back:
-- no challenge, entry, point, reward, invoice, notification or push survives.
--
-- The raised message is the report. It starts "REPORT" when every check
-- passed and "FAILED" when any did, followed by the checks as JSON.
--
-- The seven, and what each one is for:
--   A  12 videos, 3 a week, one at 120k      per-video cap (10), tiers, a claimed
--                                             bonus that only one video qualifies for,
--                                             consistency
--   B   5 videos, weeks 1-3 only, 2.5k-35k   five tiers, a bonus cap of 9 hit by
--                                             the first three, no consistency
--   C   7 videos, weeks 1 and 4, 999 views   an admin-given bonus held back by the
--                                             2,000-view gate, then released by a sync
--   D   6 videos, one at 1M, last one 5 min    top tier, consistency with an entry
--       after the deadline                    after the deadline counted in week 4
--   E   6 videos, 0 views                    participation, qualifies second
--   F   8 videos in one day, 0 views         participation (qualifies first) AND
--                                             most committed: two vouchers, one person
--   G   3 videos                             nothing but per-video points
do $test$
declare
  cm  constant uuid := '7ab54714-5c20-4ade-a19d-0f2e02929d44';   -- Worldwide
  s0  constant timestamptz := '2026-09-20 23:00:00+00';          -- Mon 21 Sep 00:00 London
  e0  constant timestamptz := '2026-10-18 22:59:00+00';          -- Sun 18 Oct 23:59 London
  wk  constant interval := interval '7 days';
  ch  uuid;
  p   uuid[];
  r_a uuid; r_b uuid; r_c uuid;
  checks jsonb := '[]'::jsonb;
  ok  boolean := true;
  v   numeric;
  t   text;
  n   integer;

  -- one line of the report
  procedure_dummy integer;
begin
  select array_agg(id order by created_at) into p
    from (select id, created_at from public.profiles
           where not coalesce(is_test, false) and status = 'active'
           order by created_at limit 7) x;
  if coalesce(array_length(p, 1), 0) < 7 then raise exception 'FAILED need 7 active profiles'; end if;

  insert into public.challenges (
    title, description, status, scoring, threshold_mode, start_date, end_date, community_id,
    platforms, prize_currency, prize_structure,
    participation_threshold, participation_prize, participation_cap,
    participation_reward_type, participation_amount, participation_scope, extra_awards)
  values (
    'ZZ points test (rolled back)', '', 'active', 'points', 'highest', s0, e0, cm,
    array['TikTok','Instagram'], 'EUR',
    '[{"place":"1st","prize":"€150 cash","amount":"150","type":"cash"},
      {"place":"2nd","prize":"€100 cash","amount":"100","type":"cash"},
      {"place":"3rd","prize":"€75 Tryp.com voucher","amount":"75","type":"voucher"}]',
    6, '€15 Tryp.com voucher', 2, 'voucher', 15, 'outside_prizes',
    '[{"id":"mc1","kind":"most_committed","label":"Most committed","prize":"€20 Tryp.com voucher","amount":20,"type":"voucher"}]')
  returning id into ch;

  -- The Global Challenge's rules, exactly.
  insert into public.point_rules (community_id, challenge_id, kind, label, points, threshold, max_points, position, is_active)
  values (cm, ch, 'per_post', 'Video posted', 1, null, 10, 0, true);
  insert into public.point_rules (community_id, challenge_id, kind, label, points, threshold, position, is_active)
  select cm, ch, 'views_threshold', format('Passed %s views', t.v), t.p, t.v, 1 + t.i, true
    from (values (1,1000,1),(2,2500,4),(3,5000,6),(4,10000,9),(5,20000,13),(6,35000,18),
                 (7,60000,24),(8,100000,32),(9,200000,42),(10,500000,60),(11,1000000,75)) t(i, v, p);
  insert into public.point_rules (community_id, challenge_id, kind, label, points, max_points, prompt, min_views, position, is_active)
  values (cm, ch, 'bonus', 'Week 1 hook', 3, 9, 'Did you use this week''s hook?', 2000, 20, true)
  returning id into r_a;
  insert into public.point_rules (community_id, challenge_id, kind, label, points, max_points, prompt, min_views, position, is_active)
  values (cm, ch, 'bonus', 'Team pick', 3, 9, null, 2000, 21, true)
  returning id into r_b;
  insert into public.point_rules (community_id, challenge_id, kind, label, points, period_days, position, is_active)
  values (cm, ch, 'consistency', 'Posted in all 4 weeks', 5, 7, 22, true)
  returning id into r_c;

  -- Entries. caption = a tag the checks below can find them by.
  insert into public.submissions (creator_id, challenge_id, community_id, platform, video_url, caption, logged_views, submitted_at, views_source)
  select p[x.who], ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/' || x.tag, x.tag, x.views, x.at, 'manual'
    from (values
      -- A: 3 a week for 4 weeks; A1 is the big one
      (1,'A1', 120000, s0 + interval '1 day'),
      (1,'A2', 1500, s0 + interval '2 day'), (1,'A3', 1500, s0 + interval '3 day'),
      (1,'A4', 1500, s0 + wk + interval '1 day'), (1,'A5', 1500, s0 + wk + interval '2 day'), (1,'A6', 1500, s0 + wk + interval '3 day'),
      (1,'A7', 1500, s0 + 2*wk + interval '1 day'), (1,'A8', 1500, s0 + 2*wk + interval '2 day'), (1,'A9', 1500, s0 + 2*wk + interval '3 day'),
      (1,'A10',1500, s0 + 3*wk + interval '1 day'), (1,'A11',1500, s0 + 3*wk + interval '2 day'), (1,'A12',1500, s0 + 3*wk + interval '3 day'),
      -- B: weeks 1-3 only
      (2,'B1', 2500, s0 + interval '1 day 1 hour'), (2,'B2', 5000, s0 + interval '2 day 1 hour'),
      (2,'B3', 10000, s0 + wk + interval '1 day 1 hour'), (2,'B4', 20000, s0 + 2*wk + interval '1 day 1 hour'),
      (2,'B5', 35000, s0 + 2*wk + interval '2 day 1 hour'),
      -- C: five in week 1, two in week 4
      (3,'C1', 999, s0 + interval '1 day 3 hour'), (3,'C2', 999, s0 + interval '2 day 3 hour'), (3,'C3', 999, s0 + interval '3 day 3 hour'),
      (3,'C4', 999, s0 + interval '4 day 3 hour'), (3,'C5', 999, s0 + interval '5 day 3 hour'),
      (3,'C6', 999, s0 + 3*wk + interval '1 day 3 hour'), (3,'C7', 999, s0 + 3*wk + interval '2 day 3 hour'),
      -- D: the million, and a last entry 30 seconds after the deadline
      (4,'D1', 1000000, s0 + interval '1 day 4 hour'), (4,'D2', 0, s0 + wk + interval '1 day 4 hour'),
      (4,'D3', 0, s0 + 2*wk + interval '1 day 4 hour'), (4,'D4', 0, s0 + 2*wk + interval '2 day 4 hour'),
      (4,'D5', 0, s0 + 2*wk + interval '3 day 4 hour'), (4,'D6', 0, e0 + interval '5 minute'),
      -- E: six over two weeks; sixth lands after A's sixth
      (5,'E1', 0, s0 + interval '1 day 2 hour'), (5,'E2', 0, s0 + interval '2 day 2 hour'), (5,'E3', 0, s0 + interval '3 day 2 hour'),
      (5,'E4', 0, s0 + wk + interval '1 day 2 hour'), (5,'E5', 0, s0 + wk + interval '2 day 2 hour'), (5,'E6', 0, s0 + wk + interval '3 day 2 hour'),
      -- F: eight on the first day
      (6,'F1', 0, s0 + interval '1 day 5 hour'), (6,'F2', 0, s0 + interval '1 day 6 hour'), (6,'F3', 0, s0 + interval '1 day 7 hour'),
      (6,'F4', 0, s0 + interval '1 day 8 hour'), (6,'F5', 0, s0 + interval '1 day 9 hour'), (6,'F6', 0, s0 + interval '1 day 10 hour'),
      (6,'F7', 0, s0 + interval '1 day 11 hour'), (6,'F8', 0, s0 + interval '1 day 12 hour'),
      -- G
      (7,'G1', 0, s0 + interval '1 day 13 hour'), (7,'G2', 0, s0 + interval '2 day 13 hour'), (7,'G3', 0, s0 + interval '3 day 13 hour')
    ) x(who, tag, views, at);

  -- Claims: A claims the hook on A1-A4 (only A1 is past 2,000); B on all five;
  -- the team gives C the "team pick" on C1 and C2 (both under 2,000).
  insert into public.submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id)
  select s.id, r_a, s.creator_id, ch from public.submissions s
   where s.challenge_id = ch and s.caption in ('A1','A2','A3','A4','B1','B2','B3','B4','B5');
  insert into public.submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id)
  select s.id, r_b, s.creator_id, ch from public.submissions s
   where s.challenge_id = ch and s.caption in ('C1','C2');

  -- ---------------------------------------------------------------- helpers
  -- (inline: a DO block cannot declare functions)

  -- 1. POINTS, per creator, before the view sync
  for n in 1..7 loop
    select coalesce(sum(points), 0) into v from public.point_awards where challenge_id = ch and creator_id = p[n];
    t := case n when 1 then 'A' when 2 then 'B' when 3 then 'C' when 4 then 'D' when 5 then 'E' when 6 then 'F' else 'G' end;
    checks := checks || jsonb_build_object('check', 'points ' || t, 'got', v,
      'want', (array[61, 64, 7, 86, 6, 8, 3])[n], 'pass', v = (array[61, 64, 7, 86, 6, 8, 3])[n]);
  end loop;

  -- 2. THE BREAKDOWN for B: tiers 4+6+9+13+18 = 50, bonus capped at 9, no consistency
  select coalesce(sum(points) filter (where rule_id = r_a), 0) into v from public.point_awards where challenge_id = ch and creator_id = p[2];
  checks := checks || jsonb_build_object('check', 'B bonus capped at 9 (5 claims x 3)', 'got', v, 'want', 9, 'pass', v = 9);
  select count(*) into n from public.point_awards where challenge_id = ch and creator_id = p[2] and rule_id = r_c;
  checks := checks || jsonb_build_object('check', 'B no consistency (missed week 4)', 'got', n, 'want', 0, 'pass', n = 0);
  select coalesce(sum(points) filter (where rule_id = r_a), 0) into v from public.point_awards where challenge_id = ch and creator_id = p[1];
  checks := checks || jsonb_build_object('check', 'A bonus only on the video past 2,000', 'got', v, 'want', 3, 'pass', v = 3);
  select count(*) into n from public.point_awards where challenge_id = ch and creator_id = p[4] and rule_id = r_c;
  checks := checks || jsonb_build_object('check', 'D consistency with an entry 5 min after the deadline', 'got', n, 'want', 1, 'pass', n = 1);
  select coalesce(sum(points) filter (where rule_id = r_b), 0) into v from public.point_awards where challenge_id = ch and creator_id = p[3];
  checks := checks || jsonb_build_object('check', 'C admin bonus held back under 2,000 views', 'got', v, 'want', 0, 'pass', v = 0);

  -- 3. THE VIEW SYNC CARRIES C1 PAST 2,000: tier +1 and the held bonus +3
  update public.submissions set logged_views = 2000 where challenge_id = ch and caption = 'C1';
  select coalesce(sum(points), 0) into v from public.point_awards where challenge_id = ch and creator_id = p[3];
  checks := checks || jsonb_build_object('check', 'C after sync to 2,000 (7 + 1 + 3)', 'got', v, 'want', 11, 'pass', v = 11);

  -- 4. THE LEADERBOARD FOLLOWS: D, B, A, C, F, E, G
  select string_agg(case creator_id when p[1] then 'A' when p[2] then 'B' when p[3] then 'C' when p[4] then 'D'
                                    when p[5] then 'E' when p[6] then 'F' else 'G' end || final_views, ' ' order by rank)
    into t from public.results where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'leaderboard', 'got', t, 'want', 'D86 B64 A61 C11 F8 E6 G3', 'pass', t = 'D86 B64 A61 C11 F8 E6 G3');

  -- 5. PARTICIPATION, outside the prize places, first 2: F and E earn, C waits, A and D won places
  select string_agg(case creator_id when p[1] then 'A' when p[3] then 'C' when p[4] then 'D' when p[5] then 'E' when p[6] then 'F' else '?' end
                    || ':' || status, ' ' order by coalesce(seat, 99), creator_id)
    into t from public.challenge_prize_standings_internal(ch) where slot = 'participation';
  checks := checks || jsonb_build_object('check', 'participation, outside prizes, cap 2', 'got', t,
    'want', 'F:earned E:earned C:waitlisted', 'pass', t like 'F:earned E:earned C:waitlisted%' and t like '%A:excluded%' and t like '%D:excluded%');

  -- 6. MOST COMMITTED outside the top 3: F (8), then C (7), then E (6)
  select string_agg(case creator_id when p[3] then 'C' when p[5] then 'E' when p[6] then 'F' else '?' end || ':' || status, ' ' order by seat)
    into t from public.challenge_prize_standings_internal(ch) where slot = 'award:mc1';
  checks := checks || jsonb_build_object('check', 'most committed, outside top 3', 'got', t,
    'want', 'F:earned C:contender E:contender', 'pass', t = 'F:earned C:contender E:contender');

  -- 7. SWITCHED TO EVERYONE: first two to six entries are F then A
  update public.challenges set participation_scope = 'everyone',
         extra_awards = jsonb_set(extra_awards, '{0,scope}', '"anyone"') where id = ch;
  select string_agg(case creator_id when p[1] then 'A' when p[6] then 'F' else '?' end, ' ' order by seat)
    into t from public.challenge_prize_standings_internal(ch) where slot = 'participation' and status = 'earned';
  checks := checks || jsonb_build_object('check', 'participation, everyone, cap 2', 'got', t, 'want', 'F A', 'pass', t = 'F A');
  select string_agg(case creator_id when p[1] then 'A' else '?' end, ' ')
    into t from public.challenge_prize_standings_internal(ch) where slot = 'award:mc1' and status = 'earned';
  checks := checks || jsonb_build_object('check', 'most committed, anyone', 'got', t, 'want', 'A', 'pass', t = 'A');
  update public.challenges set participation_scope = 'outside_prizes',
         extra_awards = jsonb_set(extra_awards, '{0,scope}', '"outside"') where id = ch;

  -- 8. EDITING MID-CHALLENGE RESCORES: bonus cap 9 -> 6 takes B to 61
  update public.point_rules set max_points = 6 where id = r_a;
  select coalesce(sum(points), 0) into v from public.point_awards where challenge_id = ch and creator_id = p[2];
  checks := checks || jsonb_build_object('check', 'bonus cap lowered to 6 mid-challenge', 'got', v, 'want', 61, 'pass', v = 61);
  update public.point_rules set max_points = 9 where id = r_a;

  -- 9. MOVING THE DEADLINE MOVES THE WINDOWS: three weeks, and B has all three
  update public.challenges set end_date = s0 + 3*wk - interval '1 minute' where id = ch;
  select count(*) into n from public.point_awards where challenge_id = ch and creator_id = p[2] and rule_id = r_c;
  checks := checks || jsonb_build_object('check', 'deadline moved to 3 weeks: B now consistent', 'got', n, 'want', 1, 'pass', n = 1);
  update public.challenges set end_date = e0 where id = ch;
  select count(*) into n from public.point_awards where challenge_id = ch and creator_id = p[2] and rule_id = r_c;
  checks := checks || jsonb_build_object('check', 'deadline restored: B loses it again', 'got', n, 'want', 0, 'pass', n = 0);

  -- 10. THE PAYOUT: three places, two participation vouchers, one most-committed
  --     voucher - and F holds two vouchers, which the old unique index refused.
  perform * from public.award_challenge_prizes_internal(ch, false);
  select string_agg(case creator_id when p[1] then 'A' when p[2] then 'B' when p[4] then 'D' when p[5] then 'E' when p[6] then 'F' else '?' end
                    || ':' || prize_slot || ':' || reward_type || ':' || amount::int, ' ' order by prize_slot, amount desc, creator_id)
    into t from public.rewards where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'rewards created', 'got', t,
    'want', 'F:award:mc1:voucher:20 E/F:participation:voucher:15 D:place:cash:150 B:place:cash:100 A:place:voucher:75',
    'pass', (select count(*) from public.rewards where challenge_id = ch) = 6
        and exists (select 1 from public.rewards where challenge_id = ch and creator_id = p[6] and prize_slot = 'award:mc1' and amount = 20 and reward_type = 'voucher')
        and exists (select 1 from public.rewards where challenge_id = ch and creator_id = p[6] and prize_slot = 'participation')
        and exists (select 1 from public.rewards where challenge_id = ch and creator_id = p[5] and prize_slot = 'participation')
        and exists (select 1 from public.rewards where challenge_id = ch and creator_id = p[4] and prize_slot = 'place' and amount = 150 and reward_type = 'cash')
        and exists (select 1 from public.rewards where challenge_id = ch and creator_id = p[2] and prize_slot = 'place' and amount = 100 and reward_type = 'cash')
        and exists (select 1 from public.rewards where challenge_id = ch and creator_id = p[1] and prize_slot = 'place' and amount = 75 and reward_type = 'voucher')
        and not exists (select 1 from public.rewards where challenge_id = ch and creator_id = p[3]));

  -- 11. RUNNING IT AGAIN PAYS NOBODY TWICE
  perform * from public.award_challenge_prizes_internal(ch, false);
  select count(*) into n from public.rewards where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'second payout run adds nothing', 'got', n, 'want', 6, 'pass', n = 6);

  -- 12. A CREATOR CANNOT CLAIM A BONUS SHE WAS NOT ASKED (as the real role)
  perform set_config('request.jwt.claims', json_build_object('sub', p[7], 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id)
    select s.id, r_b, p[7], ch from public.submissions s where s.challenge_id = ch and s.caption = 'G1';
    checks := checks || jsonb_build_object('check', 'creator claiming an admin-only bonus is refused', 'got', 'allowed', 'want', 'refused', 'pass', false);
  exception when others then
    checks := checks || jsonb_build_object('check', 'creator claiming an admin-only bonus is refused', 'got', 'refused', 'want', 'refused', 'pass', true);
  end;
  begin
    insert into public.submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id)
    select s.id, r_a, p[7], ch from public.submissions s where s.challenge_id = ch and s.caption = 'G1';
    checks := checks || jsonb_build_object('check', 'creator claiming the hook bonus is allowed', 'got', 'allowed', 'want', 'allowed', 'pass', true);
  exception when others then
    checks := checks || jsonb_build_object('check', 'creator claiming the hook bonus is allowed', 'got', sqlerrm, 'want', 'allowed', 'pass', false);
  end;

  select bool_and((c ->> 'pass')::boolean) into ok from jsonb_array_elements(checks) c;
  raise exception '%', (case when ok then 'REPORT all passed ' else 'FAILED ' end) || jsonb_pretty(checks);
end
$test$;
