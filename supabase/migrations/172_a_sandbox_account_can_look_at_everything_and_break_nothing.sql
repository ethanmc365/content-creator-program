-- ============================================================================
-- 172 - a sandbox account can look at everything and break nothing
--
-- The Tryp.com team - Andre, Ellu, and Helio for the security review - need an
-- account that reaches every screen the platform has, including the admin
-- panel, without any risk of it reaching a real creator. `is_sandbox` already
-- meant "cannot post in chat or DMs" (sandbox_cannot_speak, on `messages` and
-- `direct_messages`). That is not enough for an ADMIN account, because the
-- admin panel is where the buttons that spend money and send mail live.
--
-- FOUR THINGS ARE WORTH STOPPING, AND ONLY FOUR:
--
--   MONEY     `rewards` and `invoices`. Awarding a prize writes a reward, and a
--             cash reward raises a draft invoice by trigger, so a curious press
--             of "award prizes" becomes a real financial record with a real
--             creator's bank details snapshotted into it.
--   OUTBOUND  `notifications` and `email_outbox`. A notification row is a WEB
--             PUSH to a real creator's phone; an outbox row is an email. These
--             are the only two things on the platform that reach somebody who
--             is not looking at it.
--   SETTINGS  `app_settings`. Feature flags. Turning one off is invisible from
--             the screen you turned it off on and visible to all 44 creators.
--   DELETION  Rows are not recoverable through the UI once removed.
--
-- EVERYTHING ELSE IS DELIBERATELY ALLOWED. Creating a challenge, writing an
-- admin note, editing a market, moving somebody between leaderboard groups,
-- filling in a form to see what it does - all of that is the point of handing
-- somebody an account, all of it is recoverable, and a demo account that cannot
-- press anything is a screenshot.
--
-- It is enforced in the DATABASE rather than in the React app, because the
-- React app is not a security boundary: anybody holding the account's token can
-- talk to PostgREST directly.
--
-- The account itself is `team@trypcreators.test`, is_admin + global_admin +
-- is_test + is_sandbox, a manager of every market. `is_test` is what keeps it
-- out of the rosters, the email lists and the leaderboards.
-- ============================================================================
create or replace function public.sandbox_is_read_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- auth.uid() is null for the cron jobs, the webhooks and the service role.
  -- Those are the paths that must keep working: the view sync writes, the
  -- archive job writes, and a notification raised BY the platform about a
  -- sandbox account is not the sandbox account acting.
  if auth.uid() is not null
     and exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    raise exception 'SANDBOX_READ_ONLY: this demo account can look at everything here but cannot change money, mail or settings.';
  end if;
  return coalesce(new, old);
end $$;

comment on function public.sandbox_is_read_only() is
  'Refuses a write made by a profile flagged is_sandbox. Attached to the money, outbound-message and settings tables so a demo admin account handed to the Tryp.com team cannot reach a real creator.';

do $$
declare t text;
begin
  foreach t in array array['rewards', 'invoices', 'notifications', 'email_outbox', 'app_settings']
  loop
    execute format('drop trigger if exists sandbox_read_only on public.%I', t);
    execute format(
      'create trigger sandbox_read_only before insert or update or delete on public.%I
         for each row execute function public.sandbox_is_read_only()', t);
  end loop;

  -- Deletes only, on the tables whose rows are somebody's real work.
  foreach t in array array['profiles', 'challenges', 'submissions', 'communities', 'messages', 'direct_messages', 'results']
  loop
    execute format('drop trigger if exists sandbox_no_delete on public.%I', t);
    execute format(
      'create trigger sandbox_no_delete before delete on public.%I
         for each row execute function public.sandbox_is_read_only()', t);
  end loop;
end $$;
