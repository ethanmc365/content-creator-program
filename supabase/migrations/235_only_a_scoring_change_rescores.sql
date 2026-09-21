-- 235: ONLY A CHANGE THAT CAN MOVE A SCORE RESCORES THE CHALLENGE.
--
-- `trg_points_on_submission` fired a whole-challenge recalculation on EVERY
-- update to an entry - including the ones view-sync makes that change nothing
-- a score reads: `views_synced_at`, `views_sync_error`, `platform_video_id`,
-- thumbnails. Measured 21 Sep 2026 on a 600-entry copy of the Global
-- Challenge: 0.28s a recalculation, 0.14s for an update that changed nothing.
-- Every failed read and every unchanged count paid that, one row at a time.
--
-- Split: insert and delete always rescore; an update rescores only when a
-- column the scoring reads actually changed.
drop trigger if exists trg_points_on_submission on public.submissions;

create trigger trg_points_on_submission
  after insert or delete on public.submissions
  for each row execute function public.trg_recalc_points();

create trigger trg_points_on_submission_update
  after update of logged_views, submitted_at, challenge_id, creator_id, platform on public.submissions
  for each row
  when (old.logged_views is distinct from new.logged_views
     or old.submitted_at is distinct from new.submitted_at
     or old.challenge_id is distinct from new.challenge_id
     or old.creator_id   is distinct from new.creator_id
     or old.platform     is distinct from new.platform)
  execute function public.trg_recalc_points();
