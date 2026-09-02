-- ============================================================================
-- 176 - the session purge is for the preview account, not for people
--
-- `purge_sandbox_sessions` (migration 142) deletes every session on an
-- `is_sandbox` profile once it is a day old, and it is right to: the "view as
-- creator" preview account opens a new session every time an admin steps into
-- it, exiting never closes them, refresh tokens on this project never expire,
-- and the oldest one found was six weeks old. Nobody is still inside a preview
-- they opened yesterday.
--
-- Then migration 172 gave `is_sandbox` a SECOND meaning - "this account is
-- fenced read-only" - and put it on the Tryp.com team's shared demo account so
-- Andre, Ellu and Helio could look at everything without being able to spend,
-- send or delete. That account is held by PEOPLE, who come back to it on
-- Tuesday. As written, this job would have signed all three of them out every
-- morning at 04:20 with no explanation and no pattern they could describe.
--
-- The honest distinction is not the flag, it is who holds the account. The
-- preview creator is a NON-ADMIN sandbox profile that only ever exists to be
-- stepped into. A sandbox profile that is also an ADMIN is somebody's login.
-- So the purge keeps doing exactly the job it was written for and stops
-- reaching accounts a person signs into.
-- ============================================================================
create or replace function public.purge_sandbox_sessions()
returns integer language plpgsql security definer set search_path to 'auth', 'public' as $$
declare v_n integer;
begin
  with gone as (
    delete from auth.sessions s
    using public.profiles p
    where p.id = s.user_id
      and p.is_sandbox
      and not coalesce(p.is_admin, false)   -- see the note above
      and s.updated_at < now() - interval '1 day'
    returning s.id
  )
  select count(*) into v_n from gone;
  return v_n;
end $$;

revoke all on function public.purge_sandbox_sessions() from public, anon, authenticated;
