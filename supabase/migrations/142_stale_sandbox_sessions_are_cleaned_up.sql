-- "VIEW AS CREATOR" LEAVES A SESSION BEHIND, AND NOTHING SWEPT THEM UP.
--
-- Every time an admin steps into the sandbox, `impersonate` mints a magiclink
-- and GoTrue opens a session for the sandbox user. Exiting does NOT close it -
-- it swaps the admin's browser back to a fresh admin session, deliberately, so
-- that one admin leaving cannot sign another one out of a sandbox they are
-- still using. (That is also the answer to "can several admins be in it at
-- once": yes. Each gets their own session and they do not interfere. Verified
-- 27 Aug 2026 - there were 23 concurrent sessions on that account.)
--
-- The consequence is that sandbox sessions only ever accumulate. The oldest was
-- from 17 July, and because refresh tokens on this project never time out, every
-- one of them was a live credential to that account forever.
--
-- Low severity - the sandbox cannot post, holds no real data and is hidden
-- everywhere - but "credentials that accumulate and never expire" is not a
-- sentence anybody wants to read in an audit, and the fix is small.
--
-- A DAY is the threshold, not an hour: an admin mid-demo should not be dropped,
-- and nobody is still inside a preview they opened yesterday.
create or replace function public.purge_sandbox_sessions()
returns integer language plpgsql security definer set search_path to 'auth', 'public' as $$
declare v_n integer;
begin
  with gone as (
    delete from auth.sessions s
    using public.profiles p
    where p.id = s.user_id
      and p.is_sandbox
      and s.updated_at < now() - interval '1 day'
    returning s.id
  )
  select count(*) into v_n from gone;
  return v_n;
end $$;

revoke all on function public.purge_sandbox_sessions() from public, anon, authenticated;

select cron.schedule(
  'purge-sandbox-sessions',
  '20 4 * * *',
  $$ select public.purge_sandbox_sessions(); $$
);
