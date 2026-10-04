-- 322 (4 Oct 2026): THE VIP STAY-IN RULE IS "AND", MONTHS CLOSE THEMSELVES, MORE MILESTONES, TIMED ANNOUNCEMENTS.
--
-- Ethan, 4 Oct 2026:
--   * Keeping a VIP place is "5 videos and 20,000 views" - BOTH, the views added up across the month - not "5 videos OR one
--     20,000-view video". vip_req_check now needs both; `views` is the month's total (the old `best_views` key is kept and
--     carries the same total, so the reviews table and old readers keep working).
--   * "Once the month closes ... I guess it should be added automatically": vip_programmes.auto_approve (default on).
--     When the month closes, every statement with nothing flagged is approved on the spot and lands in the creator's
--     balance; only the ones with a flag (a disqualified video, a missed requirement, nothing counted...) wait for a person.
--   * More things a milestone can be: views or videos in one month, the best single video, total earnings, months active,
--     months posting in a row.
--   * Announcements can carry an end date and go to every VIP market (owner), and the title is optional.
--
-- Function bodies below are the LIVE ones with only the changed lines replaced (see README: never retype a live function).
alter table public.vip_programmes add column if not exists auto_approve boolean not null default true;
alter table public.vip_announcements add column if not exists expires_at timestamptz;
alter table public.vip_announcements add column if not exists everywhere uuid;
alter table public.vip_announcements alter column title drop not null;

