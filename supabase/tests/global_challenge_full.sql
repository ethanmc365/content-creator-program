-- THE GLOBAL CHALLENGE AT FULL SIZE, AGAINST THE REAL DATABASE, THEN UNDONE.
--
-- The smaller test beside this one (points_global_challenge.sql) proves each
-- rule with seven hand-placed creators. This one proves the WHOLE CHALLENGE AS
-- CONFIGURED: it copies the live Global Challenge draft - its rules, its ten
-- paid places, its taking-part voucher (first 33, outside the places) and its
-- Most committed award - onto a throwaway challenge, enters 45 real creators
-- with 300-odd entries spread over the four weeks, and then checks every
-- creator's score against an INDEPENDENT calculation written here in plain SQL
-- from the rules as Ethan described them. The engine and this file do not
-- share a line of code, so agreeing is evidence rather than an echo.
--
-- Then it plays the view sync: the exact write `view-sync` makes (a
-- view_snapshots row, then logged_views on the entry, as the service role),
-- carrying entries over tiers and bonus gates and one correction downwards,
-- and re-checks everybody. Then it pays out, twice, and checks the money.
--
-- ENDS BY RAISING, so the whole lot rolls back. The message is the report:
-- "REPORT all passed" or "FAILED", then the checks as JSON.
do $test$
declare
  draft constant uuid := '93c6a3c9-7c42-4f92-ad1f-cfcb60dae5a5';
  ch  uuid;
  cm  uuid;
  s0  timestamptz;
  e0  timestamptz;
  p   uuid[];
  r_hook uuid; r_pick uuid;
  checks jsonb := '[]'::jsonb;
  ok  boolean;
  n   integer; m integer;
  v   numeric;
  t   text;
  -- THE DRAFT'S OWN TAKING-PART TERMS (21 Sep 2026). Read, not assumed: the
  -- draft moved from "6 videos, EUR 15, first 33" to "20 points, EUR 10, no
  -- cap" in one day, and a rehearsal that hard-codes the old terms fails on
  -- the new ones for reasons that have nothing to do with the code.
  d_basis  text; d_thr integer; d_amt numeric; d_cap integer; d_scope text; d_award numeric;
  views_ladder integer[] := array[0,500,999,1000,1999,2000,2499,2500,4999,5000,9999,10000,19999,
                                  20000,35000,59999,60000,100000,200000,500000,1000000,1500000];
