-- EVERY ERROR REPORT THIS PLATFORM EVER MADE WAS THROWN AWAY.
--
-- Ethan: "on the error monitoring - it doesn't show what the actual... like,
-- there were previous errors. It's not showing them, and it doesn't show what
-- they are, which it should."
--
-- He is right, and the reason is not that the errors were not reported. It is
-- that `report_client_error` threw on every single call and swallowed its own
-- exception. `client_errors` has 0 rows, and it has never had one.
--
-- THE LINE:
--
--     resolved_at = case when public.client_errors.resolved_at is null
--                        then null else null end
--
-- Both branches of that CASE are an untyped NULL, so Postgres resolves the
-- expression's type to `text` and the UPDATE fails with
--
--     42804: column "resolved_at" is of type timestamp with time zone
--            but expression is of type text
--
-- which the function's own `exception when others then return` - there so that
-- reporting a crash can never cause one - then discarded. Reproduced against
-- production by running the body verbatim with the handler returning SQLERRM
-- instead of swallowing it.
--
-- It is a nasty shape of bug and worth naming: a catch-all handler over a
-- statement that can fail for a reason that has nothing to do with the
-- conditions it was written to tolerate. The handler is still right - a
-- reporting path must not throw into an error boundary - so the protection is
-- that the statement is now simple enough to read, and there is a test.
--
-- The CASE was trying to say "a fault that comes back after somebody ticked it
-- off is not resolved any more". That is what `resolved_at = null` says.
--
-- WHILE IT IS BEING FIXED, IT LEARNS THE THINGS ETHAN ASKED FOR: "it should
-- show what the errors were, like where they happened, how to replicate them so
-- I can fix it."
--
--   agent   the browser and platform, scrubbed to a family and a version. It is
--           the difference between "it is broken" and "it is broken on iOS
--           Safari", which is most of a reproduction.
--   detail  the error's own stack, top frames only.
--   source  where the row came from: 'client' for a crash in somebody's
--           browser, 'cron' for a scheduled job, 'integration' for a thing we
--           read from someone else's API. One panel, one tick-off, one place to
--           look - see 205 and 206.
--
-- `component` (the React component stack) already existed and is what says
-- WHERE in the app. Nothing about the fingerprint changes, so a fault is still
-- one row however many people hit it.

alter table public.client_errors
  add column if not exists agent  text,
  add column if not exists detail text,
  add column if not exists source text not null default 'client';

comment on column public.client_errors.source is
  'client = a crash in a creator''s browser; cron = a scheduled job; integration = an external API we read.';

-- The argument list gains `p_agent` and `p_detail`, which `create or replace`
-- cannot do - it would leave two overloads and PostgREST would refuse the
-- named-argument call as ambiguous. Dropped and recreated deliberately.
drop function if exists public.report_client_error(text, text, text, text);

