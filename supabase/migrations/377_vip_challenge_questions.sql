-- 377: A VIP OR OFFICIAL CHALLENGE CAN ASK "IS THIS VIDEO ABOUT X?" (10 Oct 2026).
--
-- Ethan: "can we have the same function in the VIP as in the general? the one that asks the creator if this video is
-- about X topic ... I launched a new challenge and the one with the most views in videos hotel+flight (+experience
-- optional) gets a 200 EUR voucher, so they would have to mark this when submitting the video, Marta will have the
-- ability to decide this obviously."
--
-- The community side has had it since migration 155: `point_rules.prompt` turns a bonus into a tick box on the submit
-- form, and the answer is a row. The same here: `vip_bonus_rules.prompt` is the question; a creator's yes is a row in
-- `vip_video_claims`; a bonus with a question only counts the videos that said yes. A yes counts straight away (so the
-- board is live) until the team marks it "rejected"; "confirmed" is the team's tick that they have looked. The team can
-- also add a yes the creator forgot. The answer can be changed while the month is open, not after.

alter table public.vip_bonus_rules add column if not exists prompt text;
do $$ begin
  alter table public.vip_bonus_rules add constraint vip_bonus_rules_prompt_len check (prompt is null or char_length(prompt) between 3 and 200);
exception when duplicate_object then null; end $$;
comment on column public.vip_bonus_rules.prompt is 'A yes/no question asked when a video is added. When set, the bonus only counts videos answered yes (and not rejected by the team).';

