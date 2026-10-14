-- 423: WHERE PEOPLE STOP, OVER EVERY APPLICATION EVER (15 Oct 2026).
--
-- Ethan, on Recruitment's "Where people stop": "it should be an average of where people stopped, not just from the
-- current applications, but from all applications". The box only counted people who are unfinished right now, so
-- anybody who stalled and later finished (or was deleted) vanished from it. Now every step a person reaches is logged
-- once (onboarding_progress), from a light trigger that only does anything while a profile is still unfinished, and
-- the log outlives the account (profile_id goes null on delete; the row keeps the step and the date).
--
-- Steps match the form and the Recruitment page: 1 name and photo, 2 where they live, 3 channels, 4 story,
-- 5 languages, 6 travel map, 7 final review, 8 submitted. The date of birth is never on profiles (it moves to
-- creator_private), so step 2 reads profiles.age, which the same trigger derives.
create table if not exists public.onboarding_progress (
  id         bigint generated always as identity primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  step       smallint not null check (step between 1 and 8),
  reached_at timestamptz not null default now(),
  signed_up  timestamptz,
  country_code text
);
create unique index if not exists onboarding_progress_once on public.onboarding_progress (profile_id, step) where profile_id is not null;
alter table public.onboarding_progress enable row level security;
drop policy if exists onboarding_progress_admin on public.onboarding_progress;
create policy onboarding_progress_admin on public.onboarding_progress for select to authenticated using ((select public.is_admin()));

create or replace function public.onboarding_step_of(p public.profiles)
returns smallint
language sql
immutable
set search_path = public
as $$
  select (case
    when p.onboarded then 8
    when coalesce(btrim(p.name), '') = '' or p.photo_url is null then 0
    when p.country_code is null or coalesce(btrim(p.city), '') = '' or p.age is null then 1
    when coalesce(btrim(p.instagram_url), '') = '' and coalesce(btrim(p.tiktok_url), '') = '' and coalesce(btrim(p.youtube_url), '') = '' and coalesce(btrim(p.facebook_url), '') = '' then 2
    when coalesce(btrim(p.bio), '') = '' or coalesce(btrim(p.about), '') = '' then 3
    when coalesce(array_length(p.languages, 1), 0) = 0 then 4
    when coalesce(array_length(p.countries_visited, 1), 0) = 0 then 5
    else 7 end)::smallint
$$;

create or replace function public.log_onboarding_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v smallint;
begin
  -- Only while signing up: an onboarded profile that is edited later logs nothing.
  if tg_op = 'UPDATE' and old.onboarded then return new; end if;
  v := public.onboarding_step_of(new);
  if v > 0 then
    insert into public.onboarding_progress (profile_id, step, signed_up, country_code)
    select new.id, s, new.created_at, new.country_code from generate_series(1, v) s
    on conflict (profile_id, step) where profile_id is not null do nothing;
  end if;
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists trg_zz_onboarding_progress on public.profiles;
create trigger trg_zz_onboarding_progress after insert or update on public.profiles
  for each row execute function public.log_onboarding_progress();

-- Backfill: everybody here today, up to the step they have reached (everyone finished reached every step).
insert into public.onboarding_progress (profile_id, step, reached_at, signed_up, country_code)
select p.id, s, coalesce(case when s = 8 then p.submitted_at end, p.created_at), p.created_at, p.country_code
  from public.profiles p
  cross join lateral generate_series(1, public.onboarding_step_of(p)) s
 where not coalesce(p.is_test, false) and not coalesce(p.is_admin, false)
on conflict (profile_id, step) where profile_id is not null do nothing;

revoke all on function public.log_onboarding_progress() from public, anon, authenticated;
insert into public.owner_only_rpcs (proname, why) values ('log_onboarding_progress', '423: trigger only') on conflict do nothing;
select public.lock_down_definer_functions();
