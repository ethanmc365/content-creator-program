-- 077: Spain, set up the way a market is meant to be set up.
--
-- This is the reference implementation. Opening Portugal, Germany, Romania or
-- the Nordics should be a copy of what this migration does, which is why every
-- value here is a row rather than a constant in the code.
--
-- A market is "properly set up" when it has:
--   a lead, a currency, a CPM target        (075)
--   its own #general and #announcements     (076)
--   its own purposeful rooms                (075)
--   scoring rules it can run a challenge on (here)
--   a live challenge                        (here)
--
-- SAFE TO RUN WHILE THE UK CHALLENGE IS LIVE. The Spanish challenge is
-- inserted with status='active', which fires `on_challenge_live`. That trigger
-- was made scope-aware in 076, so it calls `notify_community(spain, ...)` and
-- reaches Spain's members only. Spain currently has none, so this inserts zero
-- notifications. Before 076 this exact statement would have put a Spanish
-- challenge in the notification bell of all 44 UK creators.

-- --------------------------------------------------------- market templates
-- Rules with challenge_id null are the market's DEFAULTS: what a new challenge
-- in Spain starts life with. A manager edits these once and every future
-- challenge inherits them.
insert into public.point_rules (community_id, challenge_id, kind, label, points, threshold, max_points, position)
select c.id, null, v.kind, v.label, v.points, v.threshold, v.max_points, v.position
from public.communities c
cross join (values
  ('per_post',        'Video posted',            1,  null,  10, 0),
  ('views_threshold', 'Passed 5,000 views',      2,  5000,  null, 1),
  ('views_threshold', 'Passed 10,000 views',     5,  10000, null, 2),
  ('views_threshold', 'Passed 50,000 views',     10, 50000, null, 3)
) as v(kind, label, points, threshold, max_points, position)
where c.slug = 'spain'
  and not exists (
    select 1 from public.point_rules r
    where r.community_id = c.id and r.challenge_id is null
  );

-- ------------------------------------------------------------ the challenge
-- One live challenge so the market has something to show: the live card, the
-- brief, the standings and the submission flow all need a challenge to hang
-- off, and an empty market cannot demonstrate any of them.
insert into public.challenges (
  title, description, rules, hashtags, platforms,
  start_date, end_date, status, scoring, threshold_mode,
  community_id, prize_currency, objective, cpm_target, format, audience, content_type
)
select
  'Descubre España con Tryp.com',
  'Show Spain the way you see it. Post a video featuring Tryp.com and a Spanish destination, and every video you put out earns points toward the leaderboard.',
  E'Post as many videos as you like: each one earns a point, up to ten.\nViews earn more on top, so a video that travels is worth chasing.\nTag @tryp.com and use the hashtags so we can count it.',
  '#TrypEspana #DescubreEspana',
  '{Instagram,TikTok}',
  now(), now() + interval '30 days', 'active', 'points', 'highest',
  -- content_type is constrained to free/suggested/talking/hooks/other.
  c.id, 'EUR', 'views', 0.50, 'monthly', 'general', 'free'
from public.communities c
where c.slug = 'spain'
  and not exists (
    select 1 from public.challenges ch
    where ch.community_id = c.id
  );

-- The challenge's own copy of the rules. Copied FROM the template rather than
-- pointing at it: editing the market default later must not silently rescore a
-- challenge people have already competed in.
insert into public.point_rules (community_id, challenge_id, kind, label, points, threshold, max_points, position)
select t.community_id, ch.id, t.kind, t.label, t.points, t.threshold, t.max_points, t.position
from public.point_rules t
join public.communities c on c.id = t.community_id and c.slug = 'spain'
join public.challenges ch on ch.community_id = c.id
where t.challenge_id is null
  and not exists (
    select 1 from public.point_rules r where r.challenge_id = ch.id
  );

-- ----------------------------------------------------------- UK stays prize
-- Belt and braces. The live UK challenge must keep scoring exactly the way it
-- does today; `scoring` already defaults to 'prize', and this makes that
-- explicit rather than implicit for anyone reading the data later.
update public.challenges ch
set scoring = 'prize'
from public.communities c
where ch.community_id = c.id and c.slug = 'uk' and ch.scoring <> 'prize';