create table if not exists public.vip_video_claims (
  video_id   uuid not null references public.vip_videos (id) on delete cascade,
  rule_id    uuid not null references public.vip_bonus_rules (id) on delete cascade,
  status     text not null default 'claimed' check (status in ('claimed', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  primary key (video_id, rule_id)
);
create index if not exists vip_video_claims_rule on public.vip_video_claims (rule_id);
alter table public.vip_video_claims enable row level security;
drop policy if exists "vip claims: read" on public.vip_video_claims;
create policy "vip claims: read" on public.vip_video_claims for select using (
  exists (select 1 from public.vip_videos v where v.id = video_id
           and (v.profile_id = (select auth.uid() as uid) or public.vip_can_see(v.programme_id))));
-- Writes go through the functions below only.
revoke insert, update, delete on public.vip_video_claims from anon, authenticated;

-- Does this video count for this rule? (No question: every video does.)
create or replace function public.vip_rule_video_ok(p_rule uuid, p_video uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when (select prompt from public.vip_bonus_rules where id = p_rule) is null then true
              else exists (select 1 from public.vip_video_claims c where c.rule_id = p_rule and c.video_id = p_video and c.status <> 'rejected') end
$$;

-- A rule's own month numbers: per creator, the videos and views that count for it. A rule for every VIP (or ranked
-- across every market) reads every programme of the same kind for that calendar month.
create or replace function public.vip_rule_stats(p_rule uuid, p_month uuid)
returns table (profile_id uuid, videos integer, views bigint)
language sql stable security definer set search_path = public as $$
  select v.profile_id,
         (count(*) filter (where v.status = 'tracking'
            and coalesce(v.posted_at, v.submitted_at) >= mm.starts_at
            and coalesce(v.posted_at, v.submitted_at) < mm.ends_at))::int,
         coalesce(sum(public.vip_video_counted(v, mm)), 0)::bigint
    from public.vip_bonus_rules r
    join public.vip_months m0 on m0.id = p_month
    join public.vip_programmes p0 on p0.id = m0.programme_id
    join public.vip_months mm on (mm.id = m0.id
         or ((r.scope = 'global' or r.audience = 'all') and mm.year = m0.year and mm.month = m0.month
             and mm.programme_id in (select id from public.vip_programmes where kind = p0.kind)))
    join public.vip_videos v on v.programme_id = mm.programme_id
   where r.id = p_rule
     and (r.prompt is null or exists (select 1 from public.vip_video_claims c where c.video_id = v.id and c.rule_id = r.id and c.status <> 'rejected'))
   group by v.profile_id
$$;

-- Is this rule open to this creator this month, with a question to answer?
create or replace function public.vip_rule_askable(p_rule uuid, p_profile uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r public.vip_bonus_rules; m public.vip_members; k text; mo public.vip_months;
begin
  select * into r from public.vip_bonus_rules where id = p_rule;
  if r.id is null or not r.active or r.prompt is null then return false; end if;
  select * into m from public.vip_members where profile_id = p_profile and status = 'active';
  if m.profile_id is null or not coalesce(m.bonuses_on, true) then return false; end if;
  select kind into k from public.vip_programmes where id = m.programme_id;
  if not (r.programme_id = m.programme_id or (r.audience = 'all' and k = 'vip')) then return false; end if;
  select * into mo from public.vip_months where programme_id = m.programme_id and status = 'open' order by starts_at desc limit 1;
  if r.month_id is not null and r.month_id <> mo.id then return false; end if;
  if r.for_year is not null and (r.for_year <> mo.year or r.for_month <> mo.month) then return false; end if;
  return true;
end $$;

-- THE CREATOR: answer yes or no for one of their videos, while its month is open.
create or replace function public.vip_set_claim(p_video uuid, p_rule uuid, p_on boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v public.vip_videos; c public.vip_video_claims; mo public.vip_months;
begin
  select * into v from public.vip_videos where id = p_video;
  if v.id is null or v.profile_id <> auth.uid() then raise exception 'That is not one of your videos.'; end if;
  if not public.vip_rule_askable(p_rule, auth.uid()) then raise exception 'That challenge is not open right now.'; end if;
  select * into mo from public.vip_months where programme_id = v.programme_id and status = 'open' order by starts_at desc limit 1;
  if mo.id is null or coalesce(v.posted_at, v.submitted_at) < mo.starts_at then
    raise exception 'Only this month''s videos can be entered.';
  end if;
  select * into c from public.vip_video_claims where video_id = p_video and rule_id = p_rule;
  if c.status = 'rejected' then raise exception 'The team has already looked at this one.'; end if;
  if p_on then
    insert into public.vip_video_claims (video_id, rule_id, created_by) values (p_video, p_rule, auth.uid())
    on conflict (video_id, rule_id) do nothing;
    return coalesce(c.status, 'claimed');
  end if;
  if c.status = 'confirmed' then raise exception 'The team has already confirmed this one. Ask them to change it.'; end if;
  delete from public.vip_video_claims where video_id = p_video and rule_id = p_rule;
  return null;
end $$;

-- THE TEAM: confirm, reject, add or remove a yes on any video of a programme they run.
create or replace function public.vip_review_claim(p_video uuid, p_rule uuid, p_status text)
returns text language plpgsql security definer set search_path = public as $$
declare v public.vip_videos;
begin
  select * into v from public.vip_videos where id = p_video;
  if v.id is null then raise exception 'No such video.'; end if;
  if not public.vip_can_manage(v.programme_id) then raise exception 'Only the team running this programme can decide that.'; end if;
  if not exists (select 1 from public.vip_bonus_rules where id = p_rule and prompt is not null) then raise exception 'That bonus asks no question.'; end if;
  if p_status is null then
    delete from public.vip_video_claims where video_id = p_video and rule_id = p_rule;
    return null;
  end if;
  if p_status not in ('claimed', 'confirmed', 'rejected') then raise exception 'Unknown answer.'; end if;
  insert into public.vip_video_claims (video_id, rule_id, status, created_by, decided_by, decided_at)
  values (p_video, p_rule, p_status, auth.uid(), auth.uid(), now())
  on conflict (video_id, rule_id) do update set status = excluded.status, decided_by = auth.uid(), decided_at = now();
  if p_status = 'rejected' then
    insert into public.notifications (recipient_id, type, title, body, link)
    select v.profile_id, 'vip', 'A video does not count for ' || r.label,
           'The team looked at it and it does not fit what the challenge asks. Your views pay on it is not affected.', '/vip?tab=videos'
      from public.vip_bonus_rules r where r.id = p_rule;
  end if;
  return p_status;
end $$;

-- WHO IS AHEAD ON ONE BONUS, THIS MONTH. For the creator's "Earn more" card and the team's review. Creators see first
-- names, like every VIP board. A best-video bonus ranks videos; everything else ranks creators.
create or replace function public.vip_rule_standings(p_rule uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.vip_bonus_rules; staff boolean; v_prog uuid; mo public.vip_months; v_me uuid := public.vip_who(); out jsonb; mine jsonb;
begin
  select * into r from public.vip_bonus_rules where id = p_rule;
  if r.id is null then return null; end if;
  staff := public.vip_can_see(r.programme_id);
  if not staff then
    select programme_id into v_prog from public.vip_members where profile_id = v_me and status = 'active';
    if v_prog is null or not coalesce(r.programme_id = v_prog or (r.audience = 'all' and public.vip_kind_of(v_me) = 'vip'), false) then return null; end if;
  else
    v_prog := r.programme_id;
  end if;
  select * into mo from public.vip_months where programme_id = v_prog and status <> 'closed' order by starts_at desc limit 1;
  if mo.id is null then return jsonb_build_object('mode', 'creators', 'rows', '[]'::jsonb); end if;
  if r.kind = 'best_video' then
    select coalesce(jsonb_agg(z.j order by z.rk), '[]'::jsonb) into out from (
      select row_number() over (order by public.vip_video_counted(v, mm) desc, v.id) rk,
             jsonb_build_object('rank', row_number() over (order by public.vip_video_counted(v, mm) desc, v.id),
               'name', case when staff then pf.name else split_part(pf.name, ' ', 1) end, 'photo', pf.photo_url,
               'views', public.vip_video_counted(v, mm), 'me', v.profile_id = v_me, 'video_id', v.id,
               'url', case when staff or v.profile_id = v_me then v.video_url end, 'thumb', v.thumbnail_url, 'platform', v.platform,
               'status', (select c.status from public.vip_video_claims c where c.video_id = v.id and c.rule_id = r.id)) j
        from public.vip_months mm
        join public.vip_videos v on v.programme_id = mm.programme_id
        join public.profiles pf on pf.id = v.profile_id
       where (mm.id = mo.id or ((r.scope = 'global' or r.audience = 'all') and mm.year = mo.year and mm.month = mo.month
              and mm.programme_id in (select id from public.vip_programmes where kind = (select kind from public.vip_programmes where id = mo.programme_id))))
         and v.status = 'tracking' and not public.vip_hidden_profile(v.profile_id)
         and public.vip_rule_video_ok(r.id, v.id) and public.vip_video_counted(v, mm) > 0
       limit 25) z;
    return jsonb_build_object('mode', 'videos', 'rows', out, 'month', jsonb_build_object('year', mo.year, 'month', mo.month));
  end if;
  select coalesce(jsonb_agg(z.j order by z.rk), '[]'::jsonb) into out from (
    select row_number() over (order by s.views desc, s.profile_id) rk,
           jsonb_build_object('rank', row_number() over (order by s.views desc, s.profile_id),
             'name', case when staff then pf.name else split_part(pf.name, ' ', 1) end, 'photo', pf.photo_url,
             'views', s.views, 'videos', s.videos, 'me', s.profile_id = v_me) j
      from public.vip_rule_stats(r.id, mo.id) s
      join public.profiles pf on pf.id = s.profile_id
     where s.views > 0 and not public.vip_hidden_profile(s.profile_id)
     limit 25) z;
  select jsonb_build_object('views', s.views, 'videos', s.videos) into mine from public.vip_rule_stats(r.id, mo.id) s where s.profile_id = v_me;
  return jsonb_build_object('mode', 'creators', 'rows', out, 'mine', mine, 'month', jsonb_build_object('year', mo.year, 'month', mo.month));
end $$;

-- THE TEAM'S REVIEW LIST: every answer to every question this month, newest first, with the video.
create or replace function public.vip_claims_review(p_programme uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.vip_can_see(p_programme) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'video_id', v.id, 'rule_id', r.id, 'rule', r.label, 'prompt', r.prompt, 'status', c.status, 'at', c.created_at,
        'decided_at', c.decided_at, 'name', pf.name, 'photo', pf.photo_url, 'profile_id', pf.id,
        'url', v.video_url, 'thumb', v.thumbnail_url, 'platform', v.platform, 'caption', v.caption,
        'views', public.vip_video_counted(v, mo), 'posted_at', coalesce(v.posted_at, v.submitted_at))
        order by (c.status = 'claimed') desc, c.created_at desc)
      from public.vip_video_claims c
      join public.vip_bonus_rules r on r.id = c.rule_id
      join public.vip_videos v on v.id = c.video_id
      join public.profiles pf on pf.id = v.profile_id
      join public.vip_months mo on mo.programme_id = v.programme_id and mo.status <> 'closed'
     where v.programme_id = p_programme
       and coalesce(v.posted_at, v.submitted_at) >= mo.starts_at and not public.vip_hidden_profile(v.profile_id)), '[]'::jsonb);
end $$;

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
  v_existing record; v_has boolean; v_default uuid; v_rv int; v_rw bigint;
begin
  select * into m from public.vip_months where id = p_month;
  if m is null then raise exception 'No such month.'; end if;
  if auth.uid() is not null and not public.vip_can_manage(m.programme_id) then
    raise exception 'Only the market lead or the team can do that.';
  end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  -- 376: bonuses set for every VIP live on the default VIP programme and reach VIP programmes only; an official
  -- programme runs its own bonuses and is never ranked against the VIPs.
  select id into v_default from public.vip_programmes where is_default and kind = p.kind limit 1;

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
       and not coalesce(vm.invoice_outside, false)
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
       where r.active and coalesce(mem.bonuses_on, true)
         and (r.programme_id = m.programme_id or (r.audience = 'all' and r.programme_id = v_default))
         and (r.month_id = p_month
              or (r.month_id is null and (r.for_year is null or (m.year = r.for_year and m.month = r.for_month)))
              or (r.audience = 'all' and r.month_id is not null and exists (select 1 from public.vip_months rm where rm.id = r.month_id and rm.year = m.year and rm.month = m.month)))
       order by r.created_at
    loop
      v_ok := false; v_amt := rl.amount;
      -- 377: a bonus with a question counts only the videos that answered yes.
      if rl.prompt is not null then
        select x.videos, x.views into v_rv, v_rw from public.vip_rule_stats(rl.id, p_month) x where x.profile_id = mem.profile_id;
        v_rv := coalesce(v_rv, 0); v_rw := coalesce(v_rw, 0);
      else
        v_rv := v_videos; v_rw := v_views;
      end if;

      if rl.kind = 'target' then
        v_need_v := case when coalesce((rl.conditions ->> 'own')::boolean, true) then mem.target_videos end;
        v_need_w := case when coalesce((rl.conditions ->> 'own')::boolean, true) then mem.target_views end;
        if v_need_v is null then v_need_v := nullif((rl.conditions ->> 'videos'), '')::int; end if;
        if v_need_w is null then v_need_w := nullif((rl.conditions ->> 'views'), '')::bigint; end if;
        if v_need_v is not null or v_need_w is not null then
          v_ok := (v_need_v is null or v_rv >= v_need_v) and (v_need_w is null or v_rw >= v_need_w);
        end if;
        if v_ok and rl.multiplier is not null then v_amt := v_amt + round(v_base * (rl.multiplier - 1), 2); end if;
        if v_ok and v_amt > 0 then
          v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', v_amt);
        end if;

      elsif rl.kind = 'top_n' then
        v_places := rl.places;
        if rl.prompt is not null then
          select rk into v_rank from (
            select x.profile_id, row_number() over (order by x.views desc, x.profile_id) rk
              from public.vip_rule_stats(rl.id, p_month) x where x.views > 0
          ) z where z.profile_id = mem.profile_id;
        elsif rl.scope = 'global' or rl.audience = 'all' then
          select rk into v_rank from (
            select profile_id, row_number() over (order by views desc, profile_id) rk
              from (
                select s.profile_id, s.views from public.vip_months mm
                  cross join lateral public.vip_month_stats(mm.id) s
                 where mm.year = m.year and mm.month = m.month and s.views > 0
                   and mm.programme_id in (select id from public.vip_programmes where kind = p.kind)
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
        if rl.scope = 'global' or rl.audience = 'all' then
          select v.profile_id, public.vip_video_counted(v, mm) into v_bv, v_bvviews
            from public.vip_months mm join public.vip_videos v on v.programme_id = mm.programme_id
           where mm.year = m.year and mm.month = m.month
             and mm.programme_id in (select id from public.vip_programmes where kind = p.kind)
             and (rl.prompt is null or public.vip_rule_video_ok(rl.id, v.id))
           order by public.vip_video_counted(v, mm) desc limit 1;
        else
          select v.profile_id, public.vip_video_counted(v, m) into v_bv, v_bvviews
            from public.vip_videos v where v.programme_id = m.programme_id
             and (rl.prompt is null or public.vip_rule_video_ok(rl.id, v.id))
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

drop function if exists public.vip_submit_video(text, text, text);

CREATE OR REPLACE FUNCTION public.vip_submit_video(p_url text, p_platform text, p_caption text DEFAULT NULL::text, p_claims uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.vip_members; p public.vip_programmes; mo public.vip_months; v_id uuid; v_posted timestamptz; v_rule uuid;
        v_url text := btrim(coalesce(p_url, ''));
begin
  select * into m from public.vip_members where profile_id = auth.uid() and status = 'active';
  if m is null then raise exception 'Only VIP creators can add a video here.'; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  if not public.vip_terms_ok(m.profile_id) then
    raise exception 'Please sign the VIP agreement first.';
  end if;
  if v_url !~* '^https?://' then raise exception 'Paste the full link to your video.'; end if;
  if p_platform not in ('Instagram', 'TikTok', 'YouTube', 'Facebook', 'Other') then raise exception 'Unknown platform.'; end if;
  mo := public.vip_ensure_month(m.programme_id);
  v_posted := public.video_posted_at(p_platform, v_url, null);
  if v_posted is not null and v_posted < mo.starts_at then
    raise exception 'That video was posted before this month started, so it cannot count for this month.';
  end if;
  insert into public.vip_videos (profile_id, programme_id, platform, video_url, caption)
  values (auth.uid(), m.programme_id, p_platform, v_url, nullif(btrim(coalesce(p_caption, '')), ''))
  returning id into v_id;
  -- 377: the yes answers given on the form, for the bonuses that ask a question.
  foreach v_rule in array coalesce(p_claims, '{}'::uuid[]) loop
    if public.vip_rule_askable(v_rule, auth.uid()) then
      insert into public.vip_video_claims (video_id, rule_id, created_by) values (v_id, v_rule, auth.uid()) on conflict do nothing;
    end if;
  end loop;
  -- Read at once by trg_vip_read_new_video (migration 311).
  return v_id;
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
      'synced_at', v.views_synced_at, 'error', v.views_sync_error, 'approx', v.views_approx,
      'claims', (select coalesce(jsonb_agg(jsonb_build_object('rule', c.rule_id, 'status', c.status)), '[]'::jsonb)
                   from public.vip_video_claims c where c.video_id = v.id))
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
        'terms', p.terms, 'terms_version', p.terms_version, 'community_id', p.community_id, 'kind', p.kind),
    'member', jsonb_build_object('status', m.status, 'cpm', m.cpm, 'monthly_cap', m.monthly_cap,
        'target_videos', m.target_videos, 'target_views', m.target_views, 'own_goal_views', m.own_goal_views, 'tiers', m.tiers, 'monthly_fee', m.monthly_fee,
        'fee_min_videos', m.fee_min_videos, 'bonuses_on', m.bonuses_on, 'joined_on', m.joined_on, 'invoice_outside', m.invoice_outside,
        'terms_ok', public.vip_terms_ok(m.profile_id)),
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


insert into public.owner_only_rpcs (proname, why) values
  ('vip_rule_stats',    'any VIP''s per-rule month numbers (internal)'),
  ('vip_rule_video_ok', 'internal helper'),
  ('vip_rule_askable',  'internal helper')
on conflict (proname) do nothing;
select count(*) from public.lock_down_definer_functions();
revoke all on function public.vip_set_claim(uuid, uuid, boolean) from anon;
revoke all on function public.vip_review_claim(uuid, uuid, text) from anon;
revoke all on function public.vip_rule_standings(uuid) from anon;
revoke all on function public.vip_claims_review(uuid) from anon;
revoke all on function public.vip_submit_video(text, text, text, uuid[]) from anon;
grant execute on function public.vip_submit_video(text, text, text, uuid[]) to authenticated;

-- THE CHALLENGE ETHAN LAUNCHED: VIP Spain's "Video con mas visitas" (best video, EUR 200 voucher) is the one for
-- hotel + flight videos, so it asks the question now. Its label says what it is for.
update public.vip_bonus_rules
   set prompt = '¿Este vídeo es de hotel + vuelo (con experiencia opcional)?',
       label = 'Vídeo con más visitas: hotel + vuelo'
 where id = 'cf0cd158-7ba6-4c47-81cb-5eec25b38112' and prompt is null;
