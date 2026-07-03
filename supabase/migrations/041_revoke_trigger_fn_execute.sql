-- 041_revoke_trigger_fn_execute.sql
-- Match the migration-020 hardening: trigger functions fire as their owner
-- regardless of grants, so no API role needs EXECUTE. Revoke it from the new
-- trigger functions (035/037) so they aren't callable via /rest/v1/rpc.
-- (dm_send_allowed / is_admin / is_member / can_post keep authenticated EXECUTE
--  because RLS policies invoke them.)
revoke all on function public.on_connection_request() from public, anon, authenticated;
revoke all on function public.on_connection_accepted() from public, anon, authenticated;
revoke all on function public.on_collab_interest() from public, anon, authenticated;
revoke all on function public.on_collab_post_overlap() from public, anon, authenticated;
revoke all on function public.on_dm_reply_connect() from public, anon, authenticated;
