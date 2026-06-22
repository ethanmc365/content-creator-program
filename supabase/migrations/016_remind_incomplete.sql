-- ============================================================================
-- 016 - admin "remind to finish profile" action
--   A creator who signs up but never submits their profile sits at
--   status='pending' with onboarded=false (they did page 1 only). Admins can
--   nudge them with a follow-up email. This reuses notify_user, so the existing
--   notify-dispatch Edge Function sends the email (Resend) + in-app bell.
-- ============================================================================
set check_function_bodies = off;

create or replace function public.admin_remind_incomplete(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  perform public.notify_user(
    target,
    'application',
    'Finish setting up your Tryp.com profile',
    'You started your application but have not submitted it yet. Tap below to complete your creator profile and join the Content Creator Program.',
    '/onboarding'
  );
end;
$$;

grant execute on function public.admin_remind_incomplete(uuid) to authenticated;
