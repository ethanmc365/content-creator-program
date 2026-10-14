-- 421: ACCEPT NOW, JOIN AFTER THE ONBOARDING CALL (15 Oct 2026).
--
-- Ethan: "Rather than Accept now, they'll automatically be accepted in after the period of the call. Even though I press
-- Accept now, only after they join the call are they actually part of the community. Also, you can override this and
-- accept them in immediately."
--
-- An application with a booked call (profiles.onboarding_call_at) can be approved AHEAD: the decision is stored here with
-- the markets (or VIP programme) picked on the card, and the approval itself runs once the call has ended (call start +
-- its length). "Accept now" approves at once and clears the row. Nothing new on a timer: the five-minute job that
-- already publishes scheduled challenges runs the due approvals too, and the applicant's own app claims theirs the
-- moment it is due.
--
-- The approval bodies move into _internal twins (no admin check, revoked from the API) so the job can run them; the
-- admin functions are now a check plus a call, unchanged for every caller.

create table if not exists public.scheduled_approvals (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  market_slugs  text[] not null default '{}',
  vip_programme uuid references public.vip_programmes(id) on delete set null,
  approve_at    timestamptz not null,
  scheduled_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.scheduled_approvals enable row level security;
drop policy if exists scheduled_approvals_admin on public.scheduled_approvals;
create policy scheduled_approvals_admin on public.scheduled_approvals for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists scheduled_approvals_own on public.scheduled_approvals;
create policy scheduled_approvals_own on public.scheduled_approvals for select to authenticated
  using (profile_id = (select auth.uid()));
create index if not exists scheduled_approvals_due on public.scheduled_approvals (approve_at);

CREATE OR REPLACE FUNCTION public.approve_application_internal(target uuid, p_market_slugs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_profile public.profiles%rowtype;
  v_slugs   text[] := coalesce(p_market_slugs, '{}');
  v_slug    text;
  v_market  public.communities%rowtype;
  v_names   text[] := '{}';
  v_had_home boolean;
  v_first   boolean := true;
begin

  select * into v_profile from public.profiles where id = target;
  if v_profile.id is null then
    raise exception 'Creator not found';
  end if;

  -- EVERY SLUG IS RESOLVED AND CHECKED BEFORE ANYTHING IS WRITTEN, so a typo in
  -- the third one cannot leave somebody approved and half-placed.
  foreach v_slug in array v_slugs loop
    select * into v_market from public.communities where slug = v_slug;
    if v_market.id is null then
      raise exception 'No market called "%"', v_slug;
    end if;
    if v_market.kind <> 'chapter' then
      raise exception '% is not a market', v_market.name;
    end if;
  end loop;

  update public.profiles set status = 'active' where id = target;
  -- Approved now, so any acceptance waiting for an onboarding call is done (migration 421).
  delete from public.scheduled_approvals where profile_id = target;

  -- Does this creator already have a home chapter? An admin adding markets to
  -- somebody must not silently move a home they already have.
  v_had_home := exists (
    select 1
    from public.community_members m
    join public.communities c on c.id = m.community_id
    where m.profile_id = target and m.is_home and c.kind = 'chapter'
  );

  foreach v_slug in array v_slugs loop
    select * into v_market from public.communities where slug = v_slug;

    insert into public.community_members (community_id, profile_id, role, is_home, status)
    values (v_market.id, target, 'creator', v_first and not v_had_home, 'active')
    on conflict (community_id, profile_id)
      do update set status = 'active';

    v_names := v_names || v_market.name;
    v_first := false;
  end loop;

  return jsonb_build_object(
    'creator', v_profile.name,
    'markets', to_jsonb(v_names),
    -- A sentence the client can print without reassembling it, so the toast and
    -- the confirmation dialog cannot drift apart from what actually happened.
    'summary', case
      when array_length(v_names, 1) is null then 'the worldwide community only'
      when array_length(v_names, 1) = 1 then v_names[1]
      else array_to_string(v_names[1:array_length(v_names,1)-1], ', ')
           || ' and ' || v_names[array_length(v_names,1)]
    end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_approve_application(target uuid, p_market_slugs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  return public.approve_application_internal(target, p_market_slugs);
end;
$function$;

CREATE OR REPLACE FUNCTION public.approve_vip_application_internal(target uuid, p_programme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pr record; v_res jsonb;
begin
  select p.id, p.name, c.slug, c.kind into pr
    from public.vip_programmes p join public.communities c on c.id = p.community_id
   where p.id = p_programme and p.active;
  if pr.id is null then raise exception 'Pick a VIP market to approve them into.'; end if;
  -- The market side (a market's community, or only the worldwide community for VIP Worldwide), then the VIP side.
  v_res := public.approve_application_internal(target, case when pr.kind = 'chapter' then array[pr.slug] else '{}'::text[] end);
  update public.vip_members set programme_id = p_programme, auto_home = false, status = 'active', left_on = null
   where profile_id = target and status in ('active', 'paused');
  insert into public.community_members (community_id, profile_id, role, status)
  select p.community_id, target, 'creator', 'active' from public.vip_programmes p where p.id = p_programme
  on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';
  perform public.vip_ensure_month(p_programme);
  return v_res || jsonb_build_object('summary', pr.name);
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_approve_vip_application(target uuid, p_programme uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return public.approve_vip_application_internal(target, p_programme);
end $function$;

-- Approve ahead: the card's markets (or VIP programme) are kept and applied when the call is over.
create or replace function public.admin_schedule_approval(target uuid, p_market_slugs text[], p_programme uuid, p_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_at is null then raise exception 'No call time to wait for.'; end if;
  if not exists (select 1 from public.profiles where id = target and status = 'pending') then
    raise exception 'This application is no longer waiting.';
  end if;
  if p_at <= now() then
    if p_programme is not null then perform public.approve_vip_application_internal(target, p_programme);
    else perform public.approve_application_internal(target, p_market_slugs); end if;
    return now();
  end if;
  insert into public.scheduled_approvals (profile_id, market_slugs, vip_programme, approve_at, scheduled_by)
  values (target, coalesce(p_market_slugs, '{}'), p_programme, p_at, auth.uid())
  on conflict (profile_id) do update set market_slugs = excluded.market_slugs, vip_programme = excluded.vip_programme,
    approve_at = excluded.approve_at, scheduled_by = excluded.scheduled_by, created_at = now();
  return p_at;
end $$;

create or replace function public.admin_cancel_scheduled_approval(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from public.scheduled_approvals where profile_id = target;
end $$;

-- Runs every due approval. Each in its own sub-block so one failure (a market renamed since) does not stop the rest;
-- a failed row stays and is retried next time.
create or replace function public.run_due_approvals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; n integer := 0;
begin
  for r in select * from public.scheduled_approvals where approve_at <= now() order by approve_at for update skip locked loop
    begin
      if exists (select 1 from public.profiles where id = r.profile_id and status = 'pending') then
        if r.vip_programme is not null then perform public.approve_vip_application_internal(r.profile_id, r.vip_programme);
        else perform public.approve_application_internal(r.profile_id, r.market_slugs); end if;
        n := n + 1;
      end if;
      delete from public.scheduled_approvals where profile_id = r.profile_id;
    exception when others then
      raise warning 'run_due_approvals %: %', r.profile_id, sqlerrm;
    end;
  end loop;
  return n;
end $$;

-- The applicant's app asks on load: if their acceptance is due they are in now, without waiting for the job.
create or replace function public.claim_my_scheduled_approval()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if auth.uid() is null then return false; end if;
  select * into r from public.scheduled_approvals where profile_id = auth.uid() and approve_at <= now();
  if r.profile_id is null then return false; end if;
  if r.vip_programme is not null then perform public.approve_vip_application_internal(r.profile_id, r.vip_programme);
  else perform public.approve_application_internal(r.profile_id, r.market_slugs); end if;
  delete from public.scheduled_approvals where profile_id = r.profile_id;
  return true;
end $$;

revoke all on function public.approve_application_internal(uuid, text[]) from public, anon, authenticated;
revoke all on function public.approve_vip_application_internal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.run_due_approvals() from public, anon, authenticated;
insert into public.owner_only_rpcs (proname, why) values
  ('approve_application_internal', '421: approval body without the admin check, for scheduled approvals'),
  ('approve_vip_application_internal', '421: VIP approval body without the admin check'),
  ('run_due_approvals', '421: cron only')
on conflict do nothing;
select public.lock_down_definer_functions();
grant execute on function public.admin_schedule_approval(uuid, text[], uuid, timestamptz) to authenticated;
grant execute on function public.admin_cancel_scheduled_approval(uuid) to authenticated;
grant execute on function public.claim_my_scheduled_approval() to authenticated;

-- The existing five-minute publisher runs the due approvals too (no new job).
select cron.alter_job(jobid, command := 'select public.publish_scheduled_challenges(); select public.run_due_approvals();')
  from cron.job where jobname = 'publish-scheduled-challenges';
