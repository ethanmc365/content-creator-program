-- 405: the 30 SECURITY DEFINER functions the 13 Oct audit left unreviewed, plus three found since.
--
-- Method: every definer function `authenticated` may execute, cross-referenced against src/, the edge functions,
-- policies, views, cron and every other function body; each caller checked to be SECURITY DEFINER (so it runs as
-- the owner and keeps working); edge callers checked to use the service role (which keeps EXECUTE).
--
-- Real exposures closed here:
--   * get_view_sync_secrets() returned the YouTube API key and Instagram query ids to any signed-in user.
--   * admin_find_user_id_by_email(email) told any signed-in user whether an address has an account (and its id).
--   * report_system_error(...) let anybody write, or re-open, an ops alert on the admin desk.
--   * place_in_challenge_groups(profile, challenge) let anybody move any creator into a challenge group.
--   * qualifying_referrals(referrer) listed the names of the people any creator referred.
--   * voucher_owed_alert(reward) raised a desk alert on demand.
-- The rest are internal helpers or retired RPCs that no screen calls (some already check their caller; locking
-- them removes surface the app does not use).
insert into public.owner_only_rpcs (proname, why) values
  ('get_view_sync_secrets',          'returned the YouTube API key to any signed-in user; view-sync (service role) only'),
  ('admin_find_user_id_by_email',    'account lookup by email; auth-gate (service role) only'),
  ('calendar_feed',                  'calendar-feed edge function (service role) only'),
  ('view_sync_running',              'view-sync edge function and run_view_sync only'),
  ('report_system_error',            'anyone could write or re-open a desk alert; definer functions and cron only'),
  ('qualifying_referrals',           'listed anyone''s referrals; referral reward functions only'),
  ('place_in_challenge_groups',      'moved any creator into a group; group-placement triggers only'),
  ('voucher_owed_alert',             'desk alert; on_voucher_owed trigger only'),
  ('lock_down_definer_functions',    'grant manager; event trigger and migrations only'),
  ('certificate_audience_ok',        'certificate award helper'),
  ('certificate_serial',             'certificate award helper'),
  ('challenge_prize_places',         'certificate award helper'),
  ('kpi_compute',                    'KPI helper; kpi_actuals / kpi_actuals_batch check the caller'),
  ('posted_before_start',            'early-entry trigger helper'),
  ('vip_claim_blocked',              'claim_vip_invite helper'),
  ('vip_fenced',                     'VIP notice fence helper'),
  ('vip_hidden_profile',             'VIP list helper'),
  ('vip_lock_community',             'views_leaderboard helper'),
  ('vip_manager_ids',                'VIP notification helper'),
  ('award_prizes_caller_is_allowed', 'award_challenge_prizes_internal helper'),
  ('milestone_state',                'milestone_overview / milestone_standings helper'),
  ('vip_update_member',              'vip_requirement_decide / vip_move_back helper; no screen calls it'),
  ('admin_set_screen_text',          'retired: no screen calls it'),
  ('collab_request',                 'retired: no screen calls it'),
  ('collab_respond',                 'retired: no screen calls it'),
  ('collab_cancel',                  'retired: no screen calls it'),
  ('move_creator_market',            'legacy: admin_set_creator_markets replaced it'),
  ('my_unread_rooms',                'retired: no screen calls it'),
  ('reinstate_duplicate',            'retired: no screen calls it'),
  ('vip_accept_terms',               'retired: agreements replaced it'),
  ('vip_clear_history',              'retired: no screen calls it'),
  ('vip_create_invite',              'retired: the permanent VIP link replaced invites'),
  ('vip_revoke_invite',              'retired: the permanent VIP link replaced invites'),
  ('vip_renew_global_link',          'retired: no screen calls it'),
  ('vip_room_key_ok',                'retired: no policy or screen calls it'),
  ('vip_set_review_date',            'retired: no screen calls it')
on conflict (proname) do nothing;

select count(*) from public.lock_down_definer_functions();
