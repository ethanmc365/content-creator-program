-- 294: THE VIP PROGRAMME (2 Oct 2026).
--
-- Creators too big for the normal challenges are paid by the views they bring, not by winning. Today the
-- Spanish VIPs and one or two Romanians run from a WhatsApp group; this moves them onto the platform.
--
-- THE SHAPE, AND WHY IT IS SEPARATE FROM CHALLENGES
--   * A VIP is a row in `vip_members` (and `profiles.is_vip`, a read-only flag for the badge). They keep
--     everything shared: profile, rooms, DMs, calendar, games, portfolio, connections.
--   * VIP videos live in `vip_videos`, NOT in `submissions`. `submissions.challenge_id` is NOT NULL and a
--     dozen triggers (points, prizes, recaps, admin alerts) hang off it; threading a second meaning
--     through all of that is how a live challenge breaks. The view reader (edge fn view-sync) gets a VIP
--     lane instead, and every reading is kept in `vip_view_readings` so "views gained in a month" is exact.
--   * A month is a `vip_months` row in the MARKET's time zone. Views that count in a month are the views a
--     tracked video GAINED inside it (video posted within `window_days`), so nothing is paid twice.
--   * The close: shortly before a month ends a final read is forced; shortly after, `vip_compute_statements`
--     drafts one `vip_statements` row per VIP (views x CPM, tiers, cap, bonuses, rollover of small amounts).
--     A manager reviews and approves; approval creates a cash `rewards` row (source 'vip'), which the
--     existing pipeline turns into an invoice, and the approval counts as the invoice's approval.
--   * Bonus rules are rows, not hand payments: per creator (hit your target), ranked within a market or
--     across every VIP, best single video, consistency streak, one-off milestones; paid in cash (on the
--     invoice) or as a voucher reward.
--
-- Every new definer function is revoked from public and anon and granted only where a screen calls it.

-- ---------------------------------------------------------------------------------------- tables
create table public.vip_programmes (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null unique references public.communities(id) on delete restrict,
  name text not null,
  currency text not null default 'EUR',
  cpm numeric(8,4) not null default 0.25 check (cpm >= 0),
  tiers jsonb not null default '[]'::jsonb,           -- [{"from_views": 1000000, "cpm": 0.30}]
  min_payout numeric(10,2) not null default 10 check (min_payout >= 0),
  monthly_cap numeric(10,2) check (monthly_cap is null or monthly_cap >= 0),
  budget_monthly numeric(10,2) check (budget_monthly is null or budget_monthly >= 0),
  window_days int not null default 60 check (window_days between 1 and 365),
  terms_version int not null default 1,
  terms text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vip_members (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  programme_id uuid not null references public.vip_programmes(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'paused', 'left')),
  cpm numeric(8,4) check (cpm is null or cpm >= 0),
  monthly_cap numeric(10,2) check (monthly_cap is null or monthly_cap >= 0),
  target_videos int check (target_videos is null or target_videos >= 0),
  target_views bigint check (target_views is null or target_views >= 0),
  joined_on date not null default current_date,
  left_on date,
  source text not null default 'admin' check (source in ('admin', 'invite', 'transfer')),
  terms_accepted_at timestamptz,
  terms_version int,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index vip_members_programme_idx on public.vip_members (programme_id);

create table public.vip_months (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closing', 'closed')),
  final_sync_at timestamptz,
  closed_at timestamptz,
  unique (programme_id, year, month)
);

create table public.vip_videos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  programme_id uuid not null references public.vip_programmes(id) on delete restrict,
  platform text not null check (platform in ('Instagram', 'TikTok', 'YouTube', 'Facebook', 'Other')),
  video_url text not null,
  caption text,
  platform_video_id text,
  logged_views bigint not null default 0,
  views_source text check (views_source in ('manual', 'tiktok', 'instagram', 'youtube', 'facebook')),
  views_synced_at timestamptz,
  views_sync_error text,
  views_approx boolean,
  thumbnail_url text,
  posted_at timestamptz,
  submitted_at timestamptz not null default now(),
  status text not null default 'tracking' check (status in ('tracking', 'disqualified')),
  disqualified_reason text,
  disqualified_at timestamptz,
  disqualified_by uuid references public.profiles(id) on delete set null
);
create index vip_videos_profile_idx on public.vip_videos (profile_id);
create index vip_videos_programme_idx on public.vip_videos (programme_id, status);

create table public.vip_view_readings (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.vip_videos(id) on delete cascade,
  views bigint not null,
  source text,
  read_at timestamptz not null default now()
);
create index vip_view_readings_video_idx on public.vip_view_readings (video_id, read_at desc);

create table public.vip_bonus_rules (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  month_id uuid references public.vip_months(id) on delete cascade,     -- null = every month
  label text not null,
  kind text not null check (kind in ('target', 'top_n', 'best_video', 'streak', 'milestone')),
  scope text not null default 'market' check (scope in ('creator', 'market', 'global')),
  reward text not null default 'cash' check (reward in ('cash', 'voucher')),
  amount numeric(10,2) not null default 0 check (amount >= 0),
  multiplier numeric(6,3) check (multiplier is null or multiplier >= 1),
  places jsonb not null default '[]'::jsonb,        -- top_n: [{"place":1,"amount":100,"reward":"cash"}]
  conditions jsonb not null default '{}'::jsonb,    -- target / streak / milestone settings
  active boolean not null default true,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index vip_bonus_rules_programme_idx on public.vip_bonus_rules (programme_id);

create table public.vip_statements (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  month_id uuid not null references public.vip_months(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  views bigint not null default 0,
  videos int not null default 0,
  cpm numeric(8,4),
  base numeric(12,2) not null default 0,
  cap numeric(10,2),
  cap_applied boolean not null default false,
  bonuses jsonb not null default '[]'::jsonb,
  adjustments jsonb not null default '[]'::jsonb,
  rollover_in numeric(12,2) not null default 0,
  rollover_out numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  flags jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'void')),
  reward_id uuid references public.rewards(id) on delete set null,
  voucher_reward_ids uuid[] not null default '{}',
  invoice_id uuid references public.invoices(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month_id, profile_id)
);
create index vip_statements_profile_idx on public.vip_statements (profile_id);

-- a one-off milestone is paid once per creator, however often the month is recomputed
create table public.vip_bonus_awards (
  rule_id uuid not null references public.vip_bonus_rules(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  statement_id uuid references public.vip_statements(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (rule_id, profile_id)
);

create table public.vip_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  label text,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.vip_kpi_targets (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  metric text not null check (metric in ('views', 'videos', 'active_creators', 'spend', 'hit_target')),
  target_value numeric not null check (target_value >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (programme_id, year, month, metric)
);

alter table public.profiles add column if not exists is_vip boolean not null default false;

-- widen the lists other tables already keep by name
alter table public.rewards drop constraint rewards_source_check;
alter table public.rewards add constraint rewards_source_check
  check (source = any (array['challenge', 'referral', 'manual', 'milestone', 'vip']));
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['challenge','announcement','results','reward','deadline','connection','dm','event','application','chat','submission','deletion','referral','new_member','inactive','feedback','collab','mention','daily_streak','daily_reminder','board_answer','report','event_reminder','event_rating','reaction','community','vip']));
alter table public.channels drop constraint channels_visibility_check;
alter table public.channels add constraint channels_visibility_check
  check (visibility = any (array['scope', 'staff', 'vip']));

-- ------------------------------------------------------------------------------ small helpers
create or replace function public.is_active_vip()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.vip_members where profile_id = auth.uid() and status = 'active')
$$;

create or replace function public.vip_can_manage(p_programme uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
      from public.vip_programmes p
      join public.community_members cm on cm.community_id = p.community_id
     where p.id = p_programme and cm.profile_id = auth.uid() and cm.status = 'active' and cm.role = 'manager')
