-- ============================================================================
-- 110 - view counts on four platforms, and Facebook as a first-class platform
--
-- Extends migration 108 (TikTok + Instagram) to YouTube and Facebook, and adds
-- Facebook everywhere the other three already were: a creator's profile link,
-- the platforms a challenge counts, the badges, the podium.
--
-- Two new facts a submission can carry:
--
--   views_approx   Facebook only ever states a ROUNDED figure logged out
--                  ("5.6K views" in the og:title, and nothing exact anywhere in
--                  the page). That is fine for a sense of scale and NOT fine for
--                  separating two entries a hundred views apart, so the number is
--                  stored with a flag and the admin is told to type an exact one
--                  when it matters.
--
--   trial_reel     An Instagram trial reel is shown only to non-followers and
--                  never appears on the author's profile, so it has no readable
--                  count and never will. It is a distinct outcome from "we could
--                  not read it", because retrying will never help and the only
--                  fix is to ask the creator.
-- ============================================================================
set check_function_bodies = off;

alter table public.submissions
  add column if not exists views_approx boolean not null default false;

comment on column public.submissions.views_approx is
  'The stored count is rounded, not exact. Facebook logged-out only states "5.6K views". Type an exact number by hand when a ranking turns on it.';

alter table public.submissions drop constraint if exists submissions_views_source_check;
alter table public.submissions add constraint submissions_views_source_check
  check (views_source in ('manual', 'tiktok', 'instagram', 'youtube', 'facebook'));

alter table public.view_snapshots drop constraint if exists view_snapshots_source_check;
alter table public.view_snapshots add constraint view_snapshots_source_check
  check (source in ('manual', 'tiktok', 'instagram', 'youtube', 'facebook'));

-- Facebook joins the three social links a creator can already give us.
alter table public.profiles
  add column if not exists facebook_url text;

-- Automatic views are no longer a thing to switch on: they are how views are
-- read, on every challenge, now and in future. Only the cadence is a choice.
update public.app_settings
   set value = jsonb_set(coalesce(value, '{}'::jsonb), '{enabled}', 'true'::jsonb)
 where key = 'view_sync';
