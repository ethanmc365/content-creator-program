-- 424: the onboarding log keeps WHO, without a foreign key, so a deleted account's steps still group as one person.
alter table public.onboarding_progress add column if not exists person uuid;
update public.onboarding_progress set person = profile_id where person is null and profile_id is not null;

create or replace function public.log_onboarding_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v smallint;
begin
  if tg_op = 'UPDATE' and old.onboarded then return new; end if;
  v := public.onboarding_step_of(new);
  if v > 0 then
    insert into public.onboarding_progress (profile_id, person, step, signed_up, country_code)
    select new.id, new.id, s, new.created_at, new.country_code from generate_series(1, v) s
    on conflict (profile_id, step) where profile_id is not null do nothing;
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.log_onboarding_progress() from public, anon, authenticated;
