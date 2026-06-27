-- A creator's "member since" date should be when they were ACCEPTED into the
-- program (status -> active), not when they first applied (created_at).
set check_function_bodies = off;

alter table public.profiles add column if not exists accepted_at timestamptz;

-- Backfill existing active members. We don't have the historical acceptance
-- time, so fall back to created_at (best available approximation).
update public.profiles
  set accepted_at = created_at
  where status = 'active' and accepted_at is null;

-- Stamp the acceptance time the first time a creator becomes active, via a
-- BEFORE UPDATE trigger so every approval path (list, applications page, etc.)
-- is covered automatically.
create or replace function public.set_accepted_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'active'
     and old.status is distinct from 'active'
     and new.accepted_at is null then
    new.accepted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_accepted_at on public.profiles;
create trigger trg_set_accepted_at
  before update of status on public.profiles
  for each row execute function public.set_accepted_at();