CREATE OR REPLACE FUNCTION public.vip_req_check(p_profile uuid, p_month uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mo public.vip_months; p public.vip_programmes; v_videos int; v_best bigint; v_total bigint;
begin
  select * into mo from public.vip_months where id = p_month;
  select * into p from public.vip_programmes where id = mo.programme_id;
  select count(*) filter (where v.status = 'tracking'
           and coalesce(v.posted_at, v.submitted_at) >= mo.starts_at and coalesce(v.posted_at, v.submitted_at) < mo.ends_at)::int,
         coalesce(max(public.vip_video_counted(v, mo)), 0),
         coalesce(sum(public.vip_video_counted(v, mo)), 0)::bigint
    into v_videos, v_best, v_total
    from public.vip_videos v where v.profile_id = p_profile and v.programme_id = mo.programme_id;
  return jsonb_build_object('videos', coalesce(v_videos, 0), 'views', coalesce(v_total, 0), 'best_views', coalesce(v_total, 0), 'best_video', coalesce(v_best, 0),
    'need_videos', p.req_videos, 'need_views', p.req_single_views, 'on', p.req_on,
    'met', not p.req_on or (coalesce(v_videos, 0) >= p.req_videos and coalesce(v_total, 0) >= p.req_single_views),
    'by', null);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_requirements(p_programme uuid, p_month uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.vip_programmes; mo public.vip_months; v_rows jsonb; v_months jsonb;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Only the VIP team can see this.'; end if;
  select * into p from public.vip_programmes where id = p_programme;
  if p_month is null then
    select * into mo from public.vip_months where programme_id = p_programme and status in ('open', 'closing') order by starts_at desc limit 1;
  else
    select * into mo from public.vip_months where id = p_month and programme_id = p_programme;
  end if;
  if mo.id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'year', x.year, 'month', x.month, 'status', x.status,
      'missed', (select count(*) from public.vip_requirement_reviews r where r.month_id = x.id and not r.met))
      order by x.starts_at desc), '[]'::jsonb)
    into v_months from (select * from public.vip_months where programme_id = p_programme order by starts_at desc limit 12) x;

  if mo.status = 'closed' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'profile_id', r.profile_id, 'name', pf.name, 'photo_url', pf.photo_url, 'status', vm.status,
        'videos', r.videos, 'views', r.best_views, 'best_views', r.best_views, 'met', r.met, 'decision', r.decision, 'note', r.note,
        'decided_at', r.decided_at,
        'missed_in_row', (select count(*) from (
            select rr.met, row_number() over (order by m2.starts_at desc) n,
                   sum(case when rr.met then 1 else 0 end) over (order by m2.starts_at desc) hits
              from public.vip_requirement_reviews rr join public.vip_months m2 on m2.id = rr.month_id
             where rr.profile_id = r.profile_id and m2.programme_id = p_programme and m2.starts_at <= mo.starts_at) q
            where q.hits = 0))
        order by r.met, pf.name), '[]'::jsonb)
      into v_rows
      from public.vip_requirement_reviews r
      join public.profiles pf on pf.id = r.profile_id
      left join public.vip_members vm on vm.profile_id = r.profile_id
     where r.month_id = mo.id and not public.vip_hidden_profile(r.profile_id);
  else
    select coalesce(jsonb_agg(z order by (z ->> 'met')::boolean, z ->> 'name'), '[]'::jsonb) into v_rows from (
      select jsonb_build_object('profile_id', m.profile_id, 'name', pf.name, 'photo_url', pf.photo_url, 'status', m.status,
          'videos', (c ->> 'videos')::int, 'views', (c ->> 'views')::bigint, 'best_views', (c ->> 'views')::bigint, 'met', (c ->> 'met')::boolean,
          'decision', null, 'note', null,
          'missed_in_row', (select count(*) from (
              select sum(case when rr.met then 1 else 0 end) over (order by m2.starts_at desc) hits
                from public.vip_requirement_reviews rr join public.vip_months m2 on m2.id = rr.month_id
               where rr.profile_id = m.profile_id and m2.programme_id = p_programme) q where q.hits = 0)) z
        from public.vip_members m
        join public.profiles pf on pf.id = m.profile_id
        cross join lateral public.vip_req_check(m.profile_id, mo.id) c
       where m.programme_id = p_programme and m.status = 'active' and not public.vip_hidden_profile(m.profile_id)) s;
  end if;

  return jsonb_build_object(
    'month', jsonb_build_object('id', mo.id, 'year', mo.year, 'month', mo.month, 'status', mo.status, 'ends_at', mo.ends_at, 'starts_at', mo.starts_at),
    'rule', jsonb_build_object('on', p.req_on, 'videos', p.req_videos, 'views', p.req_single_views),
    'months', v_months,
    'rows', v_rows);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_requirement_decide(p_month uuid, p_profile uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.vip_requirement_reviews; p public.vip_programmes; mo public.vip_months; v_label text;
begin
  select * into r from public.vip_requirement_reviews where month_id = p_month and profile_id = p_profile;
  if r.month_id is null then raise exception 'Nothing recorded for that creator in that month.'; end if;
  if not public.vip_can_manage(r.programme_id) then raise exception 'Only the market lead or the team can decide this.'; end if;
  if p_decision not in ('keep', 'warn', 'pause', 'remove') then raise exception 'Unknown decision.'; end if;
  select * into p from public.vip_programmes where id = r.programme_id;
  select * into mo from public.vip_months where id = p_month;
  v_label := to_char(make_date(mo.year, mo.month, 1), 'FMMonth');
  update public.vip_requirement_reviews set decision = p_decision, note = nullif(btrim(coalesce(p_note, '')), ''),
         decided_by = auth.uid(), decided_at = now()
   where month_id = p_month and profile_id = p_profile;
  if p_decision = 'warn' then
    perform public.notify_user(p_profile, 'vip', 'A note about your VIP place',
      'In ' || v_label || ' you did not reach ' || p.req_videos || ' videos and ' ||
      to_char(p.req_single_views, 'FM999,999,999') || ' views. Reach both this month to keep your place.'
      || coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/vip');
  elsif p_decision = 'pause' then
    perform public.vip_update_member(p_profile, 'paused');
    perform public.notify_user(p_profile, 'vip', 'Your VIP place is paused',
      'You did not reach the monthly requirement in ' || v_label || '. Talk to your market lead to restart.'
      || coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/vip');
  elsif p_decision = 'remove' then
    perform public.vip_update_member(p_profile, 'left');
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.vip_requirement_nudges()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_req int := 0; v_win int := 0;
begin
  -- 10 and 4 days before the month ends: an active VIP who has not met the rule yet.
  with due as (
    select m.profile_id, mo.id month_id, mo.ends_at, p.req_videos, p.req_single_views, c
      from public.vip_members m
      join public.vip_programmes p on p.id = m.programme_id and p.active and p.req_on
      join public.vip_months mo on mo.programme_id = p.id and mo.status = 'open'
      cross join lateral public.vip_req_check(m.profile_id, mo.id) c
     where m.status = 'active' and not (c ->> 'met')::boolean
       and ceil(extract(epoch from (mo.ends_at - now())) / 86400) in (10, 4)
       and not exists (select 1 from public.notifications n where n.recipient_id = m.profile_id and n.type = 'vip'
                        and n.title like 'Keep your VIP place%' and n.created_at > now() - interval '20 hours')
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select profile_id, 'vip', 'Keep your VIP place this month',
           greatest(0, req_videos - (c ->> 'videos')::int) || ' more video' || case when req_videos - (c ->> 'videos')::int = 1 then '' else 's' end ||
           ' to go and ' || to_char(greatest(0, req_single_views - (c ->> 'views')::bigint), 'FM999,999,999') || ' more views. ' ||
           ceil(extract(epoch from (ends_at - now())) / 86400) || ' days left.', '/vip'
      from due returning 1)
  select count(*) into v_req from ins;

  -- Two days before a payout window closes, for anybody with a balance who has not used it.
  with closing as (
    select m.profile_id, public.vip_balance(m.profile_id) bal, p.currency, p.min_payout, (public.vip_window(m.profile_id) ->> 'closes_at')::timestamptz closes
      from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
     where coalesce((public.vip_window(m.profile_id) ->> 'open')::boolean, false)
  ), due as (
    select * from closing c where c.bal > 0 and c.closes between now() + interval '1 day' and now() + interval '2 days'
       and not exists (select 1 from public.notifications n where n.recipient_id = c.profile_id and n.type = 'vip'
                        and n.title = 'Your payout window closes soon' and n.created_at > now() - interval '5 days')
  ), ins as (
    insert into public.notifications (recipient_id, type, title, body, link)
    select profile_id, 'vip', 'Your payout window closes soon',
           'You have ' || currency || ' ' || to_char(bal, 'FM999999990.00') || '. ' ||
           case when bal >= min_payout then 'Ask for it in cash, take a Tryp.com voucher, or let it keep growing.'
                else 'Take it as a Tryp.com travel voucher, or let it keep growing to ' || currency || ' ' || to_char(min_payout, 'FM999990') || '.' end,
           '/vip?tab=payouts'
      from due returning 1)
  select count(*) into v_win from ins;
  return jsonb_build_object('requirement', v_req, 'window', v_win);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_my_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.vip_members; p public.vip_programmes; mo public.vip_months;
  v_views bigint := 0; v_videos int := 0; v_base numeric; v_cap numeric; v_f numeric; v_proj_views numeric;
  v_videos_json jsonb; v_life record; v_rank int; v_total int; v_pay boolean;
begin
  select * into m from public.vip_members where profile_id = public.vip_who();
  if m is null then return null; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  mo := public.vip_ensure_month(p.id);

  select s.videos, s.views into v_videos, v_views from public.vip_month_stats(mo.id) s where s.profile_id = public.vip_who();
  v_views := coalesce(v_views, 0); v_videos := coalesce(v_videos, 0);
  v_base := public.vip_views_pay(v_views, coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end);
  v_cap := coalesce(m.monthly_cap, p.monthly_cap);
  if v_cap is not null and v_base > v_cap then v_base := v_cap; end if;

  v_f := greatest(0.0001, least(1, extract(epoch from (now() - mo.starts_at)) / nullif(extract(epoch from (mo.ends_at - mo.starts_at)), 0)));
  v_proj_views := case when v_f >= 0.08 then round(v_views / v_f) else null end;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'platform', v.platform, 'url', v.video_url, 'caption', v.caption, 'thumb', v.thumbnail_url,
      'posted_at', v.posted_at, 'submitted_at', v.submitted_at, 'views_total', v.logged_views,
      'views_counted', public.vip_video_counted(v, mo), 'status', v.status, 'reason', v.disqualified_reason,
      'synced_at', v.views_synced_at, 'error', v.views_sync_error, 'approx', v.views_approx)
      order by v.submitted_at desc), '[]'::jsonb)
    into v_videos_json from public.vip_videos v where v.profile_id = public.vip_who();

  select coalesce(sum(s.views), 0) as views, coalesce(sum(s.videos), 0) as videos, coalesce(max(s.base), 0) as best, coalesce(max(s.views), 0) as best_views
    into v_life from public.vip_statements s where s.profile_id = public.vip_who() and s.status <> 'void' and s.month_id <> mo.id;

  select rk, n into v_rank, v_total from (
    select profile_id, row_number() over (order by views desc, profile_id) rk, count(*) over () n
      from public.vip_month_stats(mo.id)) z where z.profile_id = public.vip_who();

  v_pay := public.vip_payment_ready(public.vip_who(), p.currency);

  return jsonb_build_object(
    'programme', jsonb_build_object('id', p.id, 'name', p.name, 'currency', p.currency, 'cpm', p.cpm, 'tiers', p.tiers,
        'min_payout', p.min_payout, 'monthly_cap', p.monthly_cap, 'window_days', p.window_days,
        'terms', p.terms, 'terms_version', p.terms_version, 'community_id', p.community_id),
    'member', jsonb_build_object('status', m.status, 'cpm', m.cpm, 'monthly_cap', m.monthly_cap,
        'target_videos', m.target_videos, 'target_views', m.target_views, 'own_goal_views', m.own_goal_views, 'tiers', m.tiers, 'monthly_fee', m.monthly_fee,
        'fee_min_videos', m.fee_min_videos, 'bonuses_on', m.bonuses_on, 'joined_on', m.joined_on,
        'terms_ok', m.terms_accepted_at is not null and coalesce(m.terms_version, 0) >= p.terms_version),
    'month', jsonb_build_object('id', mo.id, 'year', mo.year, 'month', mo.month, 'starts_at', mo.starts_at,
        'ends_at', mo.ends_at, 'status', mo.status),
    'stats', jsonb_build_object('views', v_views, 'videos', v_videos, 'base', v_base,
        'effective_cpm', coalesce(m.cpm, p.cpm), 'projected_views', v_proj_views,
        'projected_base', case when v_proj_views is null then null
                               else least(coalesce(v_cap, 1e12), public.vip_views_pay(v_proj_views::bigint, coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end)) end,
        'rank', v_rank, 'of', v_total),
    'lifetime', jsonb_build_object('views', v_life.views + v_views, 'videos', v_life.videos + v_videos, 'best_month', greatest(v_life.best, v_base), 'best_month_views', greatest(v_life.best_views, v_views)),
    'videos', v_videos_json,
    'payment_ready', v_pay);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_approve_statement(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.vip_statements; p public.vip_programmes; m public.vip_months; mem public.vip_members;
  v_b jsonb; v_vouch uuid[] := '{}'; v_id uuid; v_month text; v_bal numeric; v_auto jsonb; v_close timestamptz;
begin
  select * into s from public.vip_statements where id = p_id for update;
  if s is null then raise exception 'No such statement.'; end if;
  if auth.uid() is not null and not public.vip_can_manage(s.programme_id) then raise exception 'Only the market lead or the team can approve a statement.'; end if;
  if s.status <> 'draft' then raise exception 'That statement is not waiting for approval.'; end if;
  select * into p from public.vip_programmes where id = s.programme_id;
  select * into m from public.vip_months where id = s.month_id;
  select * into mem from public.vip_members where profile_id = s.profile_id;
  v_month := to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY');

  if s.total > 0 then
    insert into public.vip_ledger (profile_id, programme_id, kind, amount, currency, statement_id, month_id, note, created_by)
    values (s.profile_id, s.programme_id, 'earned', s.total, s.currency, s.id, s.month_id,
            v_month || ': ' || to_char(s.views, 'FM999,999,999,990') || ' views at ' || s.currency || ' ' ||
            rtrim(rtrim(round(coalesce(s.cpm, p.cpm), 4)::text, '0'), '.') || ' per 1,000'
            || case when jsonb_array_length(s.bonuses) > 0 then ', plus bonuses' else '' end, auth.uid())
    on conflict do nothing;
  end if;

  for v_b in select * from jsonb_array_elements(s.bonuses) loop
    if coalesce(v_b ->> 'reward', 'cash') = 'voucher' and (v_b ->> 'amount')::numeric > 0 then
      insert into public.rewards (creator_id, reward_type, amount, currency, status, community_id, source, payment_notes)
      values (s.profile_id, 'voucher', (v_b ->> 'amount')::numeric, s.currency, 'pending', p.community_id, 'vip',
              'VIP bonus, ' || v_month || ': ' || (v_b ->> 'label'))
      returning id into v_id;
      v_vouch := v_vouch || v_id;
    end if;
  end loop;

  update public.vip_statements
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), voucher_reward_ids = v_vouch, updated_at = now()
   where id = p_id;

  v_bal := public.vip_balance(s.profile_id);
  if coalesce(mem.auto_payout, false) and v_bal >= coalesce(p.min_payout, 0) and v_bal > 0
     and public.vip_payment_ready(s.profile_id, p.currency) then
    begin
      v_auto := public.vip_pay_out(s.profile_id, 'cash', true);
    exception when others then v_auto := null;  -- the creator can still ask by hand; the balance is untouched
    end;
  end if;

  if v_auto is null then
    v_close := greatest(m.ends_at + make_interval(days => p.request_days), now() + interval '3 days');
    perform public.notify_user(s.profile_id, 'vip', 'Your ' || v_month || ' VIP statement is ready',
      case when s.total > 0 then 'You earned ' || s.currency || ' ' || to_char(s.total, 'FM999999990.00') || '. ' else '' end ||
      'Your balance is ' || s.currency || ' ' || to_char(v_bal, 'FM999999990.00') || '. ' ||
      case when v_bal >= coalesce(p.min_payout, 0) and v_bal > 0
             then 'Ask for it in cash or as a Tryp.com voucher until ' || to_char(v_close, 'FMDD FMMonth') || ', or let it grow.'
           when v_bal > 0
             then 'Cash starts at ' || s.currency || ' ' || to_char(p.min_payout, 'FM999990') || '. Take it as a Tryp.com voucher until ' || to_char(v_close, 'FMDD FMMonth') || ', or let it grow.'
           else 'Keep posting, it adds up from here.' end,
      '/vip?tab=payouts');
  end if;
  return jsonb_build_object('balance', public.vip_balance(s.profile_id), 'auto', v_auto, 'vouchers', coalesce(array_length(v_vouch, 1), 0));
