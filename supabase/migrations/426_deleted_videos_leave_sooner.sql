-- 426: A DELETED VIDEO LEAVES AT THE NEXT READ, NOT A DAY AND A HALF LATER (15 Oct 2026).
--
-- Migration 414 removes an entry once two syncs at least 20 hours apart both see its video gone. Entries are read every
-- 6 hours, so the second sighting only counted at the read after the 20-hour mark: three dead TikToks (TikTok's own
-- "deleted or private" code 10204 on both the embed and the video page, checked by hand) were still on the boards 14 and
-- 18 hours after they were first seen gone, with up to a day still to wait. Ethan: deleted videos should leave on their own.
--
-- Two sightings are still required, so one bad answer from a platform can never remove a live video - but 5 hours apart,
-- which is the next scheduled read (6-hourly) rather than the fourth.

create or replace function submission_remove_when_gone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.views_sync_error = 'removed' and new.removed_seen_at is not null
     and new.removed_seen_at < now() - interval '5 hours' then
    perform submission_leave_if_gone(new.id);
  end if;
  return new;
end $$;

select lock_down_definer_functions();

-- HOUSEKEEPING FROM THE 15 OCT LOAD CHECK. The database is not strained (35 of 60 connections, 100% cache hits, ~2.5%
-- of one core averaged over eight days, every cron green). reconcile_milestones (1.1s every 30 minutes) is left as it
-- is: nothing else moves milestone progress, so slowing it would delay awards for a negligible saving. The one cheap
-- win is the six foreign keys the performance advisor lists without a covering index.
create index if not exists market_signup_settings_host_profile_id_idx on public.market_signup_settings (host_profile_id);
create index if not exists market_signup_settings_updated_by_idx on public.market_signup_settings (updated_by);
create index if not exists scheduled_approvals_scheduled_by_idx on public.scheduled_approvals (scheduled_by);
create index if not exists scheduled_approvals_vip_programme_idx on public.scheduled_approvals (vip_programme);
create index if not exists vip_video_questions_created_by_idx on public.vip_video_questions (created_by);
create index if not exists vip_video_questions_programme_id_idx on public.vip_video_questions (programme_id);
