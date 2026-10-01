-- 305: VIP fourth pass (1 Oct 2026).
--
-- Ethan: "The VIP link should never be expired or have to be replaced for anything." "Clean up the demo data."
-- "For the surveys there should be features built in so we can send it to just the VIP community and to just one of
-- them." "Properly set up these pages for Spain and Romania." "Make sure I can properly see and test everything."
--
-- 1. ONE SIGN-UP LINK THAT NEVER STOPS WORKING. A global VIP link is valid whatever its revoked_at says (the first
--    link, replaced on 1 Oct, said "expired" in another browser). Replacing it is no longer possible: the renew
--    function hands back the same link.
-- 2. SURVEYS GET A VIP AUDIENCE: every VIP, or the VIPs of the programmes picked (community_ids holds the
--    programmes' communities).
-- 3. THE DEMO PROGRAMME GOES (its creators are removed by scripts/seed-vip-demo.mjs --remove), and so does the test
--    claim made with the team's own account.
-- 4. A SANDBOX VIP (qa-vip@trypcreators.test, made by scripts/seed-qa-vip.mjs) so the creator-facing side can be
--    opened from the admin like the sandbox creator.
-- 5. Spain and Romania get real wording.

-- 1 ------------------------------------------------------------------------------------------------------------
create or replace function public.vip_invite_check(p_token text)
returns table(valid boolean, programme text, label text, language text)
language sql stable security definer set search_path to 'public'
as $$
  with i as (
    select x.*, (x.is_global or (x.revoked_at is null and (x.expires_at is null or x.expires_at > now())
                 and (x.max_uses is null or x.uses < x.max_uses))) as ok
      from public.vip_invites x where x.token = p_token)
  select i.ok,
         case when not i.ok then null when i.programme_id is null then 'the Tryp.com VIP creators' else p.name end,
         case when i.ok then i.label end,
         case when i.ok then c.language end
    from i
    left join public.vip_programmes p on p.id = i.programme_id
    left join public.communities c on c.id = p.community_id
$$;

create or replace function public.claim_vip_invite(p_token text)
returns boolean
language plpgsql security definer set search_path to 'public'
as $$
declare i public.vip_invites; v_prog uuid; v_comm uuid; v_auto boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.vip_members where profile_id = auth.uid() and status = 'active') then return true; end if;
  select * into i from public.vip_invites where token = p_token;
  if i.id is null then return false; end if;
  if not i.is_global and (i.revoked_at is not null or (i.expires_at is not null and i.expires_at < now())
     or (i.max_uses is not null and i.uses >= i.max_uses)) then
    return false;
  end if;
  if i.programme_id is null then
    select pr.id into v_prog from public.community_members cm
      join public.vip_programmes pr on pr.community_id = cm.community_id and pr.active
     where cm.profile_id = auth.uid() and cm.status = 'active' and cm.role <> 'manager' limit 1;
    if v_prog is null then
      select id into v_prog from public.vip_programmes where is_default and active;
      v_auto := true;
    end if;
    if v_prog is null then select id into v_prog from public.vip_programmes where active order by name limit 1; v_auto := true; end if;
  else
    v_prog := i.programme_id;
  end if;
  if v_prog is null then return false; end if;
  insert into public.vip_members (profile_id, programme_id, status, source, created_by, auto_home)
  values (auth.uid(), v_prog, 'active', 'invite', i.created_by, v_auto)
  on conflict (profile_id) do update set programme_id = excluded.programme_id, status = 'active', left_on = null, auto_home = excluded.auto_home;
  if i.programme_id is not null then
    select community_id into v_comm from public.vip_programmes where id = v_prog;
    insert into public.community_members (community_id, profile_id, role, status)
    values (v_comm, auth.uid(), 'creator', 'active')
    on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';
  end if;
  update public.vip_invites set uses = uses + 1 where id = i.id;
  perform public.vip_ensure_month(v_prog);
  return true;
end $$;

-- The link is never replaced: whoever asks gets the one that is already out there.
create or replace function public.vip_renew_global_link()
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
begin
  if not public.vip_has_access() then raise exception 'Only the people who run the VIP programme can see the sign-up link.'; end if;
  return public.vip_global_link();
end $$;

-- 2 ------------------------------------------------------------------------------------------------------------
alter table public.surveys drop constraint if exists surveys_audience_check;
alter table public.surveys add constraint surveys_audience_check
  check (audience in ('everyone', 'markets', 'challenge', 'vip'));

