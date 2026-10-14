-- 413: AN ONBOARDING CALL AT THE END OF SIGN-UP, PER MARKET (14 Oct 2026).
--
-- Ethan: new Spanish creators must book a 15-minute onboarding call with Marta (Spain's country manager) before they
-- are accepted. Only for the market that turns it on (Spain first; the UK or Germany later), so it is a per-market
-- setting the team edits in Applications > Sign-up, never a hard-coded link.
--
-- We cannot see inside Google Calendar, so "booked" is the applicant's own tick after opening the booking page, and
-- both moments are stamped so the team can see who opened it and who says they booked.

create table if not exists market_signup_settings (
  community_id uuid primary key references communities(id) on delete cascade,
  call_enabled boolean not null default false,
  call_url text check (call_url is null or call_url ~* '^https?://'),
  call_minutes integer not null default 15 check (call_minutes between 5 and 120),
  host_profile_id uuid references profiles(id) on delete set null,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);

alter table market_signup_settings enable row level security;

drop policy if exists market_signup_settings_admin on market_signup_settings;
create policy market_signup_settings_admin on market_signup_settings
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

alter table profiles add column if not exists onboarding_call_opened_at timestamptz;
alter table profiles add column if not exists onboarding_call_booked_at timestamptz;

-- What an applicant's sign-up shows: every enabled market's call, with the host's name, photo and title. Definer so a
-- pending applicant (who cannot read team profiles) still sees who they are booking with.
create or replace function signup_calls()
returns table (community_id uuid, call_url text, call_minutes integer, note text,
               host_name text, host_photo_url text, host_title text)
language sql
stable
security definer
set search_path = public
as $$
  select s.community_id, s.call_url, s.call_minutes, s.note,
         h.name, h.photo_url, h.role_title
    from market_signup_settings s
    left join profiles h on h.id = s.host_profile_id
   where s.call_enabled and s.call_url is not null
$$;

-- The applicant's own two stamps. 'opened' keeps the first time; 'booked' is their tick; 'unbooked' undoes the tick.
create or replace function onboarding_call_mark(p_state text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_state = 'opened' then
    update profiles set onboarding_call_opened_at = coalesce(onboarding_call_opened_at, now()) where id = auth.uid();
  elsif p_state = 'booked' then
    update profiles set onboarding_call_booked_at = now(),
                        onboarding_call_opened_at = coalesce(onboarding_call_opened_at, now())
     where id = auth.uid();
  elsif p_state = 'unbooked' then
    update profiles set onboarding_call_booked_at = null where id = auth.uid();
  else
    raise exception 'BAD_STATE';
  end if;
end $$;

-- The team's editor (admins only, audited by updated_by).
create or replace function admin_set_signup_call(p_community uuid, p_enabled boolean, p_url text, p_minutes integer,
                                                 p_host uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_enabled and (p_url is null or p_url !~* '^https?://') then raise exception 'CALL_URL_REQUIRED'; end if;
  insert into market_signup_settings (community_id, call_enabled, call_url, call_minutes, host_profile_id, note, updated_at, updated_by)
  values (p_community, p_enabled, nullif(trim(p_url), ''), coalesce(p_minutes, 15), p_host, nullif(trim(p_note), ''), now(), auth.uid())
  on conflict (community_id) do update
     set call_enabled = excluded.call_enabled, call_url = excluded.call_url, call_minutes = excluded.call_minutes,
         host_profile_id = excluded.host_profile_id, note = excluded.note, updated_at = now(), updated_by = auth.uid();
end $$;

-- Spain, on, with Marta's booking page.
insert into market_signup_settings (community_id, call_enabled, call_url, call_minutes, host_profile_id)
select c.id, true,
       'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2ff53dOm9Ij3YwwAzSL9HTEqtGUqZw-bXy8v0e3-ul-QxDPhu9quJM0aTk8h5y0Q9kRPEfnA_H',
       15, 'ff5460bc-91d3-46f1-8733-8a2ef846b3b5'
  from communities c where c.slug = 'spain'
on conflict (community_id) do nothing;

revoke all on function signup_calls() from public, anon;
revoke all on function onboarding_call_mark(text) from public, anon;
revoke all on function admin_set_signup_call(uuid, boolean, text, integer, uuid, text) from public, anon;
grant execute on function signup_calls() to authenticated;
grant execute on function onboarding_call_mark(text) to authenticated;
grant execute on function admin_set_signup_call(uuid, boolean, text, integer, uuid, text) to authenticated;
