-- 236: "SEND A TEST" GOES THROUGH APPLE AND GOOGLE, NOT AROUND THEM.
--
-- The button on the notification settings called `showLocalNotification`,
-- which asks the phone's own service worker to draw a notification. It never
-- touched this database, notify-dispatch, or the push service - so it passed
-- on a phone whose registration the server had lost, which is exactly the phone
-- that most needed the test to fail. Ethan, 21 Sep 2026: "I sent the test, and
-- the notification did come" while real notifications did not.
--
-- This inserts a real notification for the caller, which fires the same
-- trigger -> notify-dispatch -> web push path every other notification takes,
-- and says how many devices the server will send it to. Type `announcement`
-- because it is the one type nobody can mute, so the test cannot be silenced by
-- a preference. One every 30 seconds per person.
create or replace function public.send_test_push()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  devices integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.notifications
              where recipient_id = me and title = 'Test notification'
                and created_at > now() - interval '30 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;
  select count(*) into devices from public.push_subscriptions where user_id = me;
  insert into public.notifications (recipient_id, type, title, body, link)
  values (me, 'announcement', 'Test notification',
          'If this arrived on your lock screen, notifications are working.', '/notifications');
  return jsonb_build_object('ok', true, 'devices', devices);
end $$;

revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;
