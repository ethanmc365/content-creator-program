-- THE CREATOR'S OWN PATH THROUGH THE GLOBAL CHALLENGE, AS THE CREATOR (RLS on).
--
-- The two full-size rehearsals load entries as the database owner. This one
-- does what the phone does: as an ordinary signed-in creator it enters a video
-- on a live copy of the Global Challenge, ticks the weekly hook, tries to claim
-- a hook on somebody else's entry (must be refused), then the view sync (as the
-- service role) moves the video past 2,000 and the points must follow:
-- 1 for the video + 4 for the 2,500 tier + 3 for the hook = 8.
-- Ends by raising, so it all rolls back (including any queued pushes).
do $test$
declare
  draft constant uuid := '93c6a3c9-7c42-4f92-ad1f-cfcb60dae5a5';
  ch uuid; cm uuid; hook uuid;
  me uuid; other uuid;
  sub uuid; theirs uuid;
  checks jsonb := '[]'::jsonb;
  ok boolean; n int; pts numeric; refused boolean := false;
begin
  select community_id into cm from challenges where id = draft;
  select m.profile_id into me from community_members m join profiles p on p.id = m.profile_id
   where m.community_id = cm and m.status = 'active' and p.status = 'active' and not p.is_admin and not coalesce(p.is_test,false)
   order by p.created_at limit 1;
  select m.profile_id into other from community_members m join profiles p on p.id = m.profile_id
   where m.community_id = cm and m.status = 'active' and p.status = 'active' and not p.is_admin and not coalesce(p.is_test,false)
     and p.id <> me order by p.created_at limit 1;

  insert into challenges (title, description, status, scoring, threshold_mode, start_date, end_date, community_id, platforms, prize_currency, prize_structure)
  select 'ZZ creator path (rolled back)', '', 'active', 'points', threshold_mode, now() - interval '1 day', now() + interval '27 days', community_id, platforms, prize_currency, prize_structure
    from challenges where id = draft returning id into ch;
  insert into point_rules (community_id, challenge_id, kind, label, points, threshold, max_points, prompt, min_views, period_days, position, is_active)
  select community_id, ch, kind, label, points, threshold, max_points, prompt, min_views, period_days, position, is_active
    from point_rules where challenge_id = draft;
  insert into point_rules (community_id, challenge_id, kind, label, points, max_points, prompt, min_views, position, is_active)
  values (cm, ch, 'bonus', 'Week 1 hook', 3, 9, 'Did you use this week''s hook?', 2000, 50, true) returning id into hook;

  -- somebody else's entry, made by the owner
  insert into submissions (creator_id, challenge_id, community_id, platform, video_url, caption, submitted_at)
  values (other, ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/other1', 'x', now()) returning id into theirs;

  -- NOW AS THE CREATOR
  perform set_config('request.jwt.claims', json_build_object('sub', me, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into submissions (creator_id, challenge_id, community_id, platform, video_url, caption)
  values (me, ch, cm, 'Instagram', 'https://www.instagram.com/reel/zzpath1/', 'my entry') returning id into sub;
  insert into submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id) values (sub, hook, me, ch);
  begin
    insert into submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id) values (theirs, hook, me, ch);
  exception when others then refused := true;
  end;
  select count(*) into n from submissions where challenge_id = ch;  -- what a creator can see
  reset role;
  perform set_config('request.jwt.claims', '', true);

  checks := checks || jsonb_build_object('check', 'creator entered a video on the live challenge', 'pass', sub is not null);
  checks := checks || jsonb_build_object('check', 'creator cannot claim a hook on someone else''s entry', 'pass', refused);

  -- THE VIEW SYNC, as it writes
  update submissions set logged_views = 2500, views_source = 'instagram' where id = sub;
  select coalesce(sum(points),0) into pts from point_awards where challenge_id = ch and creator_id = me;
  checks := checks || jsonb_build_object('check', 'points after sync: 1 video + 4 tier + 3 hook', 'got', pts, 'want', 8, 'pass', pts = 8);
  select count(*) into n from results where challenge_id = ch and creator_id = me and final_views = 8;
  checks := checks || jsonb_build_object('check', 'leaderboard shows the 8', 'got', n, 'want', 1, 'pass', n = 1);

  select bool_and((x ->> 'pass')::boolean) into ok from jsonb_array_elements(checks) x;
  raise exception '%', (case when ok then 'REPORT all passed ' else 'FAILED ' end) || jsonb_pretty(checks);
end
$test$;
