-- 385 (13 Oct 2026): every running challenge is read each hour, a new entry is read as it arrives,
-- VIP and official creators earn the podium and first-video certificates, the boarding pass goes back to a draft.

-- 1. ONE SWEEP, NOT ONE REQUEST PER CHALLENGE.
-- Ethan: the Global Challenge said "10 typed in by hand". They were ten entries posted after the last read, never read
-- at all. run_view_sync fired one request per running challenge at the same instant; the first took the run lock and
-- every other one was answered 409 "busy", so each hour only one challenge was read. The edge function's own scheduled
-- path already reads every running challenge oldest-reading first, so it is asked once, with no challenge named.
create or replace function public.run_view_sync(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public', 'private', 'extensions' as $function$
declare
  cfg     jsonb := coalesce((select value from public.app_settings where key = 'view_sync'), '{}'::jsonb);
  enabled boolean := coalesce((cfg ->> 'enabled')::boolean, true);
  secret  text := (select value from private.config where key = 'webhook_secret');
  v_n     int;
begin
  if not p_force and not enabled then
    return jsonb_build_object('fired', false, 'reason', 'disabled');
  end if;
  if not p_force and public.view_sync_running() then
    return jsonb_build_object('fired', false, 'reason', 'already_running');
  end if;
  select count(*) into v_n from public.challenges
   where winners_published_at is null and end_date >= current_date and coalesce(status, '') <> 'draft';
  if v_n = 0 then
    return jsonb_build_object('fired', false, 'reason', 'no_running_challenge');
  end if;
  perform net.http_post(
    url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/view-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := '{}'::jsonb
  );
  return jsonb_build_object('fired', true, 'challenges', v_n);
end;
$function$;

-- 2. A NEW ENTRY IS READ AS IT ARRIVES. One small async request per entry, nothing on a timer. If a sweep is running
-- the request is turned away and the hourly sweep reads it instead (it has never been read, so it goes first).
create or replace function public.read_new_entry()
returns trigger language plpgsql security definer set search_path to 'public', 'private', 'extensions' as $$
declare secret text := (select value from private.config where key = 'webhook_secret');
begin
  begin
    if coalesce(new.video_url, '') <> '' then
      perform net.http_post(
        url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/view-sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
        body := jsonb_build_object('submission_ids', jsonb_build_array(new.id))
      );
    end if;
  exception when others then null;  -- reading early is a nicety; an entry must never fail to save because of it
  end;
  return new;
end $$;
drop trigger if exists read_new_entry on public.submissions;
create trigger read_new_entry after insert on public.submissions
  for each row execute function public.read_new_entry();

-- 3. VIP PODIUM CERTIFICATES.
-- Ethan: "turn on the same ones so it matches the general community. That means the Passport one when they first post a
-- video, and the Podium Finish one if they do it as a challenge run and finish on that challenge." A VIP's challenge is
-- a ranked monthly bonus (top_n). When a month's statement is approved, each placed top_n line awards the podium
-- design, once per statement and rule (source_key), with the same facts a community podium carries.
alter table public.certificate_awards add column if not exists source_key text;
drop index if exists public.certificate_awards_once;
create unique index certificate_awards_once on public.certificate_awards (design_id, profile_id,
  coalesce(challenge_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(milestone_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(source_key, ''));

create or replace function public.award_vip_podium_certificates_internal(p_statement uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  st record; b jsonb; d record; v_rank int; v_places int; v_label text; made int := 0;
begin
  select s.*, pr.name as person, com.name as market, m.year, m.month
    into st
    from public.vip_statements s
    join public.profiles pr on pr.id = s.profile_id
    join public.vip_months m on m.id = s.month_id
    join public.vip_programmes vp on vp.id = s.programme_id
    left join public.communities com on com.id = vp.community_id
   where s.id = p_statement;
  if st.id is null or st.status not in ('approved', 'paid') then return 0; end if;

  for b in select * from jsonb_array_elements(coalesce(st.bonuses, '[]'::jsonb)) loop
    continue when b ->> 'kind' <> 'top_n' or b ->> 'rule_id' is null;
    v_rank := nullif(substring(b ->> 'label' from '\((\d+)(?:st|nd|rd|th)\)\s*$'), '')::int;
    continue when v_rank is null;
    v_label := regexp_replace(b ->> 'label', '\s*\(\d+(st|nd|rd|th)\)\s*$', '');
    select coalesce(jsonb_array_length(r.places), 0) into v_places from public.vip_bonus_rules r where r.id = (b ->> 'rule_id')::uuid;
    for d in
      select * from public.certificate_designs
       where is_active and award_on = 'challenge_rank'
         and audience in ('all', 'vip') and public.certificate_audience_ok(audience, st.profile_id)
         and (v_rank = any(ranks) or (all_prize_places and v_rank between 1 and greatest(v_places, 1)))
    loop
      insert into public.certificate_awards (design_id, profile_id, community_id, facts, serial, source_key)
      values (d.id, st.profile_id, null,
              jsonb_strip_nulls(jsonb_build_object(
                'name', st.person, 'challenge', v_label, 'market', st.market, 'place', v_rank,
                'places', nullif(v_places, 0), 'views', nullif(st.views, 0),
                'date', (make_date(st.year, st.month, 1) + interval '1 month' - interval '1 day'))),
              public.certificate_serial(),
              'vip:' || st.id || ':' || (b ->> 'rule_id'))
      on conflict do nothing;
      if found then made := made + 1; end if;
    end loop;
  end loop;
  return made;
end $$;

create or replace function public.on_vip_statement_certificates()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.status in ('approved', 'paid') and old.status is distinct from new.status then
    begin
      perform public.award_vip_podium_certificates_internal(new.id);
    exception when others then
      perform public.report_system_error('certificates', 'vip-podium', 'Could not award a VIP podium certificate: ' || coalesce(sqlerrm, 'unknown'));
    end;
  end if;
  return new;
end $$;
drop trigger if exists award_vip_podium_certificates on public.vip_statements;
create trigger award_vip_podium_certificates after update of status on public.vip_statements
  for each row execute function public.on_vip_statement_certificates();

insert into public.owner_only_rpcs (proname, why) values
  ('read_new_entry', 'Trigger function'),
  ('award_vip_podium_certificates_internal', 'Certificate award, called by the statement trigger and the 385 backfill'),
  ('on_vip_statement_certificates', 'Trigger function')
on conflict do nothing;
select public.lock_down_definer_functions();

-- 4. THE DESIGNS. Ethan: "turn off the boarding pass one. Just make it back to a draft." The passport ("Official
-- Creator") stays the first-entry certificate, and it and the podium now reach VIP and official creators too.
update public.certificate_designs set is_active = false where award_on = 'creator_joined' and layout = 'boarding';
update public.certificate_designs set audience = 'all'
 where is_active and award_on in ('challenge_entry', 'challenge_rank') and audience = 'community';

-- 5. WHAT IS ALREADY OWED: every live VIP or official creator who has posted gets the passport, and every approved
-- statement's podium lines their certificate.
do $$
declare r record;
begin
  for r in select distinct vm.profile_id from public.vip_members vm where vm.status = 'active' loop
    perform public.award_entry_certificates_internal(r.profile_id);
  end loop;
  for r in select id from public.vip_statements where status in ('approved', 'paid') loop
    perform public.award_vip_podium_certificates_internal(r.id);
  end loop;
end $$;