end $function$;

CREATE OR REPLACE FUNCTION public.vip_close_due()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p record; m record; v_closed int := 0; v_synced int := 0; v_n int; v_missed int; v_auto int; v_sid uuid;
begin
  for p in select id from public.vip_programmes where active loop
    perform public.vip_ensure_month(p.id);
  end loop;

  for m in select * from public.vip_months where status = 'open' and final_sync_at is null and now() >= ends_at - interval '25 minutes' loop
    perform public.vip_run_sync(true, m.programme_id);
    update public.vip_months set final_sync_at = now(), status = 'closing' where id = m.id;
    v_synced := v_synced + 1;
  end loop;

  for m in select * from public.vip_months where status = 'closing' and now() < ends_at + interval '20 minutes' loop
    perform public.vip_run_sync(true, m.programme_id);
  end loop;

  for m in select * from public.vip_months
            where status = 'closing' and now() >= ends_at + interval '30 minutes'
              and now() >= final_sync_at + interval '30 minutes' loop
    v_n := public.vip_compute_statements(m.id);
    v_missed := public.vip_record_requirements(m.id);
    v_auto := 0;
    if coalesce((select auto_approve from public.vip_programmes where id = m.programme_id), true) then
      for v_sid in select id from public.vip_statements where month_id = m.id and status = 'draft' and jsonb_array_length(coalesce(flags, '[]'::jsonb)) = 0 loop
        begin
          perform public.vip_approve_statement(v_sid);
          v_auto := v_auto + 1;
        exception when others then null;  -- it stays a draft for a person; one bad statement must not stop the month
        end;
      end loop;
    end if;
    if v_missed > 0 then
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', v_missed || ' VIP' || case when v_missed = 1 then '' else 's' end || ' missed the monthly requirement',
             to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY') || ': keep, warn, pause or remove them.',
             '/vip?mode=tools&tab=requirements'
        from public.vip_manager_ids(m.programme_id) mgr;
    end if;
    update public.vip_months set status = 'closed', closed_at = now() where id = m.id;
    perform public.vip_ensure_month(m.programme_id, m.ends_at + interval '1 hour');
    insert into public.notifications (recipient_id, type, title, body, link)
    select mgr, 'vip', case when v_auto > 0 then 'A VIP month closed' else 'A VIP month is ready to review' end,
           to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY') || ': ' || v_auto || ' added to balances automatically' ||
           case when v_n - v_auto > 0 then ', ' || (v_n - v_auto) || ' waiting for a look.' else '.' end,
           '/vip?mode=tools&tab=close'
      from public.vip_manager_ids(m.programme_id) mgr;
    v_closed := v_closed + 1;
  end loop;
  return jsonb_build_object('synced', v_synced, 'closed', v_closed);