begin
  select community_id, start_date, end_date,
         coalesce(participation_basis, 'entries'), participation_threshold, participation_amount, participation_cap, participation_scope,
         (select sum((a ->> 'amount')::numeric) from jsonb_array_elements(coalesce(extra_awards, '[]'::jsonb)) a where a ->> 'kind' = 'most_committed')
    into cm, s0, e0, d_basis, d_thr, d_amt, d_cap, d_scope, d_award
    from public.challenges where id = draft;
  if cm is null then raise exception 'FAILED the Global Challenge draft is gone'; end if;

  select array_agg(id order by created_at) into p
    from (select id, created_at from public.profiles
           where not coalesce(is_test, false) and status = 'active'
           order by created_at limit 45) x;
  if coalesce(array_length(p, 1), 0) < 45 then raise exception 'FAILED need 45 active profiles'; end if;

  -- 1. A COPY OF THE REAL THING, live.
  insert into public.challenges (
    title, description, status, scoring, threshold_mode, start_date, end_date, community_id,
    platforms, prize_currency, prize_structure,
    participation_threshold, participation_prize, participation_cap,
    participation_reward_type, participation_amount, participation_scope, extra_awards, participation_basis)
  -- Loaded as best_video and switched to points once the entries are in:
  -- the points trigger recalculates the whole challenge on EVERY row, which is
  -- right for entries arriving one at a time and 300x the work for a bulk load.
  select 'ZZ full global test (rolled back)', '', 'active', 'best_video', threshold_mode, start_date, end_date, community_id,
         platforms, prize_currency, prize_structure,
         participation_threshold, participation_prize, participation_cap,
         participation_reward_type, participation_amount, participation_scope, extra_awards, participation_basis
    from public.challenges where id = draft
  returning id into ch;

  insert into public.point_rules (community_id, challenge_id, kind, label, points, threshold, max_points, prompt, min_views, period_days, position, is_active)
  select community_id, ch, kind, label, points, threshold, max_points, prompt, min_views, period_days, position, is_active
    from public.point_rules where challenge_id = draft;

  -- The two weekly bonuses Ethan adds mid-challenge: a hook the creator claims
  -- on the submit form, and one the team hands out. Both need 2,000 views and
  -- both are capped at 9 per creator.
  insert into public.point_rules (community_id, challenge_id, kind, label, points, max_points, prompt, min_views, position, is_active)
  values (cm, ch, 'bonus', 'Week 1 hook', 3, 9, 'Did you use this week''s hook?', 2000, 50, true) returning id into r_hook;
  insert into public.point_rules (community_id, challenge_id, kind, label, points, max_points, prompt, min_views, position, is_active)
  values (cm, ch, 'bonus', 'Team pick', 3, 9, null, 2000, 51, true) returning id into r_pick;

  -- 2. ENTRIES. Creator k posts 1 + (k*7 mod 13) videos (1 to 13), spread over
  --    the 28 days by a fixed pattern, views walked along a ladder that sits
  --    on and either side of every tier. Creators 40-45 post in one burst on
  --    day one; creator 45 posts ten minutes after the deadline too.
  insert into public.submissions (creator_id, challenge_id, community_id, platform, video_url, caption, logged_views, submitted_at, views_source)
  select p[k], ch, cm,
         (array['TikTok','Instagram','YouTube','Facebook'])[1 + (k + j) % 4],
         'https://www.tiktok.com/@zz/video/' || k || '0' || j,
         'k' || k || 'j' || j,
         case when k >= 40 then 0 else views_ladder[1 + ((k * 31 + j * 17) % array_length(views_ladder, 1))] end,
         case when k >= 40 then s0 + interval '1 day' + (j || ' minutes')::interval + (k || ' hours')::interval
              else s0 + (((k * 3 + j * 5) % 27) || ' days')::interval + (k || ' minutes')::interval + (j || ' seconds')::interval end,
         'manual'
    from generate_series(1, 45) k
    cross join lateral generate_series(1, case when k >= 40 then 6 + (k - 40) else 1 + (k * 7) % 13 end) j;
  insert into public.submissions (creator_id, challenge_id, community_id, platform, video_url, caption, logged_views, submitted_at, views_source)
  values (p[45], ch, cm, 'TikTok', 'https://www.tiktok.com/@zz/video/late', 'late', 0, e0 + interval '10 minutes', 'manual');

  -- Every third creator claims the hook on every entry; the team gives the
  -- pick to the first two entries of every fifth creator.
  insert into public.submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id)
  select s.id, r_hook, s.creator_id, ch from public.submissions s
   where s.challenge_id = ch and s.creator_id = any (select p[k] from generate_series(3, 45, 3) k);
  insert into public.submission_bonus_claims (submission_id, rule_id, creator_id, challenge_id)
  select id, r_pick, creator_id, ch from (
    select s.id, s.creator_id, row_number() over (partition by s.creator_id order by s.submitted_at) rn
      from public.submissions s
     where s.challenge_id = ch and s.creator_id = any (select p[k] from generate_series(5, 45, 5) k)) x
   where rn <= 2;

  update public.challenges set scoring = 'points' where id = ch;
  perform public.recalc_challenge_points_internal(ch);

  -- 3. THE INDEPENDENT SCORE, per creator, written from the rules:
  --    1 per video capped at 10; the HIGHEST view tier each video passed;
  --    3 per claimed bonus on a video past 2,000, capped at 9 per bonus;
  --    +5 for an entry in every 7-day window from start to deadline, a late
  --    entry counting in the last window.
  create temp table zz_expected on commit drop as
  with rules as (select * from public.point_rules where challenge_id = ch and is_active),
  subs as (select * from public.submissions where challenge_id = ch),
  per_post as (
    select s.creator_id, least(count(*) * (select points from rules where kind = 'per_post'),
                                (select max_points from rules where kind = 'per_post')) pts
      from subs s group by s.creator_id),
  tiers as (
    select s.creator_id, sum(coalesce((select max(r.points) from rules r
                                        where r.kind = 'views_threshold' and r.threshold <= coalesce(s.logged_views, 0)), 0)) pts
      from subs s group by s.creator_id),
  bonus as (
    select c.creator_id, r.id, least(count(*) * r.points, coalesce(r.max_points, 1e9)) pts
      from public.submission_bonus_claims c
      join rules r on r.id = c.rule_id
      join subs s on s.id = c.submission_id
     where coalesce(s.logged_views, 0) >= coalesce(r.min_views, 0)
     group by c.creator_id, r.id, r.points, r.max_points),
  windows as (select ceil(extract(epoch from (e0 - s0)) / (7 * 86400))::int w),
  consistency as (
    select s.creator_id,
           case when count(distinct least(floor(extract(epoch from (s.submitted_at - s0)) / (7 * 86400))::int, (select w from windows) - 1))
                     = (select w from windows)
                then (select points from rules where kind = 'consistency') else 0 end pts
      from subs s group by s.creator_id)
  select pp.creator_id,
         pp.pts + t.pts + coalesce((select sum(b.pts) from bonus b where b.creator_id = pp.creator_id), 0) + c.pts as pts,
         (select count(*) from subs s where s.creator_id = pp.creator_id) as entries
    from per_post pp join tiers t using (creator_id) join consistency c using (creator_id);

  select count(*) into n from zz_expected;
  checks := checks || jsonb_build_object('check', 'creators entered', 'got', n, 'want', 45, 'pass', n = 45);
  select count(*) into n from public.submissions where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'entries', 'got', n, 'pass', n > 250);

  -- 4. EVERY CREATOR'S POINTS = THE INDEPENDENT SCORE
  select count(*), string_agg(e.pts || '<>' || coalesce(a.pts, 0), ', ') into n, t
    from zz_expected e
    left join (select creator_id, sum(points) pts from public.point_awards where challenge_id = ch group by creator_id) a using (creator_id)
   where e.pts <> coalesce(a.pts, 0);
  checks := checks || jsonb_build_object('check', 'all 45 scores match the independent calculation', 'got', coalesce(t, 'no mismatches'), 'pass', n = 0);

  select count(*) into n from zz_expected where pts <> (select coalesce(sum(points), 0) from public.point_awards a where a.challenge_id = ch and a.creator_id = zz_expected.creator_id);
  select count(*) into m from public.point_awards a join public.point_rules r on r.id = a.rule_id where a.challenge_id = ch and r.kind = 'consistency';
  checks := checks || jsonb_build_object('check', 'consistency bonuses given', 'got', m, 'pass', m > 0 and m < 45);
  select count(*) into m from public.point_awards where challenge_id = ch and rule_id = r_hook;
  checks := checks || jsonb_build_object('check', 'hook bonuses given (claimed, past 2,000)', 'got', m, 'pass', m > 0);
  select max(s) into v from (select sum(points) s from public.point_awards where challenge_id = ch and rule_id = r_hook group by creator_id) x;
  checks := checks || jsonb_build_object('check', 'nobody over the hook cap of 9', 'got', v, 'want', 9, 'pass', v <= 9);

  -- 5. THE LEADERBOARD: one row per creator, rank follows score, ranks 1..45
  select count(*) into n from public.results where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'leaderboard rows', 'got', n, 'want', 45, 'pass', n = 45);
  select count(*) into n from public.results r join zz_expected e using (creator_id) where r.challenge_id = ch and r.final_views <> e.pts;
  checks := checks || jsonb_build_object('check', 'leaderboard scores = independent scores', 'got', n, 'want', 0, 'pass', n = 0);
  select count(*) into n from public.results a join public.results b on b.challenge_id = a.challenge_id and b.rank = a.rank + 1
   where a.challenge_id = ch and a.final_views < b.final_views;
  checks := checks || jsonb_build_object('check', 'nobody ranked above a higher score', 'got', n, 'want', 0, 'pass', n = 0);
  select string_agg(rank::text, ',' order by rank) into t from public.results where challenge_id = ch and rank <= 10;
  checks := checks || jsonb_build_object('check', 'ten places filled', 'got', t, 'want', '1,...,10', 'pass', t = '1,2,3,4,5,6,7,8,9,10');

  -- 6. THE VIEW SYNC. Exactly what view-sync writes, as the service role.
  --    (a) a claimed hook video at 999 -> 2,500: tier 1->4 and the hook +3
  --    (b) a 0-view video -> 1,000,000: top tier
  --    (c) a 35,000 video corrected DOWN to 999: loses its tier
  perform set_config('role', 'service_role', true);
  with pick as (
    select s.id, s.creator_id, s.logged_views,
           case when s.logged_views = 999 and exists (select 1 from public.submission_bonus_claims c where c.submission_id = s.id and c.rule_id = r_hook) then 2500
                when s.logged_views = 0 and s.creator_id <> p[45] then 1000000
                when s.logged_views = 35000 then 999 end as new_views,
           row_number() over (partition by case when s.logged_views = 999 then 1 when s.logged_views = 0 then 2 else 3 end order by s.submitted_at) rn
      from public.submissions s
     where s.challenge_id = ch and s.logged_views in (0, 999, 35000))
  select count(*) into n from pick where new_views is not null and rn = 1;
  create temp table zz_synced on commit drop as
    select distinct on (grp) id, creator_id, logged_views old_views, new_views from (
      select s.id, s.creator_id, s.logged_views, s.submitted_at,
             case when s.logged_views = 999 then 1 when s.logged_views = 0 then 2 else 3 end grp,
             case when s.logged_views = 999 and exists (select 1 from public.submission_bonus_claims c where c.submission_id = s.id and c.rule_id = r_hook) then 2500
                  when s.logged_views = 0 and s.creator_id <> p[45] then 1000000
                  when s.logged_views = 35000 then 999 end as new_views
        from public.submissions s where s.challenge_id = ch and s.logged_views in (0, 999, 35000)) x
     where new_views is not null order by grp, submitted_at;
  insert into public.view_snapshots (submission_id, views, source)
    select id, new_views, 'tiktok' from zz_synced;
  update public.submissions s
     set logged_views = z.new_views, views_source = 'tiktok', views_synced_at = now(), views_sync_error = null
    from zz_synced z where s.id = z.id;
  perform set_config('role', 'postgres', true);
  select count(*) into n from zz_synced;
  checks := checks || jsonb_build_object('check', 'view sync moved entries (up, to 1M, and a correction down)', 'got', n, 'want', 3, 'pass', n = 3);

  -- Re-derive the independent score after the sync and compare again.
  delete from zz_expected;
  insert into zz_expected
  with rules as (select * from public.point_rules where challenge_id = ch and is_active),
  subs as (select * from public.submissions where challenge_id = ch),
  per_post as (select creator_id, least(count(*) * (select points from rules where kind = 'per_post'), (select max_points from rules where kind = 'per_post')) pts from subs group by creator_id),
  tiers as (select s.creator_id, sum(coalesce((select max(r.points) from rules r where r.kind = 'views_threshold' and r.threshold <= coalesce(s.logged_views, 0)), 0)) pts from subs s group by s.creator_id),
  bonus as (select c.creator_id, r.id, least(count(*) * r.points, coalesce(r.max_points, 1e9)) pts
              from public.submission_bonus_claims c join rules r on r.id = c.rule_id join subs s on s.id = c.submission_id
             where coalesce(s.logged_views, 0) >= coalesce(r.min_views, 0) group by c.creator_id, r.id, r.points, r.max_points),
  windows as (select ceil(extract(epoch from (e0 - s0)) / (7 * 86400))::int w),
  consistency as (select s.creator_id, case when count(distinct least(floor(extract(epoch from (s.submitted_at - s0)) / (7 * 86400))::int, (select w from windows) - 1)) = (select w from windows)
                    then (select points from rules where kind = 'consistency') else 0 end pts from subs s group by s.creator_id)
  select pp.creator_id, pp.pts + t.pts + coalesce((select sum(b.pts) from bonus b where b.creator_id = pp.creator_id), 0) + c.pts,
         (select count(*) from subs s where s.creator_id = pp.creator_id)
    from per_post pp join tiers t using (creator_id) join consistency c using (creator_id);

  select count(*), string_agg(e.pts || '<>' || coalesce(a.pts, 0), ', ') into n, t
    from zz_expected e
    left join (select creator_id, sum(points) pts from public.point_awards where challenge_id = ch group by creator_id) a using (creator_id)
   where e.pts <> coalesce(a.pts, 0);
  checks := checks || jsonb_build_object('check', 'after the sync, all 45 scores still match', 'got', coalesce(t, 'no mismatches'), 'pass', n = 0);
  select count(*) into n from public.results r join zz_expected e using (creator_id) where r.challenge_id = ch and r.final_views <> e.pts;
  checks := checks || jsonb_build_object('check', 'after the sync, the leaderboard followed', 'got', n, 'want', 0, 'pass', n = 0);
  select count(*) into n from public.view_snapshots v join zz_synced z on z.id = v.submission_id;
  checks := checks || jsonb_build_object('check', 'view history recorded', 'got', n, 'want', 3, 'pass', n = 3);

  -- 7. WHO EARNS THE TAKING-PART VOUCHER, independently, on the draft's terms:
  --    `d_thr` videos (seated by the time of that entry) or `d_thr` points
  --    (seated by when each creator first reached it - in a bulk load that is
  --    one moment, so on points only the SET and the count are checked), from
  --    everyone or only outside the paid places, capped at `d_cap` if set.
  create temp table zz_part on commit drop as
    select creator_id, reached, row_number() over (order by reached, creator_id) seat from (
      select e.creator_id,
             case when d_basis = 'points' then null
                  else (select (array_agg(s.submitted_at order by s.submitted_at))[d_thr]
                          from public.submissions s where s.challenge_id = ch and s.creator_id = e.creator_id) end reached
        from zz_expected e
       where case when d_basis = 'points' then e.pts >= d_thr else e.entries >= d_thr end) x
     where d_scope <> 'outside_prizes'
        or creator_id not in (select creator_id from public.results where challenge_id = ch
                               and rank <= jsonb_array_length((select prize_structure from public.challenges where id = ch)));
  select count(*) into n from zz_part;
  select count(*) into m from public.challenge_prize_standings_internal(ch) where slot = 'participation' and status = 'earned';
  checks := checks || jsonb_build_object('check', format('taking-part vouchers earned (%s %s, cap %s, %s)', d_thr, d_basis, coalesce(d_cap::text, 'none'), d_scope),
    'got', m, 'want', least(n, coalesce(d_cap, n)), 'qualifiers', n, 'pass', m = least(n, coalesce(d_cap, n)) and n > 0);
  select count(*) into n from public.challenge_prize_standings_internal(ch) st
   where st.slot = 'participation' and st.status = 'earned'
     and st.creator_id not in (select creator_id from zz_part);
  checks := checks || jsonb_build_object('check', 'nobody earns it who did not qualify', 'got', n, 'want', 0, 'pass', n = 0);
  select count(*) into n from public.challenge_prize_standings_internal(ch) st
    join public.results r on r.creator_id = st.creator_id and r.challenge_id = ch
   where st.slot = 'participation' and st.status = 'earned' and d_scope = 'outside_prizes'
     and r.rank <= jsonb_array_length((select prize_structure from public.challenges where id = ch));
  checks := checks || jsonb_build_object('check', 'no paid-place winner also gets it (when outside the prizes)', 'got', n, 'want', 0, 'pass', n = 0);

  -- The cap itself: lower it to 5 and check exactly five earn and the rest wait
  -- (and on videos, that they are the first five to reach the bar).
  update public.challenges set participation_cap = 5 where id = ch;
  select count(*) into n from public.challenge_prize_standings_internal(ch) where slot = 'participation' and status = 'earned';
  select string_agg(z.seat::text, ',' order by z.seat) into t
    from public.challenge_prize_standings_internal(ch) st join zz_part z using (creator_id)
   where st.slot = 'participation' and st.status = 'earned';
  checks := checks || jsonb_build_object('check', 'cap 5: exactly five earn', 'got', coalesce(t, n::text), 'want', '1,2,3,4,5',
    'pass', n = least(5, (select count(*) from zz_part)) and (d_basis = 'points' or t = '1,2,3,4,5'));
  select count(*) into n from public.challenge_prize_standings_internal(ch) where slot = 'participation' and status = 'waitlisted';
  checks := checks || jsonb_build_object('check', 'cap 5: the rest are waitlisted', 'got', n, 'pass', n = greatest(0, (select count(*) from zz_part) - 5));
  update public.challenges set participation_cap = (select participation_cap from public.challenges where id = draft) where id = ch;

  -- 8. MOST COMMITTED, independently, when the draft carries one: most entries
  --    outside the top 10, a tie to the better rank. None on the draft means
  --    none is earned.
  if d_award is not null then
    select e.creator_id::text into t from zz_expected e join public.results r on r.creator_id = e.creator_id and r.challenge_id = ch
     where r.rank > 10 order by e.entries desc, r.rank limit 1;
    select string_agg(creator_id::text, ',') into t from (select t as creator_id) x
      where exists (select 1 from public.challenge_prize_standings_internal(ch) st
                    where st.slot like 'award:%' and st.status = 'earned' and st.creator_id::text = t);
    checks := checks || jsonb_build_object('check', 'Most committed goes to the most entries outside the top 10', 'got', coalesce(t, 'someone else'), 'pass', t is not null);
  else
    select count(*) into n from public.challenge_prize_standings_internal(ch) where slot like 'award:%' and status = 'earned';
    checks := checks || jsonb_build_object('check', 'no Most committed award on the draft, none earned', 'got', n, 'want', 0, 'pass', n = 0);
  end if;

  -- 9. THE PAYOUT, then again: ten places (EUR 600 cash), the vouchers.
  perform * from public.award_challenge_prizes_internal(ch, false);
  select coalesce(sum(amount), 0) into v from public.rewards where challenge_id = ch and prize_slot = 'place';
  select count(*) into n from public.rewards where challenge_id = ch and prize_slot = 'place' and reward_type = 'cash';
  checks := checks || jsonb_build_object('check', 'ten cash places, EUR 600', 'got', n || ' / ' || v, 'want', '10 / 600', 'pass', n = 10 and v = 600);
  select count(*) into n from public.rewards w join public.results r on r.creator_id = w.creator_id and r.challenge_id = ch
   where w.challenge_id = ch and w.prize_slot = 'place'
     and w.amount = ((select prize_structure from public.challenges where id = ch) -> (r.rank - 1) ->> 'amount')::numeric;
  checks := checks || jsonb_build_object('check', 'each place paid its own amount to the right rank', 'got', n, 'want', 10, 'pass', n = 10);
  select count(*) into n from public.rewards where challenge_id = ch and prize_slot = 'participation' and reward_type = 'voucher' and amount = d_amt;
  select count(*) into m from public.challenge_prize_standings_internal(ch) where slot = 'participation' and status = 'earned';
  checks := checks || jsonb_build_object('check', format('a EUR %s voucher for each taking-part earner', d_amt), 'got', n, 'want', m, 'pass', n = m and n > 0);
  select count(*) into n from public.rewards where challenge_id = ch and prize_slot like 'award:%' and reward_type = 'voucher';
  checks := checks || jsonb_build_object('check', 'Most committed vouchers', 'got', n, 'want', case when d_award is null then 0 else 1 end,
    'pass', n = case when d_award is null then 0 else 1 end);
  select coalesce(sum(amount), 0) into v from public.rewards where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'total paid = places + vouchers + awards', 'got', v, 'want', 600 + m * d_amt + coalesce(d_award, 0),
    'pass', v = 600 + m * d_amt + coalesce(d_award, 0));
  select count(*) into n from public.rewards where challenge_id = ch;
  perform * from public.award_challenge_prizes_internal(ch, false);
  select count(*) into m from public.rewards where challenge_id = ch;
  checks := checks || jsonb_build_object('check', 'second payout run adds nothing', 'got', m, 'want', n, 'pass', m = n);

  select bool_and((c ->> 'pass')::boolean) into ok from jsonb_array_elements(checks) c;
  raise exception '%', (case when ok then 'REPORT all passed ' else 'FAILED ' end) || jsonb_pretty(checks);
end
$test$;