$$;

create or replace function public.vip_my_programme()
returns uuid language sql stable security definer set search_path = public as $$
  select programme_id from public.vip_members where profile_id = auth.uid()
$$;

-- Is this creator set up to be paid? (bank details that make a payable invoice)
create or replace function public.vip_payment_ready(p_profile uuid, p_currency text default 'EUR')
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.invoice_is_payable(public.payment_snapshot(p_profile, p_currency)), false)
$$;

-- The flag the badge reads. Only the functions in this file may change it.
create or replace function public.vip_protect_flag()
returns trigger language plpgsql as $$
begin
  if new.is_vip is distinct from old.is_vip
     and auth.uid() is not null
     and coalesce(current_setting('tryp.vip_write', true), '') <> 'on' then
    new.is_vip := old.is_vip;
  end if;
  return new;
end $$;
create trigger trg_vip_protect_flag before update on public.profiles
  for each row execute function public.vip_protect_flag();

create or replace function public.vip_member_flag()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.profile_id, old.profile_id);
begin
  perform set_config('tryp.vip_write', 'on', true);
  update public.profiles
     set is_vip = exists (select 1 from public.vip_members where profile_id = v_id and status = 'active')
   where id = v_id;
  perform set_config('tryp.vip_write', 'off', true);
  return null;
end $$;
create trigger trg_vip_member_flag after insert or update or delete on public.vip_members
  for each row execute function public.vip_member_flag();

-- a video's identity, its date, and "one video, once" across the whole programme
create or replace function public.vip_video_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare v timestamptz; v_key text;
begin
  v := public.video_posted_at(new.platform, new.video_url, new.platform_video_id);
  if v is not null then new.posted_at := v; end if;
  if tg_op = 'INSERT' then
    v_key := public.video_identity(new.platform, new.video_url);
    if v_key is not null and v_key <> '' and exists (
      select 1 from public.vip_videos x
       where x.programme_id = new.programme_id and x.id is distinct from new.id
         and (public.video_identity(x.platform, x.video_url) = v_key
              or x.platform_video_id = v_key
              or (new.platform_video_id is not null and x.platform_video_id = new.platform_video_id))
    ) then
      raise exception 'This video is already in the VIP programme.' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
create trigger trg_vip_video_fill before insert or update of platform_video_id, video_url, platform on public.vip_videos
  for each row execute function public.vip_video_fill();

-- Audit trail for everything money-shaped.
create trigger trg_audit_vip_programmes after insert or delete on public.vip_programmes
  for each row execute function public.audit_change('money', 'VIP programme', 'name');
create trigger trg_audit_vip_programmes_upd after update on public.vip_programmes
  for each row execute function public.audit_change('money', 'VIP programme', 'name', 'cpm', 'tiers', 'min_payout', 'monthly_cap', 'budget_monthly', 'window_days', 'active');
create trigger trg_audit_vip_members after insert or delete on public.vip_members
  for each row execute function public.audit_change('money', 'VIP member', '');
create trigger trg_audit_vip_members_upd after update on public.vip_members
  for each row execute function public.audit_change('money', 'VIP member', '', 'status', 'cpm', 'monthly_cap', 'target_videos', 'target_views');
create trigger trg_audit_vip_bonus_rules after insert or delete on public.vip_bonus_rules
  for each row execute function public.audit_change('money', 'VIP bonus rule', 'label');
create trigger trg_audit_vip_bonus_rules_upd after update on public.vip_bonus_rules
  for each row execute function public.audit_change('money', 'VIP bonus rule', 'label', 'amount', 'places', 'conditions', 'active', 'reward', 'multiplier');
create trigger trg_audit_vip_statements_upd after update on public.vip_statements
  for each row execute function public.audit_change('money', 'VIP statement', '', 'status', 'total', 'adjustments');

-- ------------------------------------------------------------------------------ the maths
-- A month in the market's own time.
create or replace function public.vip_month_bounds(p_year int, p_month int, p_tz text)
returns table (starts_at timestamptz, ends_at timestamptz) language sql immutable as $$
  select (make_timestamp(p_year, p_month, 1, 0, 0, 0)) at time zone p_tz,
         (make_timestamp(p_year, p_month, 1, 0, 0, 0) + interval '1 month') at time zone p_tz
$$;

create or replace function public.vip_ensure_month(p_programme uuid, p_at timestamptz default now())
returns public.vip_months language plpgsql security definer set search_path = public as $$
declare
  v_tz text; v_y int; v_m int; r public.vip_months; b record;
begin
  select coalesce(c.timezone, 'Europe/London') into v_tz
    from public.vip_programmes p join public.communities c on c.id = p.community_id where p.id = p_programme;
  if v_tz is null then raise exception 'No such VIP programme.'; end if;
  v_y := extract(year from (p_at at time zone v_tz))::int;
  v_m := extract(month from (p_at at time zone v_tz))::int;
  select * into r from public.vip_months where programme_id = p_programme and year = v_y and month = v_m;
  if found then return r; end if;
  select * into b from public.vip_month_bounds(v_y, v_m, v_tz);
  insert into public.vip_months (programme_id, year, month, starts_at, ends_at)
  values (p_programme, v_y, v_m, b.starts_at, b.ends_at)
  on conflict (programme_id, year, month) do nothing;
  select * into r from public.vip_months where programme_id = p_programme and year = v_y and month = v_m;
  return r;
end $$;

-- What one video earned for one month: the views it GAINED inside the month.
--  start  = its last reading at or before the month began; if it had none, a video posted inside the month
--           starts from zero, and an older one starts from its first reading after it was submitted (what
--           it had before we tracked it is not ours to pay);
--  end    = the month's last reading (a small tolerance past the end, for a final read taken just after
--           midnight), or what it has now while the month is still open.
create or replace function public.vip_video_counted(v public.vip_videos, m public.vip_months)
returns bigint language plpgsql stable security definer set search_path = public as $$
declare b bigint; e bigint; w int;
begin
  if v.status <> 'tracking' then return 0; end if;
  if v.submitted_at >= m.ends_at then return 0; end if;
  select window_days into w from public.vip_programmes where id = m.programme_id;
  if v.posted_at is not null and (v.posted_at >= m.ends_at or v.posted_at < m.ends_at - (w * interval '1 day')) then
    return 0;
  end if;

  select views into b from public.vip_view_readings
   where video_id = v.id and read_at <= m.starts_at order by read_at desc limit 1;
  if b is null then
    if v.posted_at is not null and v.posted_at >= m.starts_at then
      b := 0;
    else
      select views into b from public.vip_view_readings
       where video_id = v.id and read_at >= v.submitted_at order by read_at asc limit 1;
    end if;
  end if;
  if b is null then return 0; end if;

  if m.status = 'open' and now() < m.ends_at then
    e := v.logged_views;
  else
    select views into e from public.vip_view_readings
     where video_id = v.id and read_at <= m.ends_at + interval '90 minutes' order by read_at desc limit 1;
  end if;
  if e is null then return 0; end if;
  return greatest(0, e - b);
end $$;

-- Per creator for one month: videos posted in it, and views counted.
create or replace function public.vip_month_stats(p_month uuid)
returns table (profile_id uuid, videos int, views bigint) language sql stable security definer set search_path = public as $$
  select v.profile_id,
         (count(*) filter (where v.status = 'tracking'
            and coalesce(v.posted_at, v.submitted_at) >= m.starts_at
            and coalesce(v.posted_at, v.submitted_at) < m.ends_at))::int,
         coalesce(sum(public.vip_video_counted(v, m)), 0)::bigint
    from public.vip_months m
    join public.vip_videos v on v.programme_id = m.programme_id
   where m.id = p_month
   group by v.profile_id
$$;

