-- ============================================================================
-- 017 - lock notify_user / notify_all to server-side callers only
--   These SECURITY DEFINER helpers insert notification rows (which trigger
--   push + email). By Postgres default they were EXECUTE-able by PUBLIC, so any
--   signed-in user could POST a notification (and an email) to any account via
--   PostgREST. Nothing in the app calls them from the client - only triggers
--   and admin RPCs do, and those run as the function owner, so revoking API
--   access does not affect them.
-- ============================================================================
revoke execute on function public.notify_user(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_all(uuid, text, text, text, text) from public, anon, authenticated;
