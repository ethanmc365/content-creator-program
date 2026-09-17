-- TWO DOORS THE PRODUCT HAD ALREADY CLOSED, AND ONE TRIGGER'S SEARCH PATH.
--
-- Found by the 17 Sep 2026 audit, by listing every function in `public` and
-- asking what still calls it - not from code, not from a policy, not from cron,
-- not from another function, not from a trigger, not from a view. Four came back
-- with nothing at all. Two of those four are removed here and two are kept, and
-- the difference is worth writing down because "nothing calls it" is the start
-- of the argument rather than the end of it.
--
-- ---------------------------------------------------------------------------
-- 1. `leave_market(text)` - THE ONE THAT MATTERED.
--
-- MarketHeader.jsx carries this decision in full:
--
--     THE "LEAVE THIS MARKET" MENU IS GONE. Which market somebody is in is not
--     a preference, it is a placement: it decides which briefs they can enter,
--     which rooms they read, whose leaderboard they are on and which currency
--     they are paid in. A creator who taps it out of curiosity has removed
--     themselves from the programme's working unit, and the only way back is to
--     ask. Ethan's rule, and the right one: adding and removing people from a
--     market is an admin action, done from Manage market where it is deliberate
--     and audited.
--
-- The MENU was removed. The FUNCTION was left behind, SECURITY DEFINER and
-- granted to `authenticated`, which means it was still reachable at
-- `/rest/v1/rpc/leave_market` by any signed-in creator with a fetch call.
--
-- MEASURED, not reasoned about - rehearsed as a real creator inside a
-- transaction that was rolled back: `leave_market('uk')` took that account from
-- seven memberships to six. No audit row, no admin involved, no way back
-- without asking. Exactly the outcome the product decision exists to prevent,
-- through the door nobody closed.
--
-- Honest severity: LOW. It is scoped to `auth.uid()`, so this is self-service
-- self-harm and not a cross-creator attack - nobody can remove anybody else.
-- It is removed rather than re-guarded because there is no caller to break and
-- no version of this the product wants: an in-function admin check would leave
-- a market-leaving RPC that no admin screen calls either.
--
-- 2. `set_home_market(text)` - a concept that was deleted.
--
-- CommunityContext and MarketHeader both say it outright: there is no home
-- market any more. `is_home` survives in the database ONLY as the ordering hint
-- `join_market` sets for the first chapter somebody joins; nothing reads it as a
-- preference and nothing writes it. This function wrote it. It refuses for a
-- non-member and is harmless, but it is the last executable trace of a setting
-- the product removed for being a setting that changed nothing.
--
-- Both were created by migration 194, whose own title is "seven functions
-- nothing could call". Two of the seven still had nothing calling them.
--
-- ---------------------------------------------------------------------------
-- KEPT, AND WHY - because "unused" is not the same as "dead":
--
--   `my_unread_rooms()` (migration 217) is an unwired but CORRECT server-side
--   unread count. `UnreadContext` currently answers a narrower question on the
--   client by pulling the newest 400 messages across every room the creator can
--   see and keeping the first per channel. That is fine at today's volume and
--   fails quietly at tomorrow's: one busy room can fill all 400, and the quiet
--   rooms then lose their last message and their dot with no error anywhere.
--   This function is the fix for that, waiting to be called. Deleting it would
--   be deleting the answer to a problem already on its way.
--
--   `certificate_selftest()` (migration 228) writes one row through the
--   certificate error path and reads it back. It is a diagnostic, so nothing
--   calls it in the ordinary course of things - that is what it is for. It
--   exists because `report_client_error` silently wrote nothing for weeks while
--   the table sat empty, and the lesson recorded then was that a reporting path
--   which cannot throw needs a test that a row lands. This is that test.
--
-- ---------------------------------------------------------------------------
-- 3. `tracked_videos_touch()` - the one advisor warning left.
--
-- `function_search_path_mutable`. It is a trigger function and it is SECURITY
-- INVOKER, so it runs as whoever fired it and there is no privilege to escalate
-- into; the finding is hygiene rather than a hole. It is pinned anyway, because
-- one outstanding warning in the advisor list is one more place for a real one
-- to hide.

begin;

drop function if exists public.leave_market(text);
drop function if exists public.set_home_market(text);

-- `now()` is pg_catalog, which is always on the path implicitly, so an empty
-- search_path is safe here and is the tightest thing to say.
create or replace function public.tracked_videos_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

commit;