-- views x CPM, in tiers when the programme has them (a creator's own CPM beats tiers).
create or replace function public.vip_views_pay(p_views bigint, p_cpm numeric, p_tiers jsonb, p_override numeric)
returns numeric language plpgsql immutable as $$
declare
  v_pay numeric := 0; t record; v_from numeric; v_to numeric; v_rate numeric;
begin
  if coalesce(p_views, 0) <= 0 then return 0; end if;
  if p_override is not null or p_tiers is null or jsonb_array_length(p_tiers) = 0 then
    return round(p_views / 1000.0 * coalesce(p_override, p_cpm), 2);
  end if;
  for t in
    select x.from_views, x.cpm,
           lead(x.from_views) over (order by x.from_views) as next_from
      from (
        select 0::numeric as from_views, p_cpm as cpm
        union all
        select (e ->> 'from_views')::numeric, (e ->> 'cpm')::numeric
          from jsonb_array_elements(p_tiers) e
         where (e ->> 'from_views')::numeric > 0
      ) x
     order by x.from_views
  loop
    v_from := t.from_views;
    v_to := coalesce(t.next_from, p_views);
    v_rate := t.cpm;
    if p_views > v_from then
      v_pay := v_pay + (least(p_views, v_to) - v_from) / 1000.0 * v_rate;
    end if;
  end loop;
  return round(v_pay, 2);
end $$;

-- ------------------------------------------------------------------------------ the statement
create or replace function public.vip_compute_statements(p_month uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  m public.vip_months; p public.vip_programmes; mem record; st record; rl record;
  v_count int := 0;
  v_views bigint; v_videos int; v_cpm numeric; v_base numeric; v_cap numeric; v_capped boolean;
  v_bonuses jsonb; v_cash numeric; v_adj jsonb; v_adj_sum numeric; v_roll_in numeric; v_total numeric; v_roll_out numeric;
  v_flags jsonb; v_rank int; v_places jsonb; v_pl jsonb; v_amt numeric; v_ok boolean;
  v_tv int; v_tw bigint; v_need_v int; v_need_w bigint; v_life bigint; v_lifev int; v_best numeric;
  v_prev uuid; v_months int; v_streak_ok boolean; v_bv uuid; v_bvviews bigint;
  v_existing record; v_has boolean;
begin
  select * into m from public.vip_months where id = p_month;
  if m is null then raise exception 'No such month.'; end if;
  -- the clock (no session) and the people who run this market may draft a month; nobody else
  if auth.uid() is not null and not public.vip_can_manage(m.programme_id) then
    raise exception 'Only the market lead or the team can do that.';
  end if;
  select * into p from public.vip_programmes where id = m.programme_id;

  -- drafts only: an approved statement is history
  create temporary table if not exists _vip_stats (profile_id uuid, videos int, views bigint, programme_id uuid) on commit drop;
  delete from _vip_stats;
  insert into _vip_stats select s.profile_id, s.videos, s.views, m.programme_id from public.vip_month_stats(p_month) s;
  -- every member is on the sheet, even with nothing to show
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
    v_base := public.vip_views_pay(v_views, p.cpm, p.tiers, mem.cpm);
    v_cap := coalesce(mem.monthly_cap, p.monthly_cap);
    v_capped := false;
    if v_cap is not null and v_base > v_cap then v_base := v_cap; v_capped := true; end if;

    -- a recompute starts this creator's awards afresh (a one-off is only ever paid once)
    if v_has then delete from public.vip_bonus_awards where statement_id = v_existing.id; end if;

    v_bonuses := '[]'::jsonb;
    for rl in
      select * from public.vip_bonus_rules r
       where r.programme_id = m.programme_id and r.active and (r.month_id is null or r.month_id = p_month)
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
            else false end;
          if v_ok and rl.amount > 0 then
            v_bonuses := v_bonuses || jsonb_build_object('rule_id', rl.id, 'label', rl.label, 'kind', rl.kind, 'reward', rl.reward, 'amount', rl.amount);
          end if;
        end if;
      end if;
    end loop;

    select coalesce(sum((b ->> 'amount')::numeric) filter (where coalesce(b ->> 'reward', 'cash') = 'cash'), 0)
      into v_cash from jsonb_array_elements(v_bonuses) b;
    v_adj := case when v_has then coalesce(v_existing.adjustments, '[]'::jsonb) else '[]'::jsonb end;
    select coalesce(sum((a ->> 'amount')::numeric), 0) into v_adj_sum from jsonb_array_elements(v_adj) a;
    select coalesce(s.rollover_out, 0) into v_roll_in
      from public.vip_statements s
      join public.vip_months pm on pm.id = s.month_id
     where s.profile_id = mem.profile_id and s.status <> 'void' and pm.programme_id = m.programme_id and pm.starts_at < m.starts_at
     order by pm.starts_at desc limit 1;
    v_roll_in := coalesce(v_roll_in, 0);

    v_total := round(v_base + v_cash + v_adj_sum + v_roll_in, 2);
    v_roll_out := 0;
    if v_total < p.min_payout then
      v_roll_out := greatest(v_total, 0);
      v_total := 0;
    end if;

    v_flags := '[]'::jsonb;
    if not public.vip_payment_ready(mem.profile_id, p.currency) then v_flags := v_flags || '"no_payment_details"'::jsonb; end if;
    if mem.status <> 'active' then v_flags := v_flags || '"not_active"'::jsonb; end if;
    if v_views = 0 then v_flags := v_flags || '"no_views"'::jsonb; end if;
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

    -- one-off milestones are claimed by this draft
    insert into public.vip_bonus_awards (rule_id, profile_id, statement_id)
    select (b ->> 'rule_id')::uuid, mem.profile_id, v_prev
      from jsonb_array_elements(v_bonuses) b
     where b ->> 'kind' = 'milestone'
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ------------------------------------------------------------------------ approve, adjust, void
create or replace function public.vip_approve_statement(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.vip_statements; p public.vip_programmes; m public.vip_months;
  v_reward uuid; v_inv uuid; v_desc text; v_b jsonb; v_vouch uuid[] := '{}'; v_id uuid; v_pay boolean;
  v_month text;
begin
  select * into s from public.vip_statements where id = p_id for update;
  if s is null then raise exception 'No such statement.'; end if;
  if not public.vip_can_manage(s.programme_id) then raise exception 'Only the market lead or the team can approve a statement.'; end if;
  if s.status <> 'draft' then raise exception 'That statement is not waiting for approval.'; end if;
  select * into p from public.vip_programmes where id = s.programme_id;
  select * into m from public.vip_months where id = s.month_id;
  v_month := to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY');

  if s.total > 0 then
    v_desc := 'VIP programme, ' || v_month || ': ' || to_char(s.views, 'FM999,999,999,990') || ' views at ' ||
              s.currency || ' ' || to_char(coalesce(s.cpm, p.cpm), 'FM990.00##') || ' per 1,000'
              || case when jsonb_array_length(s.bonuses) > 0 then ', plus bonuses' else '' end || '.';
    insert into public.rewards (creator_id, reward_type, amount, currency, status, community_id, source, payment_notes)
    values (s.profile_id, 'cash', s.total, s.currency, 'pending', p.community_id, 'vip', v_desc)
    returning id into v_reward;
    select id into v_inv from public.invoices where reward_id = v_reward;
    if v_inv is not null then
      perform set_config('tryp.system_invoice', 'on', true);
      update public.invoices set stage = 'approved', status = 'approved', decided_at = now(), decided_by = auth.uid()
       where id = v_inv and stage = 'awaiting_approval';
      perform set_config('tryp.system_invoice', 'off', true);
    end if;
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
     set status = 'approved', approved_by = auth.uid(), approved_at = now(), reward_id = v_reward,
         invoice_id = v_inv, voucher_reward_ids = v_vouch, updated_at = now()
   where id = p_id;

  perform public.notify_user(s.profile_id, 'vip', 'Your ' || v_month || ' VIP statement is ready',
    case when s.total > 0
      then 'You earned ' || s.currency || ' ' || to_char(s.total, 'FM999999990.00') || ' for ' || v_month || '.'
      else 'Your ' || v_month || ' statement is in. It is carried over to next month.' end,
    '/vip?tab=payouts');
  return jsonb_build_object('reward_id', v_reward, 'invoice_id', v_inv, 'vouchers', coalesce(array_length(v_vouch, 1), 0));
end $$;

create or replace function public.vip_approve_month(p_month uuid)
returns int language plpgsql security definer set search_path = public as $$
declare m public.vip_months; r record; n int := 0;
begin
  select * into m from public.vip_months where id = p_month;
  if m is null then raise exception 'No such month.'; end if;
  if not public.vip_can_manage(m.programme_id) then raise exception 'Only the market lead or the team can do that.'; end if;
  for r in select id from public.vip_statements where month_id = p_month and status = 'draft' order by created_at loop
    perform public.vip_approve_statement(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.vip_add_adjustment(p_statement uuid, p_label text, p_amount numeric, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.vip_statements;
begin
  select * into s from public.vip_statements where id = p_statement for update;
  if s is null then raise exception 'No such statement.'; end if;
  if not public.vip_can_manage(s.programme_id) then raise exception 'Only the market lead or the team can do that.'; end if;
  if s.status <> 'draft' then raise exception 'Only a draft can be adjusted. Late corrections go on next month''s statement.'; end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'Say what the adjustment is for.'; end if;
  update public.vip_statements
     set adjustments = adjustments || jsonb_build_object('label', btrim(p_label), 'amount', round(p_amount, 2),
                                                          'reason', nullif(btrim(coalesce(p_reason, '')), ''),
                                                          'by', auth.uid(), 'at', now())
   where id = p_statement;
  perform public.vip_compute_statements(s.month_id);
end $$;

create or replace function public.vip_remove_adjustment(p_statement uuid, p_index int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.vip_statements; v_new jsonb;
begin
  select * into s from public.vip_statements where id = p_statement for update;
  if s is null then raise exception 'No such statement.'; end if;
  if not public.vip_can_manage(s.programme_id) then raise exception 'Only the market lead or the team can do that.'; end if;
  if s.status <> 'draft' then raise exception 'Only a draft can be adjusted.'; end if;
  select coalesce(jsonb_agg(a order by ord), '[]'::jsonb) into v_new
    from jsonb_array_elements(s.adjustments) with ordinality as t(a, ord) where ord - 1 <> p_index;
  update public.vip_statements set adjustments = v_new where id = p_statement;
  perform public.vip_compute_statements(s.month_id);
end $$;

-- an invoice raised AFTER the approval (the creator saved bank details late) follows the approval
create or replace function public.vip_invoice_follows_statement()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.vip_statements;
begin
  if new.reward_id is null then return new; end if;
  select * into s from public.vip_statements where reward_id = new.reward_id and status = 'approved';
  if s is null then return new; end if;
  update public.vip_statements set invoice_id = new.id where id = s.id;
  if new.stage = 'awaiting_approval' then
    perform set_config('tryp.system_invoice', 'on', true);
    update public.invoices set stage = 'approved', status = 'approved', decided_at = now(), decided_by = s.approved_by
     where id = new.id;
    perform set_config('tryp.system_invoice', 'off', true);
  end if;
  return new;
end $$;
create trigger trg_vip_invoice_follows_statement after insert on public.invoices
  for each row execute function public.vip_invoice_follows_statement();

-- ------------------------------------------------------------------------ membership
create or replace function public.vip_add_member(
  p_profile uuid, p_programme uuid, p_cpm numeric default null, p_cap numeric default null,
  p_target_videos int default null, p_target_views bigint default null, p_source text default 'admin')
returns void language plpgsql security definer set search_path = public as $$
declare v_comm uuid; v_name text; v_progname text;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the market lead or the team can add a VIP.'; end if;
  select community_id, name into v_comm, v_progname from public.vip_programmes where id = p_programme;
  if v_comm is null then raise exception 'No such VIP programme.'; end if;
  select name into v_name from public.profiles where id = p_profile;
  if v_name is null then raise exception 'No such creator.'; end if;

  insert into public.vip_members (profile_id, programme_id, status, cpm, monthly_cap, target_videos, target_views, source, created_by)
  values (p_profile, p_programme, 'active', p_cpm, p_cap, p_target_videos, p_target_views,
          case when p_source in ('admin', 'invite', 'transfer') then p_source else 'admin' end, auth.uid())
  on conflict (profile_id) do update set
    programme_id = excluded.programme_id, status = 'active', left_on = null,
    cpm = coalesce(excluded.cpm, vip_members.cpm), monthly_cap = coalesce(excluded.monthly_cap, vip_members.monthly_cap),
    target_videos = coalesce(excluded.target_videos, vip_members.target_videos),
    target_views = coalesce(excluded.target_views, vip_members.target_views);

  -- a VIP is a member of the programme's market, so its room and its people are theirs
  insert into public.community_members (community_id, profile_id, role, status)
  values (v_comm, p_profile, 'creator', 'active')
  on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';

  perform public.vip_ensure_month(p_programme);
  perform public.notify_user(p_profile, 'vip', 'Welcome to the VIP creators',
    'You are now part of ' || v_progname || '. Your VIP page has your videos, your earnings and your room.', '/vip');
end $$;

create or replace function public.vip_update_member(
  p_profile uuid, p_status text default null, p_cpm numeric default null, p_clear_cpm boolean default false,
  p_cap numeric default null, p_clear_cap boolean default false,
  p_target_videos int default null, p_target_views bigint default null, p_clear_targets boolean default false,
  p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_prog uuid;
begin
  select programme_id into v_prog from public.vip_members where profile_id = p_profile;
  if v_prog is null then raise exception 'That creator is not a VIP.'; end if;
  if not public.vip_can_manage(v_prog) then raise exception 'Only the market lead or the team can change a VIP.'; end if;
  if p_status is not null and p_status not in ('active', 'paused', 'left') then raise exception 'Unknown status.'; end if;
  update public.vip_members set
    status = coalesce(p_status, status),
    left_on = case when p_status = 'left' then current_date when p_status in ('active', 'paused') then null else left_on end,
    cpm = case when p_clear_cpm then null else coalesce(p_cpm, cpm) end,
    monthly_cap = case when p_clear_cap then null else coalesce(p_cap, monthly_cap) end,
    target_videos = case when p_clear_targets then null else coalesce(p_target_videos, target_videos) end,
    target_views = case when p_clear_targets then null else coalesce(p_target_views, target_views) end,
    notes = case when p_notes is null then notes else nullif(btrim(p_notes), '') end
  where profile_id = p_profile;
end $$;

create or replace function public.vip_accept_terms()
returns void language plpgsql security definer set search_path = public as $$
declare v_v int;
begin
  select p.terms_version into v_v from public.vip_members m join public.vip_programmes p on p.id = m.programme_id
   where m.profile_id = auth.uid() and m.status = 'active';
  if v_v is null then raise exception 'You are not in the VIP programme.'; end if;
  update public.vip_members set terms_accepted_at = now(), terms_version = v_v where profile_id = auth.uid();
end $$;

-- ------------------------------------------------------------------------ invites
create or replace function public.vip_create_invite(p_programme uuid, p_label text default null, p_max_uses int default null, p_days int default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_token text;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the market lead or the team can make a VIP link.'; end if;
  v_token := translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_');
  insert into public.vip_invites (token, programme_id, label, max_uses, expires_at, created_by)
  values (v_token, p_programme, nullif(btrim(coalesce(p_label, '')), ''), p_max_uses,
          case when p_days is null then null else now() + (p_days * interval '1 day') end, auth.uid());
  return v_token;
end $$;

create or replace function public.vip_revoke_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prog uuid;
begin
  select programme_id into v_prog from public.vip_invites where id = p_id;
  if v_prog is null or not public.vip_can_manage(v_prog) then raise exception 'Only the market lead or the team can do that.'; end if;
  update public.vip_invites set revoked_at = now() where id = p_id and revoked_at is null;
end $$;

-- What a stranger following a VIP link is told: is it good, and what is it for. Nothing else.
create or replace function public.vip_invite_check(p_token text)
returns table (valid boolean, programme text, label text, language text)
language sql stable security definer set search_path = public as $$
  select
    coalesce((select i.revoked_at is null and (i.expires_at is null or i.expires_at > now())
                     and (i.max_uses is null or i.uses < i.max_uses)
                from public.vip_invites i where i.token = p_token), false),
    (select p.name from public.vip_invites i join public.vip_programmes p on p.id = i.programme_id
      where i.token = p_token and i.revoked_at is null and (i.expires_at is null or i.expires_at > now())),
    (select i.label from public.vip_invites i
      where i.token = p_token and i.revoked_at is null and (i.expires_at is null or i.expires_at > now())),
    (select c.language from public.vip_invites i join public.vip_programmes p on p.id = i.programme_id
       join public.communities c on c.id = p.community_id
      where i.token = p_token and i.revoked_at is null and (i.expires_at is null or i.expires_at > now()))
$$;

create or replace function public.claim_vip_invite(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare i public.vip_invites; v_comm uuid; v_progname text;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.vip_members where profile_id = auth.uid() and status = 'active') then return true; end if;
  select * into i from public.vip_invites where token = p_token;
  if i is null or i.revoked_at is not null or (i.expires_at is not null and i.expires_at < now())
     or (i.max_uses is not null and i.uses >= i.max_uses) then
    return false;
  end if;
  select community_id, name into v_comm, v_progname from public.vip_programmes where id = i.programme_id;
  insert into public.vip_members (profile_id, programme_id, status, source, created_by)
  values (auth.uid(), i.programme_id, 'active', 'invite', i.created_by)
  on conflict (profile_id) do update set programme_id = excluded.programme_id, status = 'active', left_on = null;
  insert into public.community_members (community_id, profile_id, role, status)
  values (v_comm, auth.uid(), 'creator', 'active')
  on conflict (community_id, profile_id) do update set status = 'active' where community_members.status <> 'active';
  update public.vip_invites set uses = uses + 1 where id = i.id;
  perform public.vip_ensure_month(i.programme_id);
  return true;
end $$;

-- ------------------------------------------------------------------------ videos
create or replace function public.vip_submit_video(p_url text, p_platform text, p_caption text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.vip_members; p public.vip_programmes; v_id uuid; v_posted timestamptz; v_url text := btrim(coalesce(p_url, ''));
begin
  select * into m from public.vip_members where profile_id = auth.uid() and status = 'active';
  if m is null then raise exception 'Only VIP creators can add a video here.'; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  if m.terms_accepted_at is null or coalesce(m.terms_version, 0) < p.terms_version then
    raise exception 'Please accept the VIP terms first.';
  end if;
  if v_url !~* '^https?://' then raise exception 'Paste the full link to your video.'; end if;
  if p_platform not in ('Instagram', 'TikTok', 'YouTube', 'Facebook', 'Other') then raise exception 'Unknown platform.'; end if;
  v_posted := public.video_posted_at(p_platform, v_url, null);
  if v_posted is not null and v_posted < now() - (p.window_days * interval '1 day') then
    raise exception 'That video was posted more than % days ago, so it cannot be added.', p.window_days;
  end if;
  insert into public.vip_videos (profile_id, programme_id, platform, video_url, caption)
  values (auth.uid(), m.programme_id, p_platform, v_url, nullif(btrim(coalesce(p_caption, '')), ''))
  returning id into v_id;
  perform public.vip_ensure_month(m.programme_id);
  return v_id;
end $$;

create or replace function public.vip_remove_video(p_video uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vip_videos;
begin
  select * into v from public.vip_videos where id = p_video;
  if v is null then raise exception 'No such video.'; end if;
  if not (v.profile_id = auth.uid() or public.vip_can_manage(v.programme_id)) then raise exception 'That is not your video.'; end if;
  -- once a statement has counted it, it stays: take it out with a disqualification instead
  if exists (select 1 from public.vip_statements s join public.vip_months mm on mm.id = s.month_id
              where s.profile_id = v.profile_id and s.status = 'approved' and mm.ends_at > v.submitted_at) then
    raise exception 'A statement already counted this month. Ask the team to take it out.';
  end if;
  delete from public.vip_videos where id = p_video;
end $$;

create or replace function public.vip_set_video_status(p_video uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v public.vip_videos;
begin
  select * into v from public.vip_videos where id = p_video;
  if v is null then raise exception 'No such video.'; end if;
  if not public.vip_can_manage(v.programme_id) then raise exception 'Only the market lead or the team can do that.'; end if;
  if p_status not in ('tracking', 'disqualified') then raise exception 'Unknown status.'; end if;
  update public.vip_videos set
    status = p_status,
    disqualified_reason = case when p_status = 'disqualified' then nullif(btrim(coalesce(p_reason, '')), '') else null end,
    disqualified_at = case when p_status = 'disqualified' then now() else null end,
    disqualified_by = case when p_status = 'disqualified' then auth.uid() else null end
  where id = p_video;
end $$;

-- ------------------------------------------------------------------------ what a VIP sees
create or replace function public.vip_my_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.vip_members; p public.vip_programmes; mo public.vip_months; v_stat record;
  v_views bigint := 0; v_videos int := 0; v_base numeric; v_cap numeric; v_f numeric; v_proj_views numeric;
  v_videos_json jsonb; v_target jsonb; v_life record; v_rank int; v_total int; v_pay boolean;
begin
  select * into m from public.vip_members where profile_id = auth.uid();
  if m is null then return null; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  mo := public.vip_ensure_month(p.id);

  select s.videos, s.views into v_videos, v_views from public.vip_month_stats(mo.id) s where s.profile_id = auth.uid();
  v_views := coalesce(v_views, 0); v_videos := coalesce(v_videos, 0);
  v_base := public.vip_views_pay(v_views, p.cpm, p.tiers, m.cpm);
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
    into v_videos_json from public.vip_videos v where v.profile_id = auth.uid();

  select coalesce(sum(s.views), 0) as views, coalesce(sum(s.videos), 0) as videos, coalesce(max(s.base), 0) as best
    into v_life from public.vip_statements s where s.profile_id = auth.uid() and s.status <> 'void' and s.month_id <> mo.id;

  select rk, n into v_rank, v_total from (
    select profile_id, row_number() over (order by views desc, profile_id) rk, count(*) over () n
      from public.vip_month_stats(mo.id)) z where z.profile_id = auth.uid();

  v_pay := public.vip_payment_ready(auth.uid(), p.currency);

  return jsonb_build_object(
    'programme', jsonb_build_object('id', p.id, 'name', p.name, 'currency', p.currency, 'cpm', p.cpm, 'tiers', p.tiers,
        'min_payout', p.min_payout, 'monthly_cap', p.monthly_cap, 'window_days', p.window_days,
        'terms', p.terms, 'terms_version', p.terms_version, 'community_id', p.community_id),
    'member', jsonb_build_object('status', m.status, 'cpm', m.cpm, 'monthly_cap', m.monthly_cap,
        'target_videos', m.target_videos, 'target_views', m.target_views, 'joined_on', m.joined_on,
        'terms_ok', m.terms_accepted_at is not null and coalesce(m.terms_version, 0) >= p.terms_version),
    'month', jsonb_build_object('id', mo.id, 'year', mo.year, 'month', mo.month, 'starts_at', mo.starts_at,
        'ends_at', mo.ends_at, 'status', mo.status),
    'stats', jsonb_build_object('views', v_views, 'videos', v_videos, 'base', v_base,
        'effective_cpm', coalesce(m.cpm, p.cpm), 'projected_views', v_proj_views,
        'projected_base', case when v_proj_views is null then null
                               else least(coalesce(v_cap, 1e12), public.vip_views_pay(v_proj_views::bigint, p.cpm, p.tiers, m.cpm)) end,
        'rank', v_rank, 'of', v_total),
    'lifetime', jsonb_build_object('views', v_life.views + v_views, 'videos', v_life.videos + v_videos, 'best_month', greatest(v_life.best, v_base)),
    'videos', v_videos_json,
    'payment_ready', v_pay);
end $$;

create or replace function public.vip_board()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prog uuid; mo public.vip_months;
begin
  select programme_id into v_prog from public.vip_members where profile_id = auth.uid() and status = 'active';
  if v_prog is null then return '[]'::jsonb; end if;
  mo := public.vip_ensure_month(v_prog);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'rank', z.rk, 'name', split_part(pr.name, ' ', 1), 'photo', pr.photo_url, 'views', z.views, 'videos', z.videos,
        'me', z.profile_id = auth.uid()) order by z.rk)
      from (
        select s.profile_id, s.views, s.videos, row_number() over (order by s.views desc, s.profile_id) rk
          from public.vip_month_stats(mo.id) s
          join public.vip_members vm on vm.profile_id = s.profile_id and vm.status = 'active'
      ) z join public.profiles pr on pr.id = z.profile_id
  ), '[]'::jsonb);
end $$;

create or replace function public.vip_my_statements()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'year', mo.year, 'month', mo.month, 'views', s.views, 'videos', s.videos, 'cpm', s.cpm,
      'base', s.base, 'cap_applied', s.cap_applied, 'bonuses', s.bonuses, 'adjustments', s.adjustments,
      'rollover_in', s.rollover_in, 'rollover_out', s.rollover_out, 'total', s.total, 'currency', s.currency,
      'status', s.status, 'approved_at', s.approved_at,
      'invoice_id', s.invoice_id, 'invoice_number', i.number, 'invoice_stage', i.stage, 'paid_at', i.paid_at)
      order by mo.year desc, mo.month desc), '[]'::jsonb)
    from public.vip_statements s
    join public.vip_months mo on mo.id = s.month_id
    left join public.invoices i on i.id = s.invoice_id
   where s.profile_id = auth.uid() and s.status = 'approved'
$$;

-- ------------------------------------------------------------------------ what the team sees
create or replace function public.vip_admin_overview(p_programme uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.vip_programmes; mo public.vip_months; v_members jsonb; v_views bigint; v_spend numeric; v_f numeric;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Not yours to see.'; end if;
  select * into p from public.vip_programmes where id = p_programme;
  mo := public.vip_ensure_month(p_programme);
  v_f := greatest(0.0001, least(1, extract(epoch from (now() - mo.starts_at)) / nullif(extract(epoch from (mo.ends_at - mo.starts_at)), 0)));

  select coalesce(jsonb_agg(row_json order by (row_json ->> 'views')::bigint desc), '[]'::jsonb) into v_members from (
    select jsonb_build_object(
      'profile_id', vm.profile_id, 'name', pr.name, 'photo', pr.photo_url, 'status', vm.status,
      'cpm', vm.cpm, 'cap', vm.monthly_cap, 'target_videos', vm.target_videos, 'target_views', vm.target_views,
      'joined_on', vm.joined_on, 'source', vm.source, 'notes', vm.notes,
      'terms_ok', vm.terms_accepted_at is not null and coalesce(vm.terms_version, 0) >= p.terms_version,
      'videos', coalesce(s.videos, 0), 'views', coalesce(s.views, 0),
      'base', least(coalesce(vm.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(coalesce(s.views, 0), p.cpm, p.tiers, vm.cpm)),
      'projected_base', case when v_f >= 0.08 then least(coalesce(vm.monthly_cap, p.monthly_cap, 1e12),
                         public.vip_views_pay(round(coalesce(s.views, 0) / v_f)::bigint, p.cpm, p.tiers, vm.cpm)) end,
      'payment_ready', public.vip_payment_ready(vm.profile_id, p.currency),
      'lifetime_views', coalesce((select sum(x.views) from public.vip_statements x where x.profile_id = vm.profile_id and x.status <> 'void' and x.month_id <> mo.id), 0) + coalesce(s.views, 0)
    ) as row_json
    from public.vip_members vm
    join public.profiles pr on pr.id = vm.profile_id
    left join public.vip_month_stats(mo.id) s on s.profile_id = vm.profile_id
   where vm.programme_id = p_programme and vm.status <> 'left'
  ) q;

  select coalesce(sum((x ->> 'views')::bigint), 0),
         coalesce(sum((x ->> 'base')::numeric), 0)
    into v_views, v_spend from jsonb_array_elements(v_members) x;

  return jsonb_build_object(
    'programme', to_jsonb(p),
    'month', to_jsonb(mo),
    'members', v_members,
    'totals', jsonb_build_object('views', v_views, 'spend_so_far', v_spend,
        'spend_projected', case when v_f >= 0.08 then (select coalesce(sum((x ->> 'projected_base')::numeric), 0) from jsonb_array_elements(v_members) x) end,
        'budget', p.budget_monthly));
end $$;

create or replace function public.vip_month_review(p_month uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.vip_months;
begin
  select * into m from public.vip_months where id = p_month;
  if m is null then raise exception 'No such month.'; end if;
  if not public.vip_can_manage(m.programme_id) then raise exception 'Not yours to see.'; end if;
  return jsonb_build_object(
    'month', to_jsonb(m),
    'statements', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', s.id, 'profile_id', s.profile_id, 'name', pr.name, 'photo', pr.photo_url,
          'views', s.views, 'videos', s.videos, 'cpm', s.cpm, 'base', s.base, 'cap', s.cap, 'cap_applied', s.cap_applied,
          'bonuses', s.bonuses, 'adjustments', s.adjustments, 'rollover_in', s.rollover_in, 'rollover_out', s.rollover_out,
          'total', s.total, 'currency', s.currency, 'flags', s.flags, 'status', s.status,
          'invoice_id', s.invoice_id, 'invoice_number', i.number, 'invoice_stage', i.stage, 'paid_at', i.paid_at,
          'approved_at', s.approved_at) order by s.total desc, pr.name)
        from public.vip_statements s
        join public.profiles pr on pr.id = s.profile_id
        left join public.invoices i on i.id = s.invoice_id
       where s.month_id = p_month), '[]'::jsonb));
end $$;

-- every video the programme holds, for the team
create or replace function public.vip_admin_videos(p_programme uuid, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare mo public.vip_months;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Not yours to see.'; end if;
  mo := public.vip_ensure_month(p_programme);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', v.id, 'profile_id', v.profile_id, 'name', pr.name, 'platform', v.platform, 'url', v.video_url,
        'posted_at', v.posted_at, 'submitted_at', v.submitted_at, 'views_total', v.logged_views,
        'views_counted', public.vip_video_counted(v, mo), 'status', v.status, 'reason', v.disqualified_reason,
        'synced_at', v.views_synced_at, 'error', v.views_sync_error) order by v.submitted_at desc)
      from (select * from public.vip_videos where programme_id = p_programme order by submitted_at desc limit p_limit) v
      join public.profiles pr on pr.id = v.profile_id), '[]'::jsonb);
