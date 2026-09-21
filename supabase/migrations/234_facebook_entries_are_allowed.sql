-- 234: A FACEBOOK ENTRY IS AN ENTRY.
--
-- The Global Challenge lists Facebook as a platform you can post on, the submit
-- form labels a facebook.com / fb.watch link "Facebook" (lib/utils
-- detectPlatform), and view-sync reads Facebook view counts. The column's CHECK
-- still allowed only Instagram, TikTok, YouTube and Other, so the first creator
-- to enter a Facebook video would have had their submission refused.
-- Found by supabase/tests/global_challenge_full.sql on 21 Sep 2026, before
-- launch. No row is rewritten: the constraint only widens.
alter table public.submissions drop constraint if exists submissions_platform_check;
alter table public.submissions add constraint submissions_platform_check
  check (platform = any (array['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Other']));
