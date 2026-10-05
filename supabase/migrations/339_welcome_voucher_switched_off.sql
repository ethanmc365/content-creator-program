-- 339 - THE WELCOME VOUCHER FOR NEW CREATORS IS SWITCHED OFF (5 Oct 2026).
--
-- Ethan: "get rid of that function for now ... it doesn't make sense regarding the new creators
-- and not the ones that have been actually taking part." No challenge has it set and no
-- welcome reward was ever paid (0 rows). The form fields and the brief card are removed in the app;
-- this stops the hourly job. The columns and `challenge_welcome_rewards` are kept, dormant, so
-- bringing it back is a UI change and one `cron.schedule`.
do $$
begin
  perform cron.unschedule('challenge-welcome-vouchers');
exception when others then null;
end $$;
