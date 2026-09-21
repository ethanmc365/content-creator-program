-- THE PARTICIPATION VOUCHER ON POINTS (migration 241), PLAYED THROUGH AGAINST
-- THE REAL DATABASE, THEN UNDONE.
--
-- Same shape as points_global_challenge.sql: builds a throwaway points
-- challenge whose voucher is earned at 20 POINTS rather than at N videos,
-- enters four real creators, checks who qualifies, in what order, what the
-- payout creates, and ENDS BY RAISING so nothing survives. The raised message
-- is the report: "REPORT all passed" or "FAILED", then the checks as JSON.
--
--   A  4 videos, 0 views        5 + 5 + 5 + 5 = 20: reaches the bar FIRST
--   B  2 videos, one at 1,000   5 + 5 + 10     = 20: reaches it second
--   C  3 videos, 0 views        15, until a view sync takes one to 1,000: 25,
--                               third to reach it, and top of the board
--   D  1 video                  5: never close
do $test$
declare
  cm  constant uuid := '7ab54714-5c20-4ade-a19d-0f2e02929d44';   -- Worldwide
  s0  constant timestamptz := now() - interval '3 days';
  e0  constant timestamptz := now() + interval '20 days';
  ch  uuid;
  p   uuid[];
  checks jsonb := '[]'::jsonb;
  ok  boolean := true;
  t   text;
  n   integer;
