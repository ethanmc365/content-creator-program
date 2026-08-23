-- A BIRTHDAY IS NOT A PUBLIC FACT, AND profiles IS A PUBLIC TABLE.
--
-- `profiles` is readable by every member: the policy is `is_member()`, because
-- that is what the directory, the chat, the leaderboard and every avatar in the
-- app are built on. `profiles.dob` sat in that table, and /profile/:id fetched
-- it with `select('*')` - so a creator opening anybody's profile received their
-- exact date of birth over the wire, for all 37 people who had entered one.
--
-- Nothing in the product ever wanted that. The design was always "show an age":
-- `profiles.age` already exists, ProfileLab documents the field as "shown
-- publicly as an age only", and Profile.jsx even falls back to it. The column
-- was simply never populated (1 row out of 53), so the fallback never ran and
-- the exact date was what got used.
--
-- Row-level security cannot fix this, because the problem is a COLUMN in a table
-- whose rows are meant to be readable. A column-level REVOKE cannot either: the
-- owner has to be able to read their own birthday to edit it, grants are
-- role-wide rather than row-wise, and `select('*')` fails outright against a
-- column the role cannot read - it would take the whole app down.
--
-- So the birthday moves to where every other private fact about a creator
-- already lives: `creator_private`, whose only read policy is
-- `id = auth.uid() OR is_admin()`. `profiles` keeps a derived age, which is
-- what the community was ever shown.
--
-- ORDERED SO NOTHING BREAKS MID-DEPLOY. The column is not dropped here. The
-- copy is made, the ages are backfilled, a trigger keeps both in step for any
-- client still writing the old field, and only then are the values in
-- `profiles.dob` cleared. A browser running yesterday's bundle keeps working
-- throughout; it just stops being handed other people's birthdays. Dropping the
-- now-empty column is a separate, later change.
--
-- Applied to production 23 Aug 2026.

-- 1) The new home.
alter table public.creator_private add column if not exists dob date;

comment on column public.creator_private.dob is
  'Date of birth. Lives here, not on profiles, because profiles is readable by every member. The community sees profiles.age.';

-- 2) Copy every birthday across. `creator_private` may have no row yet for a
--    creator who never entered a phone number, so this is an upsert.
insert into public.creator_private (id, dob)
select p.id, p.dob from public.profiles p where p.dob is not null
on conflict (id) do update set dob = coalesce(public.creator_private.dob, excluded.dob);

-- 3) Backfill the age the community is actually shown.
update public.profiles p
   set age = extract(year from age(p.dob))::int
 where p.dob is not null
   and (p.age is null or p.age is distinct from extract(year from age(p.dob))::int);

-- 4) Keep it right from here on.
--
-- Written as a trigger on `creator_private` rather than a generated column
-- because an age is a function of TODAY as well as of the date, and Postgres
-- only generates from immutable expressions. It drifts by at most a year
-- between edits, which for "27" next to somebody's name is not a problem worth
-- a nightly job.
create or replace function public.sync_age_from_dob()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dob is not null and (tg_op = 'INSERT' or new.dob is distinct from old.dob) then
    update public.profiles
       set age = extract(year from age(new.dob))::int
     where id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_age_from_dob() from public, anon, authenticated;

drop trigger if exists trg_sync_age_from_dob on public.creator_private;
create trigger trg_sync_age_from_dob
after insert or update of dob on public.creator_private
for each row execute function public.sync_age_from_dob();

-- 5) A CLIENT STILL WRITING THE OLD FIELD MUST NOT LOSE THE BIRTHDAY.
--
-- Until every browser has the new bundle, `update profiles set dob = ...` is
-- still in flight from onboarding and the profile editor. This mirrors any such
-- write into the private table and derives the age, then blanks the public
-- copy again in the same statement - so the old client keeps working and the
-- value still never lands anywhere another member can read.
--
-- It deliberately ignores NULLs, so step 6 below (and any later clearing) does
-- not wipe the private copy it just made.
create or replace function public.mirror_dob_to_private()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dob is not null then
    insert into public.creator_private (id, dob) values (new.id, new.dob)
    on conflict (id) do update set dob = excluded.dob;
    new.age := extract(year from age(new.dob))::int;
    new.dob := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.mirror_dob_to_private() from public, anon, authenticated;

drop trigger if exists trg_mirror_dob_to_private on public.profiles;
create trigger trg_mirror_dob_to_private
before insert or update of dob on public.profiles
for each row execute function public.mirror_dob_to_private();

-- 6) The values themselves, gone from the table every member can read.
update public.profiles set dob = null where dob is not null;

comment on column public.profiles.dob is
  'DEPRECATED and always NULL. Birthdays live in creator_private.dob; this column is kept only so a browser running an older bundle does not error on select(*). Drop it once that is no longer possible.';