end $function$;

CREATE OR REPLACE FUNCTION public.vip_compute_statements(p_month uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.vip_months; p public.vip_programmes; mem record; st record; rl record;
  v_count int := 0;
  v_views bigint; v_videos int; v_cpm numeric; v_base numeric; v_cap numeric; v_capped boolean;
  v_bonuses jsonb; v_cash numeric; v_adj jsonb; v_adj_sum numeric; v_roll_in numeric; v_total numeric; v_roll_out numeric;
  v_flags jsonb; v_rank int; v_places jsonb; v_pl jsonb; v_amt numeric; v_ok boolean;
  v_need_v int; v_need_w bigint; v_life bigint; v_lifev int; v_best numeric;
  v_prev uuid; v_months int; v_streak_ok boolean; v_bv uuid; v_bvviews bigint;
  v_existing record; v_has boolean;
begin
  select * into m from public.vip_months where id = p_month;
  if m is null then raise exception 'No such month.'; end if;
  if auth.uid() is not null and not public.vip_can_manage(m.programme_id) then
    raise exception 'Only the market lead or the team can do that.';
  end if;
  select * into p from public.vip_programmes where id = m.programme_id;

  create temporary table if not exists _vip_stats (profile_id uuid, videos int, views bigint, programme_id uuid) on commit drop;
  truncate _vip_stats;
  insert into _vip_stats select s.profile_id, s.videos, s.views, m.programme_id from public.vip_month_stats(p_month) s;
  insert into _vip_stats select vm.profile_id, 0, 0, m.programme_id from public.vip_members vm
   where vm.programme_id = m.programme_id and vm.status = 'active'
     and not exists (select 1 from _vip_stats x where x.profile_id = vm.profile_id);

  for mem in
    select vm.*, pr.name as person from public.vip_members vm
      join public.profiles pr on pr.id = vm.profile_id
     where vm.programme_id = m.programme_id
       and vm.profile_id in (select profile_id from _vip_stats)
  loop
    select * into v_existing from public.vip_statements where month_id = p_month and profile_id = mem.profile_id;
    v_has := found;
    if v_has and v_existing.status <> 'draft' then continue; end if;

    select x.videos, x.views into v_videos, v_views from _vip_stats x where x.profile_id = mem.profile_id;
    v_views := coalesce(v_views, 0); v_videos := coalesce(v_videos, 0);
    v_cpm := coalesce(mem.cpm, p.cpm);
    v_base := public.vip_views_pay(v_views, coalesce(mem.cpm, p.cpm), coalesce(mem.tiers, p.tiers), case when mem.tiers is null then mem.cpm end);
    v_cap := coalesce(mem.monthly_cap, p.monthly_cap);
    v_capped := false;
    if v_cap is not null and v_base > v_cap then v_base := v_cap; v_capped := true; end if;

    if v_has then delete from public.vip_bonus_awards where statement_id = v_existing.id; end if;

    v_bonuses := '[]'::jsonb;
    for rl in
      select * from public.vip_bonus_rules r
       where r.programme_id = m.programme_id and r.active and (r.month_id = p_month or (r.month_id is null and (r.for_year is null or exists (select 1 from public.vip_months fm where fm.id = p_month and fm.year = r.for_year and fm.month = r.for_month))))
         and coalesce(mem.bonuses_on, true)
       order by r.created_at
    loop
      v_ok := false; v_amt := rl.amount;

      if rl.kind = 'target' then
        v_need_v := case when coalesce((rl.conditions ->> 'own')::boolean, true) then mem.target_videos end;
        v_need_w := case when coalesce((rl.conditions ->> 'own')::boolean, true) then mem.target_views end;
        if v_need_v is null then v_need_v := nullif((rl.conditions ->> 'videos'), '')::int; end if;
        if v_need_w is null then v_need_w := nullif((rl.conditions ->> 'views'), '')::bigint; end if;
        if v_need_v is not null or v_need_w is not null then
          v_ok := (v_need_v is null or v_videos >= v_need_v) and (v_need_w is null or v_views >= v_need_w);
        end if;
        if v_ok and rl.multiplier is not null then v_amt := v_amt + round(v_base * (rl.multiplier - 1), 2); end if;
        if v_ok and v_amt > 0 then
          v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', v_amt);
        end if;

      elsif rl.kind = 'top_n' then
        v_places := rl.places;
        if rl.scope = 'global' then
          select rk into v_rank from (
            select profile_id, row_number() over (order by views desc, profile_id) rk
              from (
                select s.profile_id, s.views from public.vip_months mm
                  cross join lateral public.vip_month_stats(mm.id) s
                 where mm.year = m.year and mm.month = m.month and s.views > 0
              ) g
          ) z where z.profile_id = mem.profile_id;
        else
          select rk into v_rank from (
            select profile_id, row_number() over (order by views desc, profile_id) rk
              from _vip_stats where views > 0
          ) z where z.profile_id = mem.profile_id;
        end if;
        if v_rank is not null then
          for v_pl in select * from jsonb_array_elements(v_places) loop
            if (v_pl ->> 'place')::int = v_rank and coalesce((v_pl ->> 'amount')::numeric, 0) > 0 then
              v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id,
                'label', rl.label || ' (' || v_rank || case v_rank when 1 then 'st' when 2 then 'nd' when 3 then 'rd' else 'th' end || ')',
                'kind', rl.kind, 'reward', coalesce(v_pl ->> 'reward', rl.reward), 'amount', (v_pl ->> 'amount')::numeric);
            end if;
          end loop;
        end if;

      elsif rl.kind = 'best_video' then
        if rl.scope = 'global' then
          select v.profile_id, public.vip_video_counted(v, mm) into v_bv, v_bvviews
            from public.vip_months mm join public.vip_videos v on v.programme_id = mm.programme_id
           where mm.year = m.year and mm.month = m.month
           order by public.vip_video_counted(v, mm) desc limit 1;
        else
          select v.profile_id, public.vip_video_counted(v, m) into v_bv, v_bvviews
            from public.vip_videos v where v.programme_id = m.programme_id
           order by public.vip_video_counted(v, m) desc limit 1;
        end if;
        if v_bv = mem.profile_id and coalesce(v_bvviews, 0) > 0 and rl.amount > 0 then
          v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', rl.amount);
        end if;

      elsif rl.kind = 'streak' then
        v_months := greatest(2, coalesce((rl.conditions ->> 'months')::int, 3));
        v_need_v := greatest(1, coalesce((rl.conditions ->> 'min_videos')::int, 1));
        v_streak_ok := true;
        for st in
          select mm.id from public.vip_months mm
           where mm.programme_id = m.programme_id and mm.starts_at <= m.starts_at
           order by mm.starts_at desc limit v_months
        loop
          if coalesce((select s.videos from public.vip_month_stats(st.id) s where s.profile_id = mem.profile_id), 0) < v_need_v then
            v_streak_ok := false;
          end if;
          v_months := v_months - 1;
        end loop;
        if v_streak_ok and v_months = 0 then
          v_amt := round(v_base * coalesce((rl.conditions ->> 'pct')::numeric, 10) / 100.0, 2) + rl.amount;
          if v_amt > 0 then
            v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', v_amt);
          end if;
        end if;

      elsif rl.kind = 'milestone' then
        if not exists (select 1 from public.vip_bonus_awards a where a.rule_id = rl.id and a.profile_id = mem.profile_id) then
          select coalesce(sum(s.views), 0), coalesce(sum(s.videos), 0), coalesce(max(s.base), 0)
            into v_life, v_lifev, v_best
            from public.vip_statements s
           where s.profile_id = mem.profile_id and s.status <> 'void' and s.month_id <> p_month;
          v_ok := case coalesce(rl.conditions ->> 'metric', 'lifetime_views')
            when 'lifetime_views' then (v_life + v_views) >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'lifetime_videos' then (v_lifev + v_videos) >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'month_earnings' then v_base >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'month_views' then v_views >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'month_videos' then v_videos >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'best_video_views' then public.vip_metric(mem.profile_id, 'best_video_views') >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'lifetime_earnings' then (select coalesce(sum(s.base), 0) from public.vip_statements s where s.profile_id = mem.profile_id and s.status <> 'void' and s.month_id <> p_month) + v_base >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'months_active' then public.vip_metric(mem.profile_id, 'months_active') >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            when 'streak_months' then (public.vip_metric(mem.profile_id, 'streak_months') + case when v_videos >= 1 then 1 else 0 end) >= coalesce((rl.conditions ->> 'threshold')::numeric, 1e18)
            else false end;
          if v_ok and rl.amount > 0 then
            v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', rl.amount);
          end if;
        end if;
      end if;
    end loop;

    -- THE MONTHLY FEE (migration 311): a fixed cash line, paid to an active VIP who posted at least the videos
    -- it asks for (none, unless set).
    if coalesce(mem.monthly_fee, 0) > 0 and mem.status = 'active' and v_videos >= coalesce(mem.fee_min_videos, 0) then
      v_bonuses := v_bonuses || jsonb_build_object('rule_id', null, 'label', 'Monthly fee', 'kind', 'fee', 'reward', 'cash', 'amount', mem.monthly_fee);
    end if;
    select coalesce(sum((b ->> 'amount')::numeric) filter (where coalesce(b ->> 'reward', 'cash') = 'cash'), 0)
      into v_cash from jsonb_array_elements(v_bonuses) b;
    v_adj := case when v_has then coalesce(v_existing.adjustments, '[]'::jsonb) else '[]'::jsonb end;
    select coalesce(sum((a ->> 'amount')::numeric), 0) into v_adj_sum from jsonb_array_elements(v_adj) a;
    select coalesce(s.rollover_out, 0) into v_roll_in
      from public.vip_statements s
      join public.vip_months pm on pm.id = s.month_id
     where s.profile_id = mem.profile_id and s.status <> 'void' and pm.programme_id = m.programme_id and pm.starts_at < m.starts_at
     order by pm.starts_at desc limit 1;
    -- THE BALANCE CARRIES MONEY FORWARD NOW (migration 312), so a statement is what the month earned, in full.
    v_roll_in := 0;
    v_total := round(v_base + v_cash + v_adj_sum, 2);
    v_roll_out := 0;

    v_flags := '[]'::jsonb;
    if not public.vip_payment_ready(mem.profile_id, p.currency) then v_flags := v_flags || '"no_payment_details"'::jsonb; end if;
    if mem.status <> 'active' then v_flags := v_flags || '"not_active"'::jsonb; end if;
    if v_views = 0 then v_flags := v_flags || '"no_views"'::jsonb; end if;
    if mem.status = 'active' and not coalesce((public.vip_req_check(mem.profile_id, p_month) ->> 'met')::boolean, true) then
      v_flags := v_flags || '"missed_requirement"'::jsonb;
    end if;
    if exists (select 1 from public.vip_videos x where x.profile_id = mem.profile_id and x.status = 'disqualified'
                and x.disqualified_at >= m.starts_at) then
      v_flags := v_flags || '"video_disqualified"'::jsonb;
    end if;
    if exists (select 1 from public.vip_videos x where x.profile_id = mem.profile_id and x.status = 'tracking'
                and x.views_sync_error is not null) then
      v_flags := v_flags || '"unreadable_video"'::jsonb;
    end if;

    insert into public.vip_statements as s (programme_id, month_id, profile_id, views, videos, cpm, base, cap, cap_applied,
        bonuses, adjustments, rollover_in, rollover_out, total, currency, flags, status, updated_at)
    values (m.programme_id, p_month, mem.profile_id, v_views, v_videos, v_cpm, v_base, v_cap, v_capped,
        v_bonuses, v_adj, v_roll_in, v_roll_out, v_total, p.currency, v_flags, 'draft', now())
    on conflict (month_id, profile_id) do update set
        views = excluded.views, videos = excluded.videos, cpm = excluded.cpm, base = excluded.base, cap = excluded.cap,
        cap_applied = excluded.cap_applied, bonuses = excluded.bonuses, rollover_in = excluded.rollover_in,
        rollover_out = excluded.rollover_out, total = excluded.total, currency = excluded.currency,
        flags = excluded.flags, updated_at = now()
      where s.status = 'draft'
    returning id into v_prev;

    insert into public.vip_bonus_awards (rule_id, profile_id, statement_id)
    select (b ->> 'rule_id')::uuid, mem.profile_id, v_prev
      from jsonb_array_elements(v_bonuses) b
     where b ->> 'kind' = 'milestone'
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $function$;


