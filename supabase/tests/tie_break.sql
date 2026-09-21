-- A TIE GOES TO THE MOST VIEWS, THEN TO WHOEVER POSTED FIRST (migration 239).
--
-- Three creators on a copy of the live Global Challenge draft, each with ONE
-- entry in the same view tier and the same week, so all three score exactly
-- the same points. A has the most views; B and C have identical views and B
-- posted first. The board must read A, B, C - and must do so whatever order
-- their uuids happen to sort in, which is what decided it before.
-- Ends by raising so everything rolls back; the message is the report.
do $test$
declare
  draft constant uuid := '93c6a3c9-7c42-4f92-ad1f-cfcb60dae5a5';
  ch uuid; cm uuid; s0 timestamptz;
  p uuid[];
  a uuid; b uuid; c uuid;
  checks jsonb := '[]'::jsonb;
  ok boolean;
  pts integer[];
  got text;
begin
  select community_id, start_date into cm, s0 from public.challenges where id = draft;
  -- Pick three creators so that their ids sort AGAINST the expected order:
  -- A is the largest uuid, C the smallest. The old tie-break (creator_id)
  -- would have put C first.
  select array_agg(id order by id desc) into p
    from (select id from public.profiles where not coalesce(is_test, false) and status = 'active' order by id limit 3) x;
  a := p[1]; b := p[2]; c := p[3];

  insert into public.challenges (title, description, status, scoring, threshold_mode, start_date, end_date, community_id,
    platforms, prize_currency, prize_structure)
  select 'ZZ tie test (rolled back)', '', 'active', 'points', threshold_mode, start_date, end_date, community_id,
         platforms, prize_currency, prize_structure
    from public.challenges where id = draft
  returning id into ch;
  insert into public.point_rules (community_id, challenge_id, kind, label, points, threshold, max_points, prompt, min_views, period_days, position, is_active)
  select community_id, ch, kind, label, points, threshold, max_points, prompt, min_views, period_days, position, is_active
    from public.point_rules where challenge_id = draft;

  insert into public.submissions (creator_id, challenge_id, community_id, platform, video_url, caption, logged_views, submitted_at, views_source) values
    (c, ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/c', 'c', 2100, s0 + interval '2 days', 'manual'),
    (b, ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/b', 'b', 2100, s0 + interval '1 day', 'manual'),
    (a, ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/a', 'a', 2400, s0 + interval '3 days', 'manual');
  perform public.recalc_challenge_points_internal(ch);
  perform public.rebuild_challenge_results(ch);

  select array_agg(final_views order by rank) into pts from public.results where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'all three score the same points', 'got', pts,
    'pass', pts[1] = pts[2] and pts[2] = pts[3] and pts[1] > 0);

  select string_agg(case creator_id when a then 'A' when b then 'B' when c then 'C' end, '' order by rank) into got
    from public.results where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'tie broken by total views, then first to post', 'got', got, 'want', 'ABC', 'pass', got = 'ABC');

  select bool_and((x ->> 'pass')::boolean) into ok from jsonb_array_elements(checks) x;
  raise exception '%', (case when ok then 'REPORT all passed ' else 'FAILED ' end) || jsonb_pretty(checks);
end
$test$;
