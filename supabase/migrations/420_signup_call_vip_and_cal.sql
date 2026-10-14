-- 420: ONE ONBOARDING CALL FOR THE GENERAL COMMUNITY AND ANOTHER FOR VIPS, BOOKED THROUGH CAL.COM (14 Oct 2026).
--
-- Ethan: Spain's general-community sign-ups and Spain's VIP sign-ups book with different links, and Cal.com replaces the
-- Google booking page. The step embeds Cal's page, which tells the app the moment a booking is made (its
-- bookingSuccessfulV2 message), so "booked" is now a fact with a time on it rather than a tick. Any other booking link
-- still works the old way: open it, then tick.
alter table market_signup_settings add column if not exists audience text not null default 'community';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'market_signup_settings_audience_check') then
    alter table market_signup_settings add constraint market_signup_settings_audience_check check (audience in ('community', 'vip'));
  end if;
end $$;
alter table market_signup_settings drop constraint if exists market_signup_settings_pkey;
alter table market_signup_settings add primary key (community_id, audience);

alter table profiles add column if not exists onboarding_call_at timestamptz;
alter table profiles add column if not exists onboarding_call_ref text;

drop function if exists signup_calls();
create function signup_calls()
returns table (community_id uuid, audience text, call_url text, call_minutes integer, note text,
               host_name text, host_photo_url text, host_title text)
language sql
stable
security definer
set search_path = public
as $$
  select s.community_id, s.audience, s.call_url, s.call_minutes, s.note, h.name, h.photo_url, h.role_title
    from market_signup_settings s
    left join profiles h on h.id = s.host_profile_id
   where s.call_enabled and s.call_url is not null
$$;

drop function if exists onboarding_call_mark(text);
create function onboarding_call_mark(p_state text, p_when timestamptz default null, p_ref text default null)
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
                        onboarding_call_opened_at = coalesce(onboarding_call_opened_at, now()),
                        onboarding_call_at = p_when,
                        onboarding_call_ref = left(p_ref, 120)
     where id = auth.uid();
  elsif p_state = 'unbooked' then
    update profiles set onboarding_call_booked_at = null, onboarding_call_at = null, onboarding_call_ref = null where id = auth.uid();
  else
    raise exception 'BAD_STATE';
  end if;
end $$;

drop function if exists admin_set_signup_call(uuid, boolean, text, integer, uuid, text);
create function admin_set_signup_call(p_community uuid, p_audience text, p_enabled boolean, p_url text, p_minutes integer,
                                      p_host uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_audience not in ('community', 'vip') then raise exception 'BAD_AUDIENCE'; end if;
  if p_enabled and (p_url is null or p_url !~* '^https?://') then raise exception 'CALL_URL_REQUIRED'; end if;
  insert into market_signup_settings (community_id, audience, call_enabled, call_url, call_minutes, host_profile_id, note, updated_at, updated_by)
  values (p_community, p_audience, p_enabled, nullif(trim(p_url), ''), coalesce(p_minutes, 15), p_host, nullif(trim(p_note), ''), now(), auth.uid())
  on conflict (community_id, audience) do update
     set call_enabled = excluded.call_enabled, call_url = excluded.call_url, call_minutes = excluded.call_minutes,
         host_profile_id = excluded.host_profile_id, note = excluded.note, updated_at = now(), updated_by = auth.uid();
end $$;

revoke all on function signup_calls() from public, anon;
revoke all on function onboarding_call_mark(text, timestamptz, text) from public, anon;
revoke all on function admin_set_signup_call(uuid, text, boolean, text, integer, uuid, text) from public, anon;
grant execute on function signup_calls() to authenticated;
grant execute on function onboarding_call_mark(text, timestamptz, text) to authenticated;
grant execute on function admin_set_signup_call(uuid, text, boolean, text, integer, uuid, text) to authenticated;
