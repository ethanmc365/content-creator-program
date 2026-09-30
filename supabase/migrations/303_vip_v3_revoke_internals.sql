-- 303: REVOKE THE INTERNAL HELPERS OF 299 FROM SIGNED-IN USERS (30 Sep 2026).
--
-- 299 revoked these in the same migration as it created them, and the database's default privileges granted
-- `authenticated` again afterwards (the same trap 294 documents). Left open, any signed-in creator could ask
-- `vip_metric` for anybody's lifetime views. They are called only from other definer functions and cron.
revoke all on function public.vip_metric(uuid, text) from authenticated;
revoke all on function public.vip_award_perks() from authenticated;
revoke all on function public.vip_scope_ok(uuid) from authenticated;
