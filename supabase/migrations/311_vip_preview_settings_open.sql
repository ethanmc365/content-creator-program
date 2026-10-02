-- 311: VIP automations that actually run, per-creator settings, the team's "see it as the creator" preview, and
-- opening a new VIP market in one call (2 Oct 2026).
--
-- 1. THE SIX VIP CRON JOBS NEVER RAN. jobid 22-27 sat in cron.job, active, identical in every column to jobs that
--    did run, with ZERO rows in cron.job_run_details since 30 Sep. Ethan said yes in chat; they were unscheduled and
--    scheduled again by name on 2 Oct (now jobid 28-33) and the first sync read the test account's video at once
--    (404 views). That is why "the scraper didn't read the views": nothing was asking it to. Re-done here by name,
--    idempotently, so a fresh database ends in the same state.
--    And a VIP video is now read THE MOMENT IT IS INSERTED, by a trigger, whatever path inserted it - the nudge used
--    to live only inside vip_submit_video, so a row added any other way waited for the hourly pass.
--    NOTE for whoever reads cron-health next: it judges each job by its LATEST run, and a job that has never run has
--    none - which is exactly how this hid for two days. Check cron.job_run_details for a new job after a day.
--
-- 2. PER-CREATOR SETTINGS. Ethan: "ensure the function is set up so they can set CPM rates per creator etc and a
--    lot of settings to customise for each VIP creator." A VIP already had their own CPM, cap, targets and notes.
--    Added: their own RATE TIERS (a ladder that replaces the market's), a MONTHLY FEE (a fixed retainer on top of
--    views pay, optionally only once they have posted N videos that month), and whether the market's BONUSES
--    apply to them. All of it reaches the real money: vip_compute_statements, the live overview, the team's
--    overview, the standings and the KPI spend all read the member's tiers now. `vip_member_settings` writes any
--    subset in one call.
--
-- 3. THE TEAM SEES THE CREATOR'S PAGE, EXACTLY. Ethan: "the VIP page for admins is not useful ... it should show
--    everything the creators can see, see it how they can exactly." Not a staff-shaped copy: the creator's own
--    functions (vip_my_overview, vip_my_statements, vip_my_trends, vip_my_perks, vip_board) now ask `vip_who()`
--    instead of auth.uid(), and `vip_who()` is the signed-in person UNLESS `vip_preview` has set a transaction-local
--    "previewing as" for a member of a programme the caller manages. Clients cannot set that setting (PostgREST
--    only sets request.*), so the only door is vip_preview, and it checks vip_can_manage first. Read-only by
--    construction: every write function still checks auth.uid() itself.
--
-- 4. OPENING A VIP MARKET. Ethan: "ensure that the function and automations are set up for opening a new VIP
--    community and everything is automatic." vip_open_programme makes the programme, its VIP room, its VIP
--    announcements room, the worldwide VIP lounge if missing and the current month, and the crons pick it up on
--    their next tick because they iterate programmes rather than naming them.

-- ------------------------------------------------------------------------------------------- 1. jobs that run
do $$
declare r record;
begin
  for r in select * from (values
      ('vip-close', '*/10 * * * *', 'select public.vip_close_due()'),
      ('vip-sync', '37 * * * *', 'select public.vip_run_sync()'),
      ('vip-nudges', '15 9 * * *', 'select public.vip_nudges()'),
      ('vip-weekly-digest', '5 8 * * 1', 'select public.vip_weekly_digest()'),
      ('vip-milestones', '30 9 * * *', 'select public.vip_milestones()'),
      ('vip-award-perks', '50 * * * *', 'select public.vip_award_perks()')) as t(name, sched, cmd)
  loop
    -- Only re-arm a job that has never run; one that is running is left alone.
    if not exists (select 1 from cron.job j join cron.job_run_details d on d.jobid = j.jobid where j.jobname = r.name) then
      if exists (select 1 from cron.job where jobname = r.name) then perform cron.unschedule(r.name); end if;
      perform cron.schedule(r.name, r.sched, r.cmd);
    end if;
  end loop;
end $$;

create or replace function public.vip_read_new_video()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.vip_run_sync(false, new.programme_id);
  exception when others then null; -- the hourly pass still reads it; an insert must never fail on a nudge
  end;
  return null;
end $$;
revoke execute on function public.vip_read_new_video() from public;
revoke execute on function public.vip_read_new_video() from anon;
revoke execute on function public.vip_read_new_video() from authenticated;

