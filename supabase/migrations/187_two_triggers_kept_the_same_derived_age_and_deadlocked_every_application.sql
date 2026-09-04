-- EVERY APPLICATION SUBMIT HAS BEEN FAILING, SILENTLY, SINCE THE DOB SPLIT.
--
-- Onboarding writes the whole profile in one UPDATE, and that UPDATE carries a
-- date of birth. Two triggers then both try to keep `profiles.age` in step with
-- it, and they form a loop through the row that is still being written:
--
--   1  UPDATE profiles ... dob = '1997-04-18'
--   2  BEFORE trigger mirror_dob_to_private: writes creator_private.dob, sets
--      new.age itself, and nulls new.dob (the public row never holds a full
--      date of birth - that is the design)
--   3  AFTER trigger on creator_private, sync_age_from_dob: UPDATE profiles
--      SET age = ... WHERE id = new.id - the very tuple whose BEFORE trigger
--      has not returned yet
--   4  ERROR 27000: tuple to be updated was already modified by an operation
--      triggered by the current command
--
-- The client threw the error away (a bare Promise.all), so the flow carried on
-- to its "application submitted" card, navigated to /home, ProtectedRoute read
-- onboarded = false and sent the applicant straight back to the first screen of
-- onboarding. Nothing was ever written and no application ever reached the
-- admin queue. EditProfile has the same fault but only trips it when the date
-- of birth actually CHANGES (sync_age_from_dob compares old.dob), which is why
-- it looked like an onboarding-only problem.
--
-- THE FIX: mirror_dob_to_private has already computed the age by the time it
-- writes creator_private, so the second trigger has nothing to add on that
-- path. It raises a transaction-local flag and sync_age_from_dob stands down
-- while it is set. A write that arrives at creator_private directly - which is
-- the only reason sync_age_from_dob exists - carries no flag and still syncs.
--
-- The rule, and it is the same one as migration 131 and 185: a derived value
-- gets exactly ONE owner per write path. Two bookkeepers on one column do not
-- double-check each other, they deadlock over it.

create or replace function public.mirror_dob_to_private()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.dob is not null then
    -- Tell sync_age_from_dob that profiles.age is already being handled by
    -- this very statement. Transaction-local (`true`), so it cannot leak into
    -- the next statement on a pooled connection.
    perform set_config('app.dob_mirror_in_flight', '1', true);
    insert into public.creator_private (id, dob) values (new.id, new.dob)
    on conflict (id) do update set dob = excluded.dob;
    perform set_config('app.dob_mirror_in_flight', '', true);

    new.age := extract(year from age(new.dob))::int;
    new.dob := null;
  end if;
  return new;
end;
$function$;

create or replace function public.sync_age_from_dob()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- The profiles row is mid-UPDATE and is setting its own age. Touching it
  -- here is what raised 27000 on every application submitted.
  if coalesce(current_setting('app.dob_mirror_in_flight', true), '') = '1' then
    return new;
  end if;

  if new.dob is not null and (tg_op = 'INSERT' or new.dob is distinct from old.dob) then
    update public.profiles
       set age = extract(year from age(new.dob))::int
     where id = new.id
       and age is distinct from extract(year from age(new.dob))::int;
  end if;
  return new;
end;
$function$;