create or replace function public.survey_is_for(p_survey uuid, p_profile uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.surveys s
    where s.id = p_survey
      and s.status = 'live'
      and not s.is_test
      and (s.starts_at is null or s.starts_at <= now())
      and (s.ends_at is null or s.ends_at > now())
      and case s.audience
        when 'everyone' then true
        when 'markets' then exists (
          select 1 from public.community_members m
          where m.profile_id = p_profile and m.community_id = any(s.community_ids))
        when 'vip' then exists (
          select 1 from public.vip_members vm
            join public.vip_programmes vp on vp.id = vm.programme_id
          where vm.profile_id = p_profile and vm.status = 'active'
            and (cardinality(s.community_ids) = 0 or vp.community_id = any(s.community_ids)))
        when 'challenge' then exists (
          select 1 from public.challenges c
          join public.submissions sub on sub.challenge_id = c.id and sub.creator_id = p_profile
          where c.id = s.challenge_id and (c.end_date is null or c.end_date <= now()))
        else false
      end
  )
$$;

create or replace function public.survey_audience_size(p_survey uuid)
returns integer
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  s record;
  n integer;
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;
  select * into s from public.surveys where id = p_survey;
  if not found then return 0; end if;
  if s.audience = 'markets' then
    select count(distinct p.id) into n from public.profiles p
    join public.community_members m on m.profile_id = p.id and m.community_id = any(s.community_ids)
    where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_admin, false);
  elsif s.audience = 'vip' then
    select count(distinct p.id) into n from public.profiles p
    join public.vip_members vm on vm.profile_id = p.id and vm.status = 'active'
    join public.vip_programmes vp on vp.id = vm.programme_id
    where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_admin, false)
      and (cardinality(s.community_ids) = 0 or vp.community_id = any(s.community_ids));
  elsif s.audience = 'challenge' then
    select count(distinct sub.creator_id) into n from public.submissions sub
    join public.profiles p on p.id = sub.creator_id
    where sub.challenge_id = s.challenge_id and not coalesce(p.is_test, false);
  else
    select count(*) into n from public.profiles p
    where p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_admin, false);
  end if;
  return coalesce(n, 0);
end $$;

-- 3 ------------------------------------------------------------------------------------------------------------
delete from public.vip_members where programme_id in (select id from public.vip_programmes where name = 'VIP Demo');
delete from public.vip_programmes where name = 'VIP Demo';
delete from public.communities where slug = 'vip-demo';
-- the test claim made with the owner's own account through the first link
delete from public.vip_members m using public.profiles p
 where p.id = m.profile_id and m.source = 'invite' and not p.is_test and p.platform_role = 'owner';
update public.profiles p set is_vip = exists (select 1 from public.vip_members m where m.profile_id = p.id and m.status = 'active')
 where p.is_vip and p.platform_role = 'owner';

-- 4 ------------------------------------------------------------------------------------------------------------
do $$
declare v_id uuid; v_prog uuid; v_comm uuid;
begin
  select id into v_id from auth.users where email = 'qa-vip@trypcreators.test';
  if v_id is null then raise notice 'qa-vip is missing: run scripts/seed-qa-vip.mjs'; return; end if;
  update public.profiles set
    name = 'Test VIP Account', is_test = true, is_sandbox = true, status = 'active', onboarded = true, is_admin = false,
    country = 'Spain', country_code = 'ES', city = 'Madrid', city_lat = 40.41, city_lng = -3.7,
    about = 'The sandbox VIP the team uses to see the creator-facing VIP pages.', accepted_at = coalesce(accepted_at, now()),
    submitted_at = coalesce(submitted_at, now()), tour_completed_at = coalesce(tour_completed_at, now()), connect_gate_done = true,
    languages = array['English', 'Spanish']
   where id = v_id;
  select id, community_id into v_prog, v_comm from public.vip_programmes where name = 'VIP Spain';
  insert into public.vip_members (profile_id, programme_id, status, source, terms_accepted_at, terms_version)
  values (v_id, v_prog, 'active', 'admin', now(), 1)
  on conflict (profile_id) do update set programme_id = excluded.programme_id, status = 'active', left_on = null;
  insert into public.community_members (community_id, profile_id, role, status)
  values (v_comm, v_id, 'creator', 'active')
  on conflict (community_id, profile_id) do update set status = 'active';
  perform public.vip_ensure_month(v_prog);
end $$;

-- 5 ------------------------------------------------------------------------------------------------------------
update public.vip_programmes set
  tagline = 'Your own corner of Tryp.com: paid by every view.',
  welcome_message = 'Welcome to the Spanish VIP creators. Post as you normally would, add every video on your VIP page, and you are paid for the views each one earns in the month. The team is one message away in your VIP room.'
 where name = 'VIP Spain' and tagline is null;
update public.vip_programmes set
  tagline = 'Your own corner of Tryp.com: paid by every view.',
  welcome_message = 'Welcome to the Romanian VIP creators. Post as you normally would, add every video on your VIP page, and you are paid for the views each one earns in the month. The team is one message away in your VIP room.'
 where name = 'VIP Romania' and tagline is null;
