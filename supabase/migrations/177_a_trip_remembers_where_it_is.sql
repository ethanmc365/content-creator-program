-- ============================================================================
-- 177 - a trip remembers where it is
--
-- `collab_posts` stored a town and a country as text and no coordinates, so
-- `CreatorMap` resolved every one of them through the geocoder AT RENDER TIME,
-- IN THE BROWSER, ONE AT A TIME, in a `for` loop with an `await` in it. The
-- answers were cached in that browser's localStorage and nowhere else, so every
-- new browser, every private window and every new team member started again
-- from nothing.
--
-- Measured on production, 2 Sep 2026, signing in on a clean browser:
-- 89 requests to load the hub, of which 22 were geocode calls, totalling
-- 23.1 SECONDS. That is the "it takes a while to load" report, and on a
-- connection slower than the one it was measured on it is the difference
-- between a page that arrives late and a page that never arrives - the profile
-- fetch is competing with two dozen serial lookups for the same connection,
-- and when it loses three times in a row the app signs the user out and sends
-- them back to the login screen. That is the whole of "it logs in, shows a
-- loading screen, then crashes back to login".
--
-- The browser was always the wrong place to do this. A trip's coordinates do
-- not depend on who is looking, so they belong on the row, resolved once, for
-- everybody. `city_lat` / `city_lng` are named to match `profiles`, which has
-- had exactly this pair for months and is exactly why creators were never the
-- slow half.
--
-- BACKFILLED THE SAME DAY: all 27 rows, 26 distinct places, through Nominatim
-- at one request a second with the project's own User-Agent. Two needed a hand
-- (a request timed out, and "Pristen" is a misspelling of Pristina). Zero rows
-- are left without coordinates, and one creator profile in the same state was
-- resolved too. A clean browser now makes NO geocode calls to draw the map.
-- ============================================================================
alter table public.collab_posts
  add column if not exists city_lat double precision,
  add column if not exists city_lng double precision;

comment on column public.collab_posts.city_lat is
  'Resolved once, server side, so the map never geocodes in the browser. See migration 177.';
