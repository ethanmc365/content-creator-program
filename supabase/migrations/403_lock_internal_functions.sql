-- 403: INTERNAL FUNCTIONS THAT ANY SIGNED-IN CREATOR COULD CALL (13 Oct 2026 audit).
--
-- Same shape as 375. Found by listing every SECURITY DEFINER function that `authenticated` may execute and that no
-- page, edge function, policy or view calls, then reading each one for a caller check. These have none:
--
--   * invoice_terms(reward) returned payment_snapshot() - the bank details - of whoever owns that reward. 375 locked
--     payment_snapshot itself; this wrapper around it was missed.
--   * clear_system_error(source, key) let anybody mark an ops alert resolved, i.e. silence an outage warning.
--   * resnapshot_invoice, sync_referral_rewards, mark_points_participation rewrite invoices / mint referral vouchers /
--     participation marks on demand (idempotent, but nobody outside the database should drive them).
--   * tracked_video_candidates is the admin video tracker's raw feed.
--   * the cron entry points (ops_health_check, ops_snapshot_stats, ping_cron_health, recalc_queued_points,
--     send_voucher_nudges) and two self-tests (certificate_selftest, check_instagram_reads).
--
-- Every caller of these is itself SECURITY DEFINER (functions, triggers) or pg_cron, so they run as the owner and keep
-- working once `authenticated` loses EXECUTE. `owner_only_rpcs` is re-applied by the event trigger on every
-- CREATE/ALTER FUNCTION, so recreating one later cannot quietly re-expose it.
insert into public.owner_only_rpcs (proname, why) values
  ('invoice_terms',              'returned ANY creator''s bank details (payment_snapshot) for a reward id; invoice triggers only'),
  ('clear_system_error',         'any creator could resolve (silence) an ops alert; health checks only'),
  ('resnapshot_invoice',         'rewrites an unsent invoice''s payment snapshot; definer callers only'),
  ('sync_referral_rewards',      'mints referral vouchers for any referrer; triggers only'),
  ('mark_points_participation',  'writes participation marks; points recalc and triggers only'),
  ('tracked_video_candidates',   'admin video tracker feed, no scope check; sync_tracked_videos_internal only'),
  ('ops_health_check',           'cron'),
  ('ops_snapshot_stats',         'cron'),
  ('ping_cron_health',           'cron'),
  ('recalc_queued_points',       'cron'),
  ('send_voucher_nudges',        'notification sender (cron)'),
  ('certificate_selftest',       'self test (writes and clears a system error)'),
  ('check_instagram_reads',      'health check (cron via ping_cron_health)')
on conflict (proname) do nothing;

select count(*) from public.lock_down_definer_functions();