create function public.report_client_error(
  p_message   text,
  p_route     text default null,
  p_component text default null,
  p_release   text default null,
  p_agent     text default null,
  p_detail    text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me   uuid := auth.uid();
  v_msg  text := left(coalesce(nullif(btrim(p_message), ''), 'Unknown error'), 500);
  v_route text := left(coalesce(p_route, ''), 200);
  v_fp   text;
  v_new  boolean;
begin
  if v_me is null then return; end if;

  -- THE FINGERPRINT IS THE MESSAGE AND THE ROUTE, WITH THE VARIABLE BITS FILED
  -- OFF. Ids, numbers and quoted values differ between two reports of the same
  -- fault, and without this a single bug appears as forty separate problems.
  v_fp := md5(
    regexp_replace(lower(v_msg), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]+', '#', 'g')
    || '|' ||
    regexp_replace(v_route, '/[0-9a-f-]{16,}', '/#', 'g')
  );

  insert into public.client_error_seen (fingerprint, profile_id)
  values (v_fp, v_me)
  on conflict do nothing;
  get diagnostics v_new = row_count;

  insert into public.client_errors
    (fingerprint, message, route, component, release, agent, detail, source)
  values
    (v_fp, v_msg, v_route,
     left(coalesce(p_component, ''), 2000),
     left(coalesce(p_release, ''), 80),
     left(coalesce(p_agent, ''), 200),
     left(coalesce(p_detail, ''), 4000),
     'client')
  on conflict (fingerprint) do update set
    last_seen_at = now(),
    hits   = public.client_errors.hits + 1,
    people = public.client_errors.people + (case when v_new then 1 else 0 end),
    -- The newest report wins for the diagnostic fields: the browser it is
    -- happening on NOW is more useful than the first one that ever hit it.
    agent  = coalesce(nullif(left(coalesce(p_agent, ''), 200), ''), public.client_errors.agent),
    detail = coalesce(nullif(left(coalesce(p_detail, ''), 4000), ''), public.client_errors.detail),
    -- A FAULT THAT COMES BACK AFTER SOMEBODY TICKED IT OFF IS NOT RESOLVED.
    -- This one line is the whole bug; see the header.
    resolved_at = null,
    resolved_by = null;
exception when others then
  return;   -- reporting a crash must never cause one
end;
$$;

grant execute on function public.report_client_error(text, text, text, text, text, text) to authenticated;

-- SOMETHING BROKE THAT NOBODY WAS LOOKING AT.
--
-- Ethan: "any error should show up on the On your desk thing on the admin panel
-- so that I can quickly fix them. And once I click that they're fixed, then you
-- should take them out of there."
--
-- A crash in a creator's browser is one kind of error and it is the only kind
-- the panel could show. A cron job that failed, or Instagram changing a query
-- id so view counts stop, are errors in exactly the sense he means - somebody
-- has to do something - and they had nowhere to appear at all.
--
-- So the same table takes them, with the same tick-off and the same
-- fingerprinting. `p_key` is the caller's own stable name for the fault
-- ('cron:view-sync', 'instagram:reels-doc-id') rather than a hash of a message,
-- because a system fault has a name and a message that changes every time.
--
-- IT IS CALLED BY TRIGGERS AND CRON, NOT BY A BROWSER, so it does not read
-- auth.uid() and `people` stays at 0 - nobody "hit" it. It is granted to
-- service_role only.
create or replace function public.report_system_error(
  p_source  text,
  p_key     text,
  p_message text,
  p_detail  text default null,
  p_route   text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_fp text := md5(coalesce(p_source, 'system') || '|' || coalesce(p_key, 'unknown'));
begin
  insert into public.client_errors
    (fingerprint, message, route, component, release, detail, source, people)
  values
    (v_fp,
     left(coalesce(nullif(btrim(p_message), ''), 'Unknown system error'), 500),
     left(coalesce(p_route, ''), 200),
     left(coalesce(p_key, ''), 2000),
     '',
     left(coalesce(p_detail, ''), 4000),
     coalesce(nullif(p_source, ''), 'system'),
     0)
  on conflict (fingerprint) do update set
    last_seen_at = now(),
    hits    = public.client_errors.hits + 1,
    message = excluded.message,
    detail  = excluded.detail,
    resolved_at = null,
    resolved_by = null;
exception when others then
  return;
end;
$$;

-- AND THE OTHER HALF: SAY IT IS OVER.
--
-- A cron job that failed at 03:00 and has run cleanly every hour since is not a
-- thing Ethan should still be looking at on the panel. `clear_system_error`
-- ticks the row off the way a person would, so a self-healing fault clears
-- itself and only a persistent one keeps his attention. A fault a PERSON ticked
-- off stays ticked off until it recurs; that is what the null check protects.
create or replace function public.clear_system_error(p_source text, p_key text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.client_errors
     set resolved_at = now()
   where fingerprint = md5(coalesce(p_source, 'system') || '|' || coalesce(p_key, 'unknown'))
     and resolved_at is null;
$$;

revoke all on function public.report_system_error(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.clear_system_error(text, text) from public, anon, authenticated;
