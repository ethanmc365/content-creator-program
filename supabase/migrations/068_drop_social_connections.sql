-- 068: automatic view syncing, added and then withdrawn.
--
-- The TikTok Display API needs a reviewed developer app, and Instagram needs a
-- Meta app review on top of a professional account. That is more standing setup
-- than the programme needs while an admin can log the numbers in a couple of
-- minutes, so the feature came out before it ever went live.
--
-- Safe to drop outright: nothing ever connected (0 rows in social_connections)
-- and no submission was ever synced (views_source 'manual' everywhere,
-- platform_video_id all null).
select cron.unschedule('social-view-sync');
drop function if exists public.run_social_sync();
drop function if exists public.my_social_connections();

alter table public.submissions drop column if exists platform_video_id;
alter table public.submissions drop constraint if exists submissions_views_source_check;
alter table public.submissions drop column if exists views_source;
alter table public.submissions drop column if exists views_synced_at;

drop table if exists private.social_tokens;
drop table if exists private.oauth_states;
drop table if exists public.social_connections;