end $$;

-- months, views, spend and people: the analytics page
create or replace function public.vip_analytics(p_programme uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_months jsonb; v_top jsonb; v_ids uuid[];
begin
  if p_programme is null then
    if not public.is_admin() then raise exception 'Only the team can see every programme.'; end if;
    select array_agg(id) into v_ids from public.vip_programmes;
  else
    if not public.vip_can_manage(p_programme) then raise exception 'Not yours to see.'; end if;
    v_ids := array[p_programme];
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'year', y, 'month', mth,
      'views', views, 'cost', cost, 'members', members, 'videos', videos,
      'cpm', case when views > 0 then round(cost / (views / 1000.0), 4) end) order by y, mth), '[]'::jsonb)
    into v_months
    from (
      select mo.year y, mo.month mth,
             coalesce(sum(s.views), 0) views,
             coalesce(sum(s.base + (select coalesce(sum((b ->> 'amount')::numeric), 0) from jsonb_array_elements(s.bonuses) b)), 0) cost,
             count(distinct s.profile_id) filter (where s.views > 0) members,
             coalesce(sum(s.videos), 0) videos
        from public.vip_months mo
        join public.vip_statements s on s.month_id = mo.id and s.status <> 'void'
       where mo.programme_id = any (v_ids)
       group by mo.year, mo.month
       order by mo.year desc, mo.month desc limit 12
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object('profile_id', profile_id, 'name', name, 'photo', photo, 'views', views, 'earned', earned, 'months', months)
                            order by views desc), '[]'::jsonb)
    into v_top from (
      select s.profile_id, pr.name, pr.photo_url photo, sum(s.views) views, sum(s.total) earned, count(*) filter (where s.views > 0) months
        from public.vip_statements s join public.profiles pr on pr.id = s.profile_id
       where s.programme_id = any (v_ids) and s.status <> 'void'
       group by s.profile_id, pr.name, pr.photo_url order by sum(s.views) desc limit 10
    ) z;

  return jsonb_build_object('months', v_months, 'top', v_top,
    'members', (select count(*) from public.vip_members where programme_id = any (v_ids) and status = 'active'));