drop trigger if exists trg_vip_read_new_video on public.vip_videos;
create trigger trg_vip_read_new_video after insert on public.vip_videos
  for each row execute function public.vip_read_new_video();

-- vip_submit_video already nudges; with the trigger it would nudge twice in one statement. Take its own call out.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.vip_submit_video(text,text,text)'::regprocedure);
  n := regexp_replace(d, E'\\n  -- Read it now[^\\n]*\\n  begin\\n    perform public\\.vip_run_sync\\(false, m\\.programme_id\\);\\n  exception when others then null;[^\\n]*\\n  end;', E'\n  -- Read at once by trg_vip_read_new_video (migration 311).');
  if n <> d then execute n; end if;
end $$;

-- ------------------------------------------------------------------------------------------- 2. settings
alter table public.vip_members
  add column if not exists tiers jsonb,
  add column if not exists monthly_fee numeric,
  add column if not exists fee_min_videos integer,
  add column if not exists bonuses_on boolean not null default true;

do $$ begin
  alter table public.vip_members add constraint vip_members_fee_ok check (monthly_fee is null or monthly_fee >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.vip_members add constraint vip_members_fee_min_ok check (fee_min_videos is null or fee_min_videos >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.vip_members add constraint vip_members_tiers_ok check (tiers is null or jsonb_typeof(tiers) = 'array');
exception when duplicate_object then null; end $$;

-- Everything that turns views into money reads the MEMBER'S ladder when they have one. vip_views_pay is unchanged:
-- with no ladder of their own the call is exactly what it was (their flat rate as the override, else the market's
-- ladder from the market's rate); with one, their own base rate and their own ladder.
do $$
declare f text; d text; n text;
begin
  foreach f in array array['vip_my_overview()', 'vip_compute_statements(uuid)', 'vip_staff_overview(uuid)',
                           'vip_admin_overview(uuid)', 'vip_market_standings()', 'vip_kpi_actuals(uuid,integer,integer)',
                           'vip_my_recap(integer,integer)']
  loop
    d := pg_get_functiondef(('public.' || f)::regprocedure);
    n := regexp_replace(d, 'p\.cpm, p\.tiers, (m|vm|mem)\.cpm\)',
                        'coalesce(\1.cpm, p.cpm), coalesce(\1.tiers, p.tiers), case when \1.tiers is null then \1.cpm end)', 'g');
    if n = d then raise exception '311: no views-pay call rewritten in %', f; end if;
    execute n;
  end loop;
end $$;

-- The statement: bonuses only when they are on for this VIP, and the monthly fee as a cash line of its own.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.vip_compute_statements(uuid)'::regprocedure);
  n := replace(d,
    'where r.programme_id = m.programme_id and r.active and (r.month_id is null or r.month_id = p_month)',
    'where r.programme_id = m.programme_id and r.active and (r.month_id is null or r.month_id = p_month)
         and coalesce(mem.bonuses_on, true)');
  if n = d then raise exception '311: bonus switch not applied'; end if;
  d := n;
  n := replace(d,
    E'    select coalesce(sum((b ->> \'amount\')::numeric) filter (where coalesce(b ->> \'reward\', \'cash\') = \'cash\'), 0)\n      into v_cash',
    E'    -- THE MONTHLY FEE (migration 311): a fixed cash line, paid to an active VIP who posted at least the videos\n'
    || E'    -- it asks for (none, unless set).\n'
    || E'    if coalesce(mem.monthly_fee, 0) > 0 and mem.status = \'active\' and v_videos >= coalesce(mem.fee_min_videos, 0) then\n'
    || E'      v_bonuses := v_bonuses || jsonb_build_object(\'rule_id\', null, \'label\', \'Monthly fee\', \'kind\', \'fee\', \'reward\', \'cash\', \'amount\', mem.monthly_fee);\n'
    || E'    end if;\n'
    || E'    select coalesce(sum((b ->> \'amount\')::numeric) filter (where coalesce(b ->> \'reward\', \'cash\') = \'cash\'), 0)\n      into v_cash');
  if n = d then raise exception '311: monthly fee not applied'; end if;
  execute n;
end $$;

-- The creator's own page says what is theirs: their ladder, their fee, whether bonuses apply.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.vip_my_overview()'::regprocedure);
  n := replace(d, '''target_videos'', m.target_videos, ''target_views'', m.target_views,',
    '''target_videos'', m.target_videos, ''target_views'', m.target_views, ''tiers'', m.tiers, ''monthly_fee'', m.monthly_fee,
        ''fee_min_videos'', m.fee_min_videos, ''bonuses_on'', m.bonuses_on,');
  if n = d then raise exception '311: member fields not added'; end if;
  execute n;
end $$;

create or replace function public.vip_member_settings(p_profile uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prog uuid; s jsonb := coalesce(p_settings, '{}'::jsonb); t jsonb; e jsonb;
begin
  select programme_id into v_prog from public.vip_members where profile_id = p_profile;
  if v_prog is null then raise exception 'That creator is not a VIP.'; end if;
  if not public.vip_can_manage(v_prog) then raise exception 'Only the market lead or the team can change a VIP.'; end if;
  if s ? 'status' and s ->> 'status' not in ('active', 'paused', 'left') then raise exception 'Unknown status.'; end if;
  if s ? 'cpm' and s ->> 'cpm' is not null and (s ->> 'cpm')::numeric < 0 then raise exception 'A rate cannot be negative.'; end if;
  if s ? 'tiers' and jsonb_typeof(s -> 'tiers') = 'array' then
    t := '[]'::jsonb;
    for e in select * from jsonb_array_elements(s -> 'tiers') loop
      if coalesce((e ->> 'from_views')::numeric, 0) <= 0 or coalesce((e ->> 'cpm')::numeric, -1) < 0 then
        raise exception 'Each step needs a views figure above zero and a rate.';
      end if;
      t := t || jsonb_build_object('from_views', (e ->> 'from_views')::numeric, 'cpm', (e ->> 'cpm')::numeric);
    end loop;
    if jsonb_array_length(t) = 0 then t := null; end if;
  end if;
  update public.vip_members set
    status = case when s ? 'status' then s ->> 'status' else status end,
    left_on = case when s ->> 'status' = 'left' then current_date when s ->> 'status' in ('active', 'paused') then null else left_on end,
    cpm = case when s ? 'cpm' then (s ->> 'cpm')::numeric else cpm end,
    tiers = case when s ? 'tiers' then t else tiers end,
    monthly_cap = case when s ? 'monthly_cap' then (s ->> 'monthly_cap')::numeric else monthly_cap end,
    monthly_fee = case when s ? 'monthly_fee' then nullif((s ->> 'monthly_fee')::numeric, 0) else monthly_fee end,
    fee_min_videos = case when s ? 'fee_min_videos' then (s ->> 'fee_min_videos')::int else fee_min_videos end,
    bonuses_on = case when s ? 'bonuses_on' then coalesce((s ->> 'bonuses_on')::boolean, true) else bonuses_on end,
    target_videos = case when s ? 'target_videos' then (s ->> 'target_videos')::int else target_videos end,
    target_views = case when s ? 'target_views' then (s ->> 'target_views')::bigint else target_views end,
    rate_review_on = case when s ? 'rate_review_on' then (s ->> 'rate_review_on')::date else rate_review_on end,
    headline = case when s ? 'headline' then nullif(btrim(s ->> 'headline'), '') else headline end,
    show_on_map = case when s ? 'show_on_map' then coalesce((s ->> 'show_on_map')::boolean, true) else show_on_map end,
    notes = case when s ? 'notes' then nullif(btrim(s ->> 'notes'), '') else notes end
  where profile_id = p_profile;
  return (select to_jsonb(m) - 'terms_accepted_at' from public.vip_members m where profile_id = p_profile);
end $$;

-- ------------------------------------------------------------------------------------------- 3. preview
create or replace function public.vip_who()
returns uuid language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('vip.preview_as', true), '')::uuid, auth.uid())
$$;

do $$
declare f text; d text; n text;
begin
  foreach f in array array['vip_my_overview()', 'vip_my_statements()', 'vip_my_trends(integer)', 'vip_my_perks()', 'vip_board()']
  loop
    d := pg_get_functiondef(('public.' || f)::regprocedure);
    n := replace(d, 'auth.uid()', 'public.vip_who()');
    if n = d then raise exception '311: % has no auth.uid() to replace', f; end if;
    execute n;
  end loop;
end $$;

-- What a member of this programme sees, for the team. `p_what`: overview | statements | trends | perks | board.
create or replace function public.vip_preview(p_who uuid, p_what text, p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prog uuid; r jsonb;
begin
  select programme_id into v_prog from public.vip_members where profile_id = p_who;
  if v_prog is null then raise exception 'That creator is not a VIP.'; end if;
  if not public.vip_can_manage(v_prog) then raise exception 'Only the market lead or the team can preview a VIP page.'; end if;
  perform set_config('vip.preview_as', p_who::text, true);
  r := case p_what
    when 'overview' then public.vip_my_overview() || jsonb_build_object('preview', true)
    when 'statements' then public.vip_my_statements()
    when 'trends' then public.vip_my_trends(coalesce(p_days, 30))
    when 'perks' then public.vip_my_perks()
    when 'board' then public.vip_board()
    else null end;
  perform set_config('vip.preview_as', '', true);
  if p_what not in ('overview', 'statements', 'trends', 'perks', 'board') then raise exception 'Unknown preview.'; end if;
  return r;
end $$;

-- Who can be previewed in a programme: everybody who is or was a VIP there, sandbox and test accounts included (so
-- the team can check the test account's page), marked as such.
create or replace function public.vip_preview_people(p_programme uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vip_can_manage(p_programme) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'photo', pr.photo_url, 'status', vm.status,
             'test', coalesce(pr.is_test, false) or coalesce(pr.is_sandbox, false))
             order by (vm.status = 'active') desc, coalesce(pr.is_test, false) or coalesce(pr.is_sandbox, false), pr.name)
      from public.vip_members vm join public.profiles pr on pr.id = vm.profile_id
     where vm.programme_id = p_programme), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------------------------------- 4. open a VIP market
create or replace function public.vip_open_programme(
  p_community uuid, p_name text default null, p_cpm numeric default 0.25, p_tiers jsonb default null,
  p_monthly_cap numeric default null, p_min_payout numeric default 0, p_budget numeric default null,
  p_tagline text default null, p_welcome text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.communities; v_id uuid;
begin
  if not public.is_owner() and not public.is_global_admin() then raise exception 'Only a global admin can open a VIP market.'; end if;
  select * into c from public.communities where id = p_community;
  if c.id is null or c.kind <> 'chapter' then raise exception 'Pick a market to open the VIP market in.'; end if;
  if exists (select 1 from public.vip_programmes where community_id = p_community) then
    raise exception '% already has a VIP market.', c.name;
  end if;
  if coalesce(p_cpm, -1) < 0 then raise exception 'The rate cannot be negative.'; end if;
  insert into public.vip_programmes (community_id, name, currency, cpm, tiers, monthly_cap, min_payout, budget_monthly,
                                     tagline, welcome_message, active)
  values (p_community, coalesce(nullif(btrim(p_name), ''), 'VIP ' || c.name), coalesce(c.currency, 'EUR'), p_cpm,
          case when jsonb_typeof(p_tiers) = 'array' and jsonb_array_length(p_tiers) > 0 then p_tiers end,
          p_monthly_cap, coalesce(p_min_payout, 0), p_budget, nullif(btrim(p_tagline), ''), nullif(btrim(p_welcome), ''), true)
  returning id into v_id;
  perform public.vip_ensure_rooms(v_id);
  insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
  values (p_community, 'vip_announcements', 'VIP announcements', 'News for the VIP creators of this market, from the team.',
          'megaphone', 'staff', 'vip', 4)
  on conflict do nothing;
  perform public.vip_ensure_month(v_id);
  return v_id;
end $$;

-- Grants: the event trigger revokes new functions from the public; authenticated gets the four doors, the rest stay
-- internal. (Separate statements, see the VIP trap notes.)
grant execute on function public.vip_member_settings(uuid, jsonb) to authenticated;
grant execute on function public.vip_preview(uuid, text, integer) to authenticated;
grant execute on function public.vip_preview_people(uuid) to authenticated;
grant execute on function public.vip_open_programme(uuid, text, numeric, jsonb, numeric, numeric, numeric, text, text) to authenticated;
grant execute on function public.vip_who() to authenticated;
revoke execute on function public.vip_member_settings(uuid, jsonb) from anon;
revoke execute on function public.vip_preview(uuid, text, integer) from anon;
revoke execute on function public.vip_preview_people(uuid) from anon;
revoke execute on function public.vip_open_programme(uuid, text, numeric, jsonb, numeric, numeric, numeric, text, text) from anon;