begin
  select array_agg(id order by created_at) into p
    from (select id, created_at from public.profiles
           where not coalesce(is_test, false) and status = 'active'
           order by created_at limit 4) x;
  if coalesce(array_length(p, 1), 0) < 4 then raise exception 'FAILED need 4 active profiles'; end if;

  insert into public.challenges (
    title, description, status, scoring, threshold_mode, start_date, end_date, community_id,
    platforms, prize_currency, prize_structure,
    participation_basis, participation_threshold, participation_prize, participation_cap,
    participation_reward_type, participation_amount, participation_scope)
  values (
    'ZZ points voucher test (rolled back)', '', 'active', 'points', 'highest', s0, e0, cm,
    array['TikTok'], 'EUR',
    '[{"place":"1st","prize":"€50 cash","amount":"50","type":"cash"}]',
    'points', 20, '€10 Tryp.com voucher', 1, 'voucher', 10, 'everyone')
  returning id into ch;

  insert into public.point_rules (community_id, challenge_id, kind, label, points, threshold, max_points, position, is_active)
  values (cm, ch, 'per_post', 'Video posted', 5, null, 50, 0, true),
         (cm, ch, 'views_threshold', 'Passed 1,000 views', 10, 1000, null, 1, true);

  -- In this order, one at a time, so each is its own rescore.
  insert into public.submissions (creator_id, challenge_id, community_id, platform, video_url, caption, logged_views, submitted_at, views_source)
  select p[x.who], ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/' || x.tag, x.tag, x.views, s0 + x.h * interval '1 hour', 'manual'
    from (values (1,'A1',0,1),(1,'A2',0,2),(1,'A3',0,3),(1,'A4',0,4)) x(who, tag, views, h);
  insert into public.submissions (creator_id, challenge_id, community_id, platform, video_url, caption, logged_views, submitted_at, views_source)
  select p[x.who], ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/' || x.tag, x.tag, x.views, s0 + x.h * interval '1 hour', 'manual'
    from (values (2,'B1',1000,5),(2,'B2',0,6)) x(who, tag, views, h);
  insert into public.submissions (creator_id, challenge_id, community_id, platform, video_url, caption, logged_views, submitted_at, views_source)
  select p[x.who], ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/' || x.tag, x.tag, x.views, s0 + x.h * interval '1 hour', 'manual'
    from (values (3,'C1',0,7),(3,'C2',0,8),(3,'C3',0,9),(4,'D1',0,10)) x(who, tag, views, h);

  -- 1. POINTS, from the standings function itself
  select string_agg(case creator_id when p[1] then 'A' when p[2] then 'B' else '?' end || points, ' ' order by seat)
    into t from public.challenge_prize_standings_internal(ch) where slot = 'participation';
  checks := checks || jsonb_build_object('check', 'qualified at 20 points (C has 15, D 5)', 'got', t, 'want', 'A20 B20', 'pass', t = 'A20 B20');

  -- 2. FIRST TO REACH IT, CAP 1: A earns, B waits
  select string_agg(case creator_id when p[1] then 'A' when p[2] then 'B' else '?' end || ':' || status, ' ' order by seat)
    into t from public.challenge_prize_standings_internal(ch) where slot = 'participation';
  checks := checks || jsonb_build_object('check', 'cap 1: first to 20 points earns', 'got', t, 'want', 'A:earned B:waitlisted', 'pass', t = 'A:earned B:waitlisted');

  -- 3. A VIEW SYNC TAKES C PAST THE BAR, and C is third to reach it
  update public.submissions set logged_views = 1000 where challenge_id = ch and caption = 'C1';
  select count(*) into n from public.challenge_participation_marks where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'three creators marked', 'got', n, 'want', 3, 'pass', n = 3);
  update public.challenges set participation_cap = 2 where id = ch;
  select string_agg(case creator_id when p[1] then 'A' when p[2] then 'B' when p[3] then 'C' else '?' end || ':' || status, ' ' order by seat)
    into t from public.challenge_prize_standings_internal(ch) where slot = 'participation';
  checks := checks || jsonb_build_object('check', 'cap 2 after the sync', 'got', t, 'want', 'A:earned B:earned C:waitlisted', 'pass', t = 'A:earned B:earned C:waitlisted');

  -- 4. OUTSIDE THE PRIZES: C won 1st (25 points), so C is excluded, not waiting
  update public.challenges set participation_scope = 'outside_prizes' where id = ch;
  select string_agg(case creator_id when p[1] then 'A' when p[2] then 'B' when p[3] then 'C' else '?' end || ':' || status, ' ' order by coalesce(seat, 99))
    into t from public.challenge_prize_standings_internal(ch) where slot = 'participation';
  checks := checks || jsonb_build_object('check', 'outside prizes', 'got', t, 'want', 'A:earned B:earned C:excluded', 'pass', t = 'A:earned B:earned C:excluded');
  select string_agg(case creator_id when p[1] then 'A' when p[2] then 'B' when p[3] then 'C' when p[4] then 'D' end || final_views, ' ' order by rank)
    into t from public.results where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'leaderboard', 'got', t, 'want', 'C25 B20 A20 D5', 'pass', t = 'C25 B20 A20 D5');

  -- 5. THE PAYOUT CREATES THE TWO VOUCHERS AND THE PLACE, AND SAYS "POINTS"
  perform * from public.award_challenge_prizes_internal(ch, false);
  select count(*) into n from public.rewards
   where challenge_id = ch and prize_slot = 'participation' and reward_type = 'voucher' and amount = 10
     and creator_id in (p[1], p[2]) and payment_notes like '%(20 points)%';
  checks := checks || jsonb_build_object('check', 'two €10 vouchers, noted in points', 'got', n, 'want', 2, 'pass', n = 2);
  select count(*) into n from public.rewards where challenge_id = ch and creator_id = p[3] and prize_slot = 'place' and amount = 50;
  checks := checks || jsonb_build_object('check', 'C paid for 1st', 'got', n, 'want', 1, 'pass', n = 1);
  perform * from public.award_challenge_prizes_internal(ch, false);
  select count(*) into n from public.rewards where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'second payout run adds nothing', 'got', n, 'want', 3, 'pass', n = 3);

  -- 6. RAISING THE BAR TO 25 POINTS: only C is over it, and C is excluded
  update public.challenges set participation_threshold = 25, participation_scope = 'everyone' where id = ch;
  select string_agg(case creator_id when p[3] then 'C' else '?' end || ':' || status, ' ')
    into t from public.challenge_prize_standings_internal(ch) where slot = 'participation';
  checks := checks || jsonb_build_object('check', 'bar raised to 25', 'got', t, 'want', 'C:earned', 'pass', t = 'C:earned');

  -- 7. BACK TO VIDEOS: 3 videos qualifies A (4) and C (3), not B (2)
  update public.challenges set participation_basis = 'entries', participation_threshold = 3 where id = ch;
  select string_agg(case creator_id when p[1] then 'A' when p[3] then 'C' else '?' end, ' ' order by seat)
    into t from public.challenge_prize_standings_internal(ch) where slot = 'participation';
  checks := checks || jsonb_build_object('check', 'videos basis unchanged', 'got', t, 'want', 'A C', 'pass', t = 'A C');

  select bool_and((c ->> 'pass')::boolean) into ok from jsonb_array_elements(checks) c;
  raise exception '%', (case when ok then 'REPORT all passed ' else 'FAILED ' end) || jsonb_pretty(checks);
end
$test$;
