-- ============================================================================
-- 170 - no SECURITY DEFINER function is ever callable by anon again
--
-- THIS TRAP HAS NOW BITTEN FOUR TIMES AND THIS IS THE LAST TIME.
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated, service_role`, and Postgres separately grants EXECUTE on
-- every new function to PUBLIC. So a function is born callable by anybody
-- holding the publishable key - which is a key that ships inside the JavaScript
-- bundle and is therefore not a secret at all. A SECURITY DEFINER function born
-- that way runs as its owner with RLS switched off.
--
-- Every previous fix has been a hand-written `revoke` in the migration that
-- created the function, and every previous fix has been undone by the next
-- migration that touched it:
--
--   * 110 swept the whole schema. Everything added since 110 arrived exposed.
--   * 138 fixed two functions by hand after `payment_snapshot` shipped able to
--     return anybody's IBAN to anybody.
--   * 153 revoked `route_creators` from BOTH public and anon, correctly - and
--     156 dropped and recreated the function, which re-granted it.
--   * 166 and 167 revoked their new functions from `public` only, which does
--     nothing about the grant made to `anon` BY NAME.
--
-- A rule that has to be remembered by the author of every future migration is
-- not a control. So this migration does two things: it sweeps the schema clean
-- one more time, and it installs an EVENT TRIGGER that performs the same sweep
-- automatically after any CREATE FUNCTION, so a function cannot be exposed by
-- being written, replaced, or dropped and recreated.
--
-- WHAT WAS ACTUALLY EXPOSED WHEN THIS WAS WRITTEN (2 Sep 2026), all confirmed
-- by calling production over PostgREST with nothing but the publishable key:
--
--   CRITICAL  award_challenge_prizes_internal(uuid, boolean)
--             The guarded wrapper `award_challenge_prizes` checks
--             is_global_admin(). The internal one it calls does not check
--             anything, inserts `rewards` rows, and a `rewards` row raises a
--             draft invoice by trigger. Reachable unauthenticated: HTTP 200.
--             The challenge id it needs is handed out by `public_live_challenge`
--             to anon by design, so the whole chain was open.
--   HIGH      milestone_progress(uuid)
--             Takes ANY profile id, and WRITES creator_milestones for it as a
--             side effect of being read. An unauthenticated write against any
--             creator on the platform.
--   MEDIUM    best_streak_leaderboard, views_leaderboard, creator_metrics,
--             milestone_state, milestone_overview, route_creators,
--             community_aircraft_gap, can_edit_locale
--             Creator names, photographs, view counts, wins, per-creator
--             metrics and milestone progress, all readable by anybody.
--
-- Nothing in the app changes: every one of these is called by a signed-in
-- creator, and `authenticated` keeps its grant.
-- ============================================================================
set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- The allowlist. These five run before anybody has signed in - they are the
-- landing page - and each one returns only what the landing page prints.
-- Anything not on this list is not for anon, and the sweep below enforces it.
-- ----------------------------------------------------------------------------
create table if not exists public.public_rpc_allowlist (
  proname text primary key,
  reason  text not null
);

comment on table public.public_rpc_allowlist is
  'The ONLY functions anon may execute. Adding a row here is a deliberate decision to publish data to the open internet; the event trigger no_new_function_is_public enforces everything else.';

insert into public.public_rpc_allowlist (proname, reason) values
  ('landing_stats',            'Landing page counters. Aggregates only, no names.'),
  ('featured_creators',        'Landing page faces. Name, photo, bio, country count - all already public on the page.'),
  ('public_creator_map',       'Landing page map. Opted-in creators only, coarse coordinates.'),
  ('public_live_challenge',    'Landing page challenge card. Title, dates, prizes.'),
  ('increment_referral_click', 'A referral link is clicked before sign-up by definition. Writes one counter.')
on conflict (proname) do update set reason = excluded.reason;

alter table public.public_rpc_allowlist enable row level security;
-- No policy: nobody reads or writes this through the API. It is read by the
-- sweep, which is SECURITY DEFINER and owned by postgres.

-- ----------------------------------------------------------------------------
-- The sweep itself, as a function, so the event trigger and a human can both
-- run exactly the same thing.
--
-- THREE CLASSES OF FUNCTION AND THREE ANSWERS:
--
--   a trigger / event       nobody calls it directly, ever. PostgREST will not
--                           expose it anyway, but a grant on it is noise that
--                           makes the audit query harder to read, so it goes.
--   an `_internal` function it exists precisely because a guarded wrapper calls
--                           it. Revoked from authenticated too - that is the
--                           whole point of the pair.
--   everything else         anon and PUBLIC lose it; `authenticated` is granted
--                           EXPLICITLY rather than left to inherit, because
--                           revoking PUBLIC would otherwise take a signed-in
--                           creator's access with it.
-- ----------------------------------------------------------------------------
create or replace function public.lock_down_definer_functions()
returns table (fn text, action text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  for r in
    select p.oid,
           p.proname,
           p.oid::regprocedure::text as sig,
           pg_get_function_result(p.oid) in ('trigger', 'event_trigger') as is_trigger,
           p.proname like '%\_internal' as is_internal,
           exists (select 1 from public.public_rpc_allowlist a where a.proname = p.proname) as allowed
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    if r.allowed then
      -- Deliberately public. Make sure it IS - a drop-and-recreate could just
      -- as easily have taken the grant away as given it.
      execute format('grant execute on function %s to anon, authenticated', r.sig);
      fn := r.sig; action := 'kept public (allowlisted)'; return next;

    elsif r.is_trigger or r.is_internal then
      execute format('revoke all on function %s from public, anon, authenticated', r.sig);
      fn := r.sig; action := 'locked to owner'; return next;

    else
      execute format('revoke all on function %s from public, anon', r.sig);
      execute format('grant execute on function %s to authenticated', r.sig);
      fn := r.sig; action := 'signed-in only'; return next;
    end if;
  end loop;
end $$;

revoke all on function public.lock_down_definer_functions() from public, anon, authenticated;

comment on function public.lock_down_definer_functions() is
  'Re-applies the execute grants on every SECURITY DEFINER function in public. Run by the no_new_function_is_public event trigger after any CREATE FUNCTION, and safe to run by hand at any time.';

-- ----------------------------------------------------------------------------
-- Do it once, now, for everything that already exists.
-- ----------------------------------------------------------------------------
select * from public.lock_down_definer_functions();

-- ----------------------------------------------------------------------------
-- And do it automatically, for ever.
--
-- IT MUST NEVER RAISE. An event trigger that throws makes the DDL that fired it
-- fail, which would turn a mistake in here into a schema that cannot be
-- migrated at all. Anything unexpected is swallowed and the deploy continues;
-- the sweep is idempotent, so the next migration puts it right.
-- ----------------------------------------------------------------------------
create or replace function public.no_new_function_is_public()
returns event_trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.lock_down_definer_functions();
exception when others then
  raise warning 'no_new_function_is_public: %', sqlerrm;
end $$;

drop event trigger if exists no_new_function_is_public;
create event trigger no_new_function_is_public
  on ddl_command_end
  when tag in ('CREATE FUNCTION', 'ALTER FUNCTION')
  execute function public.no_new_function_is_public();

-- ----------------------------------------------------------------------------
-- A SECOND LOCK ON THE ONE THAT MOVES MONEY.
--
-- The revoke above is the fix. This is the belt to its braces, because
-- `award_challenge_prizes_internal` is the only exposed function whose worst
-- case was "cash prizes awarded and invoices raised by a stranger", and because
-- a grant is a thing that can be handed back by accident four times running.
--
-- The test is the ROLE ON THE REQUEST, not auth.uid(): an anonymous PostgREST
-- call has no uid at all, so `auth.uid() is null` would have waved it straight
-- through. `request.jwt.claims` is set by PostgREST on every request and is
-- absent when the function is called from a trigger, a cron job or psql, which
-- is exactly the set of callers that should still work.
-- ----------------------------------------------------------------------------
create or replace function public.award_prizes_caller_is_allowed()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when current_setting('request.jwt.claims', true) is null
      or current_setting('request.jwt.claims', true) = '' then true   -- cron, trigger, psql
    when (current_setting('request.jwt.claims', true)::json ->> 'role') = 'service_role' then true
    else public.is_global_admin()
  end
$$;

revoke all on function public.award_prizes_caller_is_allowed() from public, anon, authenticated;

-- The guard is injected into the existing definition rather than the function
-- being reprinted here in full: eight kilobytes of prize arithmetic retyped by
-- hand into a migration is a bigger risk than the thing it is guarding. The
-- DURABLE control is the event trigger above, which does not care what the
-- function is called or how it is rewritten.
do $inject$
declare
  v_def text := pg_get_functiondef('public.award_challenge_prizes_internal(uuid,boolean)'::regprocedure);
  v_guard text := E'\nbegin\n'
    || E'  -- SECOND LOCK (migration 170). The revoke is the fix; this is here\n'
    || E'  -- because this is the function whose worst case was "a stranger awards\n'
    || E'  -- the cash prizes and raises the invoices".\n'
    || E'  if not public.award_prizes_caller_is_allowed() then\n'
    || E'    raise exception ''Only the team can award prizes.'';\n'
    || E'  end if;\n';
begin
  if position('award_prizes_caller_is_allowed' in v_def) > 0 then
    raise notice 'award_challenge_prizes_internal is already guarded.';
    return;
  end if;
  -- `overlay` on the FIRST occurrence only: the body has several nested
  -- begin/end blocks and the guard belongs in the outermost one.
  v_def := overlay(v_def placing v_guard from position(E'\nbegin\n' in v_def) for length(E'\nbegin\n'));
  execute v_def;
end $inject$;

-- Re-run the sweep so the function just created above is covered by it too.
select * from public.lock_down_definer_functions();
