-- ============================================================================
-- 020 - lock down SECURITY DEFINER functions (Supabase advisor 0028/0029)
--   The advisor flags SECURITY DEFINER functions that are EXECUTE-able via the
--   PostgREST API by anon/authenticated. We:
--     * fully revoke the trigger/scheduled functions (never called via the API;
--       triggers fire as the table owner regardless of EXECUTE grants),
--     * keep the admin RPCs callable by authenticated only (they self-check
--       is_admin), never anon,
--     * keep the RLS helper functions callable by authenticated (RLS policies
--       call them) but not anon.
--   landing_stats() and featured_creators() are intentionally public (the
--   logged-out landing page calls them) so they are left as-is.
-- ============================================================================
set check_function_bodies = off;

-- 1) Trigger + scheduled functions: not part of the API surface at all.
do $$
declare f text;
begin
  foreach f in array array[
    'dispatch_notification()', 'handle_new_user()', 'on_announcement()',
    'on_application_decision()', 'on_challenge_live()', 'on_creator_ready()',
    'on_event_created()', 'on_job_opened()', 'on_new_connection()', 'on_new_dm()',
    'on_reward_distributed()', 'on_wall_published()', 'post_birthday_cards()',
    'protect_admin_columns()', 'protect_logged_views()', 'send_deadline_reminders()',
    'touch_conversation()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- 2) Admin RPCs: signed-in admins only (each self-checks is_admin); never anon.
revoke execute on function public.admin_get_email(uuid) from public, anon;
revoke execute on function public.admin_list_emails() from public, anon;
revoke execute on function public.admin_remind_incomplete(uuid) from public, anon;
revoke execute on function public.admin_delete_creator(uuid) from public, anon;
grant execute on function public.admin_get_email(uuid) to authenticated;
grant execute on function public.admin_list_emails() to authenticated;
grant execute on function public.admin_remind_incomplete(uuid) to authenticated;
grant execute on function public.admin_delete_creator(uuid) to authenticated;

-- 3) RLS helpers: authenticated MUST keep EXECUTE (policies evaluate them); anon
--    does not need them. Revoke from everyone, then re-grant the roles that do.
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.is_member() from public, anon, authenticated;
revoke execute on function public.can_post() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_member() to authenticated, service_role;
grant execute on function public.can_post() to authenticated, service_role;
