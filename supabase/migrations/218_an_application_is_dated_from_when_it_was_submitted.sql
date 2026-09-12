-- 218. AN APPLICATION IS DATED FROM WHEN IT WAS SUBMITTED.
--
-- Ethan: "when someone partly applied and then later completes it, after a few
-- days their application should show as new, not signed up 5 days ago. It would
-- make more sense this way because it's when they officially submitted their
-- application."
--
-- He is right, and the queue was actively misleading because of it. The review
-- list is ordered by `profiles.created_at` and every card prints it, but
-- `created_at` is when the AUTH ROW was made - the moment somebody pressed Sign
-- up. Between that and a finished application there can be a week of nothing.
-- So an application that landed on the reviewer's desk twenty minutes ago sat
-- at the BOTTOM of a list sorted newest-first, under a label reading "Applied 6
-- days ago", and the one thing an admin needs from this screen - what is new -
-- was exactly what it got wrong.
--
-- `onboarded` already records THAT they finished. Nothing recorded WHEN: there
-- is no submitted_at column, the audit trigger on profiles watches
-- status/is_admin/platform_role/role_title/deletion_requested_at and not
-- `onboarded`, and the 'application' notification `on_creator_ready` raises
-- carries no creator id to join back on. The moment was simply not kept.
--
-- THE BACKFILL IS A BEST EFFORT AND SAYS SO. For rows that have already
-- finished, the moment is gone. `created_at` is the only timestamp there is, so
-- that is what they get - which leaves them exactly where they are today rather
-- than inventing a date. New submissions from here are stamped properly, and
-- the client reads `coalesce(submitted_at, created_at)` so both kinds of row
-- render with one code path.

alter table public.profiles
  add column if not exists submitted_at timestamptz;

comment on column public.profiles.submitted_at is
  'When the creator finished and submitted their application (onboarded false -> true). Null for rows that predate migration 218; fall back to created_at.';

-- Stamp it at the same moment the admins are told. `on_creator_ready` is
-- already the one place that knows "this application has just been submitted",
-- so a second trigger watching the same transition would be a second definition
-- of the same event.
--
-- IT IS A BEFORE TRIGGER'S JOB TO WRITE A COLUMN. `on_creator_ready` is AFTER
-- UPDATE and cannot change the row, so the stamp goes in its own BEFORE
-- trigger rather than turning that one inside out.
create or replace function public.stamp_submitted_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.onboarded and (old.onboarded is distinct from new.onboarded) and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_submitted_at on public.profiles;
create trigger trg_stamp_submitted_at
  before update on public.profiles
  for each row execute function public.stamp_submitted_at();

-- Every row that has already finished gets its signup date, which is what the
-- screen shows today. Nothing moves; new rows start being right.
update public.profiles
   set submitted_at = created_at
 where onboarded and submitted_at is null;

notify pgrst, 'reload schema';
