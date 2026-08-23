-- SECURITY AUDIT, AUGUST 2026. Five findings, four of them closed here.
--
-- The full audit is in SECURITY.md. This migration carries the database half.
--
-- ---------------------------------------------------------------------------
-- 1. THE FEATURE FLAGS NOBODY COULD READ  (functional, high)
--
-- `app_settings` is `is_admin()` for ALL commands, and `lib/appFlags.readFlag`
-- selects straight from it. So every creator's read returned nothing, `readFlag`
-- failed closed to false exactly as designed - and the two features gated on it,
-- the guided walkthrough and the home-screen install ask, could NEVER start for
-- anybody. They were switched off in a way no row update could switch on.
--
-- The table itself must stay shut: it also holds `invoice_bill_to` (the
-- company's registered address and billing email) and `referral_reward`. So the
-- fix is a reader for the two keys that are genuinely public, and nothing else.
create or replace function public.public_flag(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- AN ALLOW-LIST, NOT THE WHOLE TABLE. A new flag is public only when somebody
  -- adds it here on purpose, which is the point: the next flag might gate
  -- something that should not be announced before it ships.
  select case
    when p_key not in ('tour_enabled', 'install_gate_enabled') then false
    -- `value` is jsonb. The rows are written as a bare JSON boolean, and the
    -- old client also accepted the string "true", so both are honoured.
    else coalesce(
      (select value = to_jsonb(true) or value = to_jsonb('true'::text)
         from public.app_settings where key = p_key),
      false)
  end;
$$;

revoke all on function public.public_flag(text) from public, anon;
grant execute on function public.public_flag(text) to authenticated;

comment on function public.public_flag(text) is
  'Reads one of the two public feature flags. app_settings is admin-only and also holds billing details, so creators read flags through here.';

-- ---------------------------------------------------------------------------
-- 2. TITLES AND TEST FLAGS WERE SELF-WRITABLE  (medium)
--
-- `protect_admin_columns` stopped a creator granting themselves `is_admin` or
-- `status` - verified, and it works. It did not stop them writing their own
-- `role_title`, which is the field `roleTitle()` prints under a name, or their
-- own `is_test`, which is the flag that hides an account from the directory,
-- the team roster and every leaderboard.
--
-- Neither is a privilege escalation on its own: `team_roster()` gates on
-- `platform_role`, which IS protected, so a self-assigned title does not put
-- anybody on the team list today. Both are still writes that bypass the admin
-- RPC that is supposed to own them (`set_team_member`), and "it is not
-- exploitable through the surfaces we happen to have built" is not a control.
create or replace function public.protect_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is NULL for trusted server-side connections (the dashboard SQL
  -- editor, seeds, service role) - only enforce for real app users.
  if auth.uid() is not null then
    if not public.is_admin() then
      if new.is_admin is distinct from old.is_admin
         or new.status is distinct from old.status
         -- NEW: the badge under your name and the flag that hides you belong to
         -- the team, not to you. Both are set through set_team_member / the
         -- admin surfaces, which run as an admin and so pass this check.
         or new.role_title is distinct from old.role_title
         or coalesce(new.is_test, false) is distinct from coalesce(old.is_test, false) then
        raise exception 'Only admins can change admin, status, title or test flags';
      end if;
    end if;

    -- Nobody but the owner edits the owner's role, title, admin flag or status.
    if old.platform_role = 'owner' and auth.uid() <> old.id then
      if new.platform_role is distinct from old.platform_role
         or new.role_title is distinct from old.role_title
         or new.is_admin is distinct from old.is_admin
         or new.status is distinct from old.status then
        raise exception 'The programme lead cannot be changed by anyone else';
      end if;
    end if;

    -- Only the owner hands out or takes back platform roles.
    if new.platform_role is distinct from old.platform_role
       and not public.is_owner() then
      raise exception 'Only the programme lead can change platform roles';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. GROUP DM MEDIA WAS UNREADABLE  (functional, medium)
--
-- The `dm-media` read policy checks `participant_a`/`participant_b`, which are
-- the two columns a DIRECT conversation uses. A group conversation carries its
-- people in `conversation_members` and leaves both of those null, so every
-- photo and video in every group DM was a broken image for everybody in it -
-- including the person who sent it.
--
-- `in_conversation()` is the function the direct_messages policies already use
-- and it handles both shapes, so this replaces a half-answer with the answer
-- the rest of the feature already agreed on.
drop policy if exists "dm-media: participants read" on storage.objects;
create policy "dm-media: participants read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dm-media'
    and public.in_conversation(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- 4. TWO RPCs WIDER THAN THEY NEED TO BE  (low)
--
-- `next_invoice_number()` is SECURITY DEFINER with no admin check, so any
-- signed-in creator could read how many invoices the programme has ever raised -
-- a small business-intelligence leak, and the kind of number a competitor or a
-- creator negotiating a rate would find interesting.
--
-- It is CALLED FROM THE BROWSER by the admin invoice queue, so the fix is the
-- check inside rather than taking the grant away: revoking EXECUTE from
-- `authenticated` would lock out the admins too, since an admin is an ordinary
-- authenticated user with a flag on their row.
create or replace function public.next_invoice_number()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  perform pg_advisory_xact_lock(hashtext('tryp.invoice.number'));
  select coalesce(max(number), 0) + 1 into n from public.invoices;
  return n;
end
$$;

-- Trigger functions are not callable through PostgREST in any useful way - they
-- raise as soon as they touch NEW - but they should not be listed as endpoints
-- at all. Removing EXECUTE takes them off the API surface.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. TWO FUNCTIONS WITH A MUTABLE search_path  (low, flagged by the linter)
--
-- A SECURITY DEFINER function without a pinned search_path can be pointed at an
-- attacker's schema by whoever calls it. Neither of these two is currently
-- reachable that way, and pinning it costs nothing.
alter function public.day_key_month(integer) set search_path = public;
alter function public.events_sync_community() set search_path = public;
