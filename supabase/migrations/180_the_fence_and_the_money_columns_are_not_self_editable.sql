-- THREE COLUMNS A CREATOR COULD SET ON THEMSELVES THAT THEY SHOULD NOT.
--
-- `protect_admin_columns` already guards `is_admin`, `status`, `role_title` and
-- `is_test`, and it guards them well - tested 2 Sep 2026, a PENDING applicant
-- cannot set their own status to 'active' and a test account cannot clear its
-- own `is_test`. Three more belong on the list, found by trying them.
--
-- 1. `is_sandbox` - THE FENCE WAS KEYED ON A COLUMN THE FENCED ACCOUNT COULD EDIT.
--
--    `sandbox_is_read_only()` (migrations 172/174) is what stops the demo
--    account writing rewards, invoices, notifications, email_outbox and
--    app_settings, or deleting a profile, challenge or market. It reads
--    `profiles.is_sandbox`. And the sandbox account could UPDATE that column on
--    its own row:
--
--        update profiles set is_sandbox = false where id = <me>;   -- 1 row
--
--    One request through PostgREST with its own token and the fence is gone. It
--    takes nobody else's compromise: this is the account being handed to the
--    development team precisely BECAUSE it is fenced, so "the fence is
--    self-removable" undoes the reason for giving it out.
--
-- 2. `referred_by` - A MONEY PATH. A creator could name anybody as the person
--    who referred them, and a referral raises a real reward (migration 109) and
--    counts toward the `referrals` milestone metric, whose vouchers are real
--    payouts (migration 128). Two colluding accounts could manufacture them.
--    It is written ONCE, by the signup trigger, as part of the INSERT - which a
--    BEFORE UPDATE trigger never sees - so guarding the UPDATE costs nothing.
--
-- 3. `accepted_at` - THE SAME MONEY PATH BY ANOTHER ROUTE. It is the clock the
--    `days` metric counts from (`creator_metrics`), so backdating it five years
--    hands you the long-service milestones and their vouchers. Only the admin
--    approval path has any business setting it, and admins are exempt below.
--
-- CHECKED BEFORE LOCKING: nothing in the client writes any of the three, and
-- the admin branch (`is_admin()`) is untouched. Re-tested after: a creator can
-- still edit their own bio and city and set their own `connect_gate_done`, and
-- an admin can still approve somebody and stamp `accepted_at`.

create or replace function public.protect_admin_columns()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is not null then
    if not public.is_admin() then
      if new.is_admin is distinct from old.is_admin
         or new.status is distinct from old.status
         or new.role_title is distinct from old.role_title
         or coalesce(new.is_test, false) is distinct from coalesce(old.is_test, false)
         -- The three added 2 Sep 2026. See the note above.
         or coalesce(new.is_sandbox, false) is distinct from coalesce(old.is_sandbox, false)
         or new.referred_by is distinct from old.referred_by
         or new.accepted_at is distinct from old.accepted_at then
        raise exception 'Only admins can change admin, status, title, test, sandbox, referral or acceptance fields';
      end if;
    end if;

    if old.platform_role = 'owner' and auth.uid() <> old.id then
      if new.platform_role is distinct from old.platform_role
         or new.role_title is distinct from old.role_title
         or new.is_admin is distinct from old.is_admin
         or new.status is distinct from old.status then
        raise exception 'The programme lead cannot be changed by anyone else';
      end if;
    end if;

    if new.platform_role is distinct from old.platform_role
       and not public.is_owner() then
      raise exception 'Only the programme lead can change platform roles';
    end if;
  end if;
  return new;
end;
$function$;