end $$;

-- KPI numbers for one programme-month (live while it is open, statements once drafted)
create or replace function public.vip_kpi_actuals(p_programme uuid, p_year int, p_month int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare mo public.vip_months; p public.vip_programmes; v_views bigint; v_videos int; v_active int; v_spend numeric; v_hit int;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Not yours to see.'; end if;
  select * into p from public.vip_programmes where id = p_programme;
  select * into mo from public.vip_months where programme_id = p_programme and year = p_year and month = p_month;
  if mo is null then
    return jsonb_build_object('views', 0, 'videos', 0, 'active_creators', 0, 'spend', 0, 'hit_target', 0);
  end if;
  select coalesce(sum(views), 0), coalesce(sum(videos), 0), count(*) filter (where views > 0)
    into v_views, v_videos, v_active from public.vip_month_stats(mo.id);
  select coalesce(sum(base + (select coalesce(sum((b ->> 'amount')::numeric), 0) from jsonb_array_elements(bonuses) b)), 0)
    into v_spend from public.vip_statements where month_id = mo.id and status <> 'void';
  if v_spend = 0 then
    select coalesce(sum(public.vip_views_pay(s.views, p.cpm, p.tiers, vm.cpm)), 0) into v_spend
      from public.vip_month_stats(mo.id) s join public.vip_members vm on vm.profile_id = s.profile_id;
  end if;
  select count(*) into v_hit from public.vip_month_stats(mo.id) s join public.vip_members vm on vm.profile_id = s.profile_id
   where (vm.target_videos is not null or vm.target_views is not null)
     and (vm.target_videos is null or s.videos >= vm.target_videos)
     and (vm.target_views is null or s.views >= vm.target_views);
  return jsonb_build_object('views', v_views, 'videos', v_videos, 'active_creators', v_active, 'spend', round(v_spend, 2), 'hit_target', v_hit);
end $$;

-- ------------------------------------------------------------------------ the clock
create or replace function public.vip_run_sync(p_force boolean default false, p_programme uuid default null)
returns jsonb language plpgsql security definer set search_path = public, private, extensions as $$
declare
  secret text := (select value from private.config where key = 'webhook_secret');
  v_hours numeric := coalesce((select (value ->> 'interval_hours')::numeric from public.app_settings where key = 'vip_sync'), 12);
  v_due int;
begin
  select count(*) into v_due from public.vip_videos v
   where v.status = 'tracking' and (p_programme is null or v.programme_id = p_programme)
     and (p_force or v.views_synced_at is null or v.views_synced_at < now() - (v_hours * interval '1 hour'));
  if v_due = 0 then return jsonb_build_object('fired', false, 'reason', 'nothing_due'); end if;
  perform net.http_post(
    url := 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/view-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
    body := jsonb_build_object('vip_only', true, 'force', p_force, 'vip_interval_hours', v_hours)
  );
  return jsonb_build_object('fired', true, 'due', v_due);
end $$;

create or replace function public.vip_sync_now(p_programme uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Not yours to do.'; end if;
  return public.vip_run_sync(true, p_programme);
end $$;

-- runs every ten minutes: make the month, force the last read just before it ends, close it just after
create or replace function public.vip_close_due()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p record; m record; v_closed int := 0; v_synced int := 0; v_n int;
begin
  for p in select id from public.vip_programmes where active loop
    perform public.vip_ensure_month(p.id);
  end loop;

  for m in select * from public.vip_months where status = 'open' and final_sync_at is null and now() >= ends_at - interval '25 minutes' loop
    perform public.vip_run_sync(true, m.programme_id);
    update public.vip_months set final_sync_at = now(), status = 'closing' where id = m.id;
    v_synced := v_synced + 1;
  end loop;

  for m in select * from public.vip_months
            where status = 'closing' and now() >= ends_at + interval '30 minutes'
              and now() >= final_sync_at + interval '30 minutes' loop
    v_n := public.vip_compute_statements(m.id);
    update public.vip_months set status = 'closed', closed_at = now() where id = m.id;
    perform public.vip_ensure_month(m.programme_id, m.ends_at + interval '1 hour');
    insert into public.notifications (recipient_id, type, title, body, link)
    select cm.profile_id, 'vip', 'A VIP month is ready to review',
           to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY') || ': ' || v_n || ' statements are drafted.',
           '/admin/vip?tab=close'
      from public.vip_programmes pr
      join public.community_members cm on cm.community_id = pr.community_id and cm.role = 'manager' and cm.status = 'active'
     where pr.id = m.programme_id;
    insert into public.notifications (recipient_id, type, title, body, link)
    select pf.id, 'vip', 'A VIP month is ready to review',
           to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY') || ': ' || v_n || ' statements are drafted.', '/admin/vip?tab=close'
      from public.profiles pf where pf.platform_role in ('global_admin', 'owner') and pf.is_test = false
       and not exists (select 1 from public.community_members cm join public.vip_programmes pr on pr.community_id = cm.community_id
                        where cm.profile_id = pf.id and pr.id = m.programme_id and cm.role = 'manager');
    v_closed := v_closed + 1;
  end loop;
  return jsonb_build_object('synced', v_synced, 'closed', v_closed);
end $$;

-- ------------------------------------------------------------------------ rooms
create or replace function public.vip_ensure_rooms(p_programme uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_comm uuid; v_name text; v_world uuid;
begin
  select community_id, name into v_comm, v_name from public.vip_programmes where id = p_programme;
  insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
  values (v_comm, 'vip', 'VIP room', 'Only for the VIP creators of this market and the team.', 'star', 'all', 'vip', 5)
  on conflict do nothing;
  select id into v_world from public.communities where kind = 'network' limit 1;
  if v_world is not null then
    insert into public.channels (community_id, key, label, hint, icon, post_policy, visibility, position)
    values (v_world, 'vip_global', 'VIP lounge', 'Every VIP creator, in every market, and the team.', 'star', 'all', 'vip', 6)
    on conflict do nothing;
  end if;
end $$;

-- ------------------------------------------------------------------------ row level security
alter table public.vip_programmes enable row level security;
alter table public.vip_members enable row level security;
alter table public.vip_months enable row level security;
alter table public.vip_videos enable row level security;
alter table public.vip_view_readings enable row level security;
alter table public.vip_bonus_rules enable row level security;
alter table public.vip_statements enable row level security;
alter table public.vip_bonus_awards enable row level security;
alter table public.vip_invites enable row level security;
alter table public.vip_kpi_targets enable row level security;

create policy "vip programmes: read" on public.vip_programmes for select
  using (public.vip_can_manage(id) or id = public.vip_my_programme());
create policy "vip programmes: manage" on public.vip_programmes for update
  using (public.vip_can_manage(id)) with check (public.vip_can_manage(id));
create policy "vip programmes: admin create" on public.vip_programmes for insert with check (public.is_admin());

create policy "vip members: read" on public.vip_members for select
  using (profile_id = (select auth.uid()) or public.vip_can_manage(programme_id));

create policy "vip months: read" on public.vip_months for select
  using (public.vip_can_manage(programme_id) or programme_id = public.vip_my_programme());

create policy "vip videos: read" on public.vip_videos for select
  using (profile_id = (select auth.uid()) or public.vip_can_manage(programme_id));

create policy "vip readings: read" on public.vip_view_readings for select
  using (exists (select 1 from public.vip_videos v where v.id = video_id
                  and (v.profile_id = (select auth.uid()) or public.vip_can_manage(v.programme_id))));

create policy "vip rules: read" on public.vip_bonus_rules for select
  using (public.vip_can_manage(programme_id) or programme_id = public.vip_my_programme());
create policy "vip rules: manage" on public.vip_bonus_rules for all
  using (public.vip_can_manage(programme_id)) with check (public.vip_can_manage(programme_id));

create policy "vip statements: read" on public.vip_statements for select
  using ((profile_id = (select auth.uid()) and status = 'approved') or public.vip_can_manage(programme_id));

create policy "vip invites: manage" on public.vip_invites for all
  using (public.vip_can_manage(programme_id)) with check (public.vip_can_manage(programme_id));

create policy "vip kpi: manage" on public.vip_kpi_targets for all
  using (public.vip_can_manage(programme_id)) with check (public.vip_can_manage(programme_id));
-- vip_bonus_awards: no policy at all = deny to API roles; only the definer functions touch it.

-- THE TWO SIDES OF THE FENCE.
-- 1. A VIP room is a room for VIPs: the list, its messages and posting to it obey the same rule.
drop policy if exists channels_read on public.channels;
create policy channels_read on public.channels for select using (
  community_id in (select public.my_scopes())
  and (visibility = 'scope'
       or community_id in (select public.my_managed_scopes())
       or (visibility = 'vip' and public.is_active_vip())));

drop policy if exists "messages: read in rooms you can open" on public.messages;
create policy "messages: read in rooms you can open" on public.messages for select using (
  public.is_admin() or (
    community_id in (select public.my_scopes())
    and (channel_id is null or exists (
      select 1 from public.channels ch
       where ch.id = messages.channel_id
         and (ch.visibility = 'scope'
              or ch.community_id in (select public.my_managed_scopes())
              or (ch.visibility = 'vip' and public.is_active_vip()))))));

create policy "messages: vip rooms need a vip" on public.messages as restrictive for insert
  with check (
    channel_id is null
    or not exists (select 1 from public.channels ch where ch.id = messages.channel_id and ch.visibility = 'vip')
    or public.is_active_vip() or public.is_admin()
    or exists (select 1 from public.channels ch where ch.id = messages.channel_id and ch.community_id in (select public.my_managed_scopes())));

-- 2. VIPs are paid by views, so they neither see nor enter the challenges.
create policy "challenges: not for vips" on public.challenges as restrictive for select
  using (public.is_admin() or not public.is_active_vip());
create policy "submissions: not for vips" on public.submissions as restrictive for insert
  with check (not public.is_active_vip());

-- ------------------------------------------------------------------------ grants
-- Only OUR functions, one by one. (Never a blanket revoke on the schema: the public pages call public RPCs.)
do $$
declare f text;
begin
  foreach f in array array[
    'is_active_vip()', 'vip_can_manage(uuid)', 'vip_my_programme()', 'vip_payment_ready(uuid,text)', 'vip_protect_flag()',
    'vip_member_flag()', 'vip_video_fill()', 'vip_month_bounds(int,int,text)', 'vip_ensure_month(uuid,timestamptz)',
    'vip_video_counted(public.vip_videos,public.vip_months)', 'vip_month_stats(uuid)', 'vip_views_pay(bigint,numeric,jsonb,numeric)',
    'vip_compute_statements(uuid)', 'vip_approve_statement(uuid)', 'vip_approve_month(uuid)',
    'vip_add_adjustment(uuid,text,numeric,text)', 'vip_remove_adjustment(uuid,int)', 'vip_invoice_follows_statement()',
    'vip_add_member(uuid,uuid,numeric,numeric,int,bigint,text)',
    'vip_update_member(uuid,text,numeric,boolean,numeric,boolean,int,bigint,boolean,text)', 'vip_accept_terms()',
    'vip_create_invite(uuid,text,int,int)', 'vip_revoke_invite(uuid)', 'vip_invite_check(text)', 'claim_vip_invite(text)',
    'vip_submit_video(text,text,text)', 'vip_remove_video(uuid)', 'vip_set_video_status(uuid,text,text)',
    'vip_my_overview()', 'vip_board()', 'vip_my_statements()', 'vip_admin_overview(uuid)', 'vip_month_review(uuid)',
    'vip_admin_videos(uuid,int)', 'vip_analytics(uuid)', 'vip_kpi_actuals(uuid,int,int)', 'vip_run_sync(boolean,uuid)',
    'vip_sync_now(uuid)', 'vip_close_due()', 'vip_ensure_rooms(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'is_active_vip()', 'vip_can_manage(uuid)', 'vip_my_programme()', 'vip_compute_statements(uuid)',
    'vip_approve_statement(uuid)', 'vip_approve_month(uuid)', 'vip_add_adjustment(uuid,text,numeric,text)',
    'vip_remove_adjustment(uuid,int)', 'vip_add_member(uuid,uuid,numeric,numeric,int,bigint,text)',
    'vip_update_member(uuid,text,numeric,boolean,numeric,boolean,int,bigint,boolean,text)', 'vip_accept_terms()',
    'vip_create_invite(uuid,text,int,int)', 'vip_revoke_invite(uuid)', 'claim_vip_invite(text)',
    'vip_submit_video(text,text,text)', 'vip_remove_video(uuid)', 'vip_set_video_status(uuid,text,text)',
    'vip_my_overview()', 'vip_board()', 'vip_my_statements()', 'vip_admin_overview(uuid)', 'vip_month_review(uuid)',
    'vip_admin_videos(uuid,int)', 'vip_analytics(uuid)', 'vip_kpi_actuals(uuid,int,int)', 'vip_sync_now(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.vip_invite_check(text) to anon, authenticated;

-- ------------------------------------------------------------------------ seed, and the clock
insert into public.vip_programmes (community_id, name, currency, cpm)
select c.id, 'VIP ' || c.name, c.currency, 0.25 from public.communities c where c.slug in ('spain', 'romania')
on conflict (community_id) do nothing;
do $$ declare r record; begin
  for r in select id from public.vip_programmes loop
    perform public.vip_ensure_rooms(r.id);
    perform public.vip_ensure_month(r.id);
  end loop;
end $$;

insert into public.app_settings (key, value) values ('vip_sync', '{"interval_hours": 12}'::jsonb) on conflict (key) do nothing;

select cron.schedule('vip-close', '*/10 * * * *', 'select public.vip_close_due()');
select cron.schedule('vip-sync', '37 * * * *', 'select public.vip_run_sync()');