drop function if exists public.vip_announce(uuid, text, text, boolean);
create or replace function public.vip_announce(p_programme uuid, p_title text, p_body text, p_pinned boolean default false,
                                               p_days integer default null, p_everywhere boolean default false)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid; v_recent int; v_ch record; v_group uuid := gen_random_uuid(); v_ends timestamptz; v_prog uuid; v_title text; v_first uuid;
begin
  if btrim(coalesce(p_body, '')) = '' then raise exception 'Write a message.'; end if;
  if p_everywhere then
    if not public.is_owner() then raise exception 'Only the owner can post to every VIP market at once.'; end if;
  elsif not public.vip_can_manage(p_programme) then
    raise exception 'Only the team members who manage this programme can post to its VIPs.';
  end if;
  v_title := nullif(left(btrim(coalesce(p_title, '')), 120), '');
  v_ends := case when coalesce(p_days, 0) > 0 then now() + make_interval(days => least(p_days, 365)) end;
  for v_prog in select id from public.vip_programmes where (p_everywhere and active) or id = p_programme loop
    select count(*) into v_recent from public.vip_announcements where programme_id = v_prog and created_at > now() - interval '1 hour';
    if v_recent >= 10 then raise exception 'That is a lot of announcements in an hour. Please wait a little.'; end if;
    insert into public.vip_announcements (programme_id, title, body, pinned, created_by, expires_at, everywhere)
    values (v_prog, v_title, left(btrim(p_body), 2000), coalesce(p_pinned, false), auth.uid(), v_ends, case when p_everywhere then v_group end)
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
    select c.id, c.community_id, co.slug, co.kind into v_ch
      from public.vip_programmes pr
      join public.channels c on c.community_id = pr.community_id and c.key = 'vip_announcements'
      join public.communities co on co.id = c.community_id
     where pr.id = v_prog;
    if v_ch.id is not null then
      insert into public.messages (channel, channel_id, community_id, sender_id, body)
      values (case when v_ch.kind = 'network' then 'vip_announcements' else v_ch.slug || ':vip_announcements' end,
              v_ch.id, v_ch.community_id, auth.uid(),
              case when v_title is null then '' else '**' || v_title || '**' || E'\n' end || left(btrim(p_body), 2000));
    else
      insert into public.notifications (recipient_id, type, title, body, link)
      select m.profile_id, 'vip', coalesce(v_title, 'A note from the team'), left(btrim(p_body), 140), '/vip'
        from public.vip_members m where m.programme_id = v_prog and m.status in ('active', 'paused');
    end if;
  end loop;
  return v_first;
end $function$;
revoke execute on function public.vip_announce(uuid, text, text, boolean, integer, boolean) from public, anon;
grant execute on function public.vip_announce(uuid, text, text, boolean, integer, boolean) to authenticated;

create or replace function public.vip_set_auto_approve(p_programme uuid, p_on boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the market lead or the team can change this.'; end if;
  update public.vip_programmes set auto_approve = coalesce(p_on, true) where id = p_programme;
end $function$;
revoke execute on function public.vip_set_auto_approve(uuid, boolean) from public, anon;
grant execute on function public.vip_set_auto_approve(uuid, boolean) to authenticated;
