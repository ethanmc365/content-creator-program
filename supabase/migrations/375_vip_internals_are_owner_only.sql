-- 375: THE VIP INTERNALS WERE CALLABLE BY ANY SIGNED-IN CREATOR (9 Oct 2026 audit).
--
-- Found by calling them as a plain, non-VIP creator over PostgREST's role:
--   * vip_pay_out(p_profile, kind, auto) has NO caller check. It reads any VIP's balance, writes a payout reward and a
--     negative ledger row, and approves the invoice - so any creator could force any VIP's wallet to be paid out, outside
--     the payout window and the stay-in rules.
--   * vip_balance(p_profile) returned any VIP's balance.
--   * vip_run_sync, vip_send_join_notices, vip_nudges, vip_requirement_nudges, vip_record_requirements, vip_ensure_month,
--     vip_ensure_rooms and the cron senders could all be fired by hand (notification spam, scraper load, month rows).
--
-- NONE of them is called from the app or an edge function. Their callers are SECURITY DEFINER functions, triggers and
-- pg_cron, which run as the owner and so keep working once `authenticated` loses EXECUTE. It is the GRANT that is fixed,
-- not an in-function check, for the reason in 179: `owner_only_rpcs` is re-applied by the event trigger on every
-- CREATE/ALTER FUNCTION, so a recreate cannot quietly re-expose them.
insert into public.owner_only_rpcs (proname, why) values
  ('vip_pay_out',               'PROVEN callable by any creator: pays out and approves the invoice for any VIP wallet'),
  ('vip_balance',               'any VIP''s balance, readable by any creator'),
  ('vip_payment_ready',         'whether any creator has payment details'),
  ('vip_window',                'any VIP''s payout window'),
  ('vip_unfinished',            'whether any VIP profile is unfinished'),
  ('vip_req_check',             'any VIP''s stay-in numbers'),
  ('vip_trend_core',            'any VIP''s daily views'),
  ('vip_daily_gained',          'any VIP''s daily views'),
  ('vip_month_rows',            'VIP month statistics, no scope check'),
  ('vip_month_stats',           'VIP month statistics, no scope check'),
  ('vip_video_counted',         'internal helper'),
  ('vip_run_sync',              'fires the view scraper (cron/definer only)'),
  ('vip_send_join_notices',     'notification to any creator (trigger only)'),
  ('vip_ensure_month',          'writes month rows (definer only)'),
  ('vip_ensure_rooms',          'writes rooms (definer only)'),
  ('vip_record_requirements',   'writes stay-in reviews (cron only)'),
  ('vip_requirement_nudges',    'notification sender (cron)'),
  ('vip_nudges',                'notification sender (cron)'),
  ('vip_weekly_digest',         'notification sender (cron)'),
  ('vip_milestones',            'notification sender (cron)'),
  ('vip_rate_review_reminders', 'notification sender (cron)'),
  ('vip_award_perks',           'writes perk rewards (cron)'),
  ('vip_close_due',             'closes VIP months (cron)')
on conflict (proname) do nothing;

select count(*) from public.lock_down_definer_functions();

-- ... and the same sweep found `payment_snapshot(p_creator, p_currency)`: it returned ANY creator's bank details (IBAN,
-- sort code, account number, address) to any signed-in creator. Only the invoice triggers call it. Locked the same way,
-- with the other helpers that took somebody else's id and had no caller check and no caller in the app.
insert into public.owner_only_rpcs (proname, why) values
  ('payment_snapshot',      'returned ANY creator''s bank details to any signed-in creator; only invoice triggers call it'),
  ('profile_age',           'any creator''s age'),
  ('agreement_render',      'renders an agreement with any creator''s details'),
  ('agreement_for',         'internal lookup'),
  ('vip_terms_ok',          'internal lookup'),
  ('vip_metric',            'any VIP''s lifetime numbers'),
  ('creator_market_name',   'internal lookup')
on conflict (proname) do nothing;
select count(*) from public.lock_down_definer_functions();
