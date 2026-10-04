-- 326 (4 Oct 2026): hand out the welcome voucher (migration 325) without anybody pressing anything. Hourly, for the live challenges
-- whose team set an amount; a challenge with no amount does nothing, so this is inert until it is switched on in the challenge's editor.
select cron.unschedule('challenge-welcome-vouchers') where exists (select 1 from cron.job where jobname = 'challenge-welcome-vouchers');
select cron.schedule('challenge-welcome-vouchers', '23 * * * *',
  $$select public.challenge_welcome_rewards(id) from public.challenges where status = 'active' and coalesce(welcome_amount, 0) > 0$$);
