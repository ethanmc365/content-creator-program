-- 312: THE VIP BALANCE, THE STAY-IN RULE AND THE CPM SHEET (2 Oct 2026).
--
-- Ethan, passing on the Spanish manager: "because we work with them with a fixed CPM ... if they don't reach 100EUR
-- they cannot transfer the money, so they accumulate it until 100EUR or ask for a travel voucher with the same amount
-- they have at the end of the month." And: "see at the end of the month which creators haven't met the requirements to
-- remain in the community, basically, uploading 5 videos a month or one video with +20k views."
--
-- THE MODEL
--   * Every approved month CREDITS a balance (`vip_ledger`, kind 'earned'). Nothing is paid by approving any more.
--   * At the end of each month, once that month's statement is approved, a payout window opens for `request_days`
--     (programme setting, 10 by default). Inside it the creator can:
--       - ask for the whole balance in cash, only when it is at least `min_payout` (now 100) - a cash reward, which
--         raises the invoice through the existing trigger and is approved at once, as statements were;
--       - or take the whole balance as a Tryp.com travel voucher, whatever the amount - a voucher reward the team
--         issues a code for on the Vouchers page;
--       - or do nothing, and it keeps growing.
--     A creator can switch on "pay me automatically" and the cash request is made for them the moment an approved
--     month takes the balance to the threshold.
--   * The rule to stay in (`req_videos` = 5 videos posted in the month, OR one video with `req_single_views` = 20,000
--     views counted in the month) is shown live to the creator, nudged at 10 and 4 days left, written down for every
--     member at month end (`vip_requirement_reviews`) and put in front of the team with keep / warn / pause / remove.
--   * `vip_cpm_sheet` is the manager's spreadsheet, generated: every creator by every month, views and money, from the
--     statements (closed months) and the live numbers (this month), plus any past months typed in by hand
--     (`vip_sheet_history`, for the months before the platform).

-- ---------------------------------------------------------------- settings
alter table public.vip_programmes
  add column if not exists request_days int not null default 10 check (request_days between 1 and 31),
  add column if not exists req_on boolean not null default true,
  add column if not exists req_videos int not null default 5 check (req_videos >= 0),
  add column if not exists req_single_views bigint not null default 20000 check (req_single_views >= 0);

alter table public.vip_members
  add column if not exists auto_payout boolean not null default false;

-- The threshold is the programme's min_payout: 100 for both markets, as Spain runs it today.
update public.vip_programmes set min_payout = 100 where min_payout is null or min_payout < 100;

-- ENGLISH AT SOURCE (Ethan: "everything should be in English unless you chose Romanian or Spanish ... then it should
-- be translated"). The two programmes' lines were seeded in the market's language; the app now translates these into
-- the reader's language, so the source is English.
update public.vip_programmes set
  tagline = 'Your corner of Tryp.com: you are paid for every view.',
  welcome_message = 'Welcome to the VIP creators of Spain. Post as you always do, add every video on your VIP page and you are paid for the views it brings in during the month. The team is one message away in your VIP room.'
 where name = 'VIP Spain';
update public.vip_programmes set
  tagline = 'Your corner of Tryp.com: you are paid for every view.',
  welcome_message = 'Welcome to the VIP creators of Romania. Post as you always do, add every video on your VIP page and you are paid for the views it brings in during the month. The team is one message away in your VIP room.'
 where name = 'VIP Romania';
-- The standard rooms keep English names at source (Portugal's were renamed in Portuguese); the app shows them in
-- the reader's language.
update public.channels ch set label = v.label
  from (values ('announcements', 'Announcements'), ('content_tips', 'Content tips'), ('general', 'General'), ('meetups', 'Meetups')) v(key, label)
 where ch.key = v.key and ch.label <> v.label;
update public.communities set tagline = 'Discover Spain. Briefs, rooms and challenges for the Spanish market.'
 where slug = 'spain' and tagline like 'Descubre Espana%';

-- ---------------------------------------------------------------- tables
create table if not exists public.vip_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  kind text not null check (kind in ('earned', 'payout', 'voucher', 'adjust')),
  amount numeric(12, 2) not null,
  currency text not null default 'EUR',
  statement_id uuid references public.vip_statements(id) on delete set null,
  month_id uuid references public.vip_months(id) on delete set null,
  reward_id uuid references public.rewards(id) on delete set null,
  note text,
  auto boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists vip_ledger_profile on public.vip_ledger (profile_id, created_at desc);
create index if not exists vip_ledger_programme on public.vip_ledger (programme_id, created_at desc);
create unique index if not exists vip_ledger_one_credit on public.vip_ledger (statement_id) where kind = 'earned';
alter table public.vip_ledger enable row level security;
drop policy if exists vip_ledger_read on public.vip_ledger;
create policy vip_ledger_read on public.vip_ledger for select to authenticated
  using (profile_id = auth.uid() or public.vip_can_see(programme_id));

create table if not exists public.vip_requirement_reviews (
  month_id uuid not null references public.vip_months(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  videos int not null default 0,
  best_views bigint not null default 0,
  met boolean not null,
  decision text check (decision in ('keep', 'warn', 'pause', 'remove')),
  note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (month_id, profile_id)
);
alter table public.vip_requirement_reviews enable row level security;
drop policy if exists vip_req_read on public.vip_requirement_reviews;
create policy vip_req_read on public.vip_requirement_reviews for select to authenticated
  using (public.vip_can_see(programme_id));

create table if not exists public.vip_sheet_history (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.vip_programmes(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  year int not null check (year between 2020 and 2100),
  month int not null check (month between 1 and 12),
  views bigint not null default 0 check (views >= 0),
  earned numeric(12, 2) not null default 0,
  cpm numeric,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (programme_id, name, year, month)
);
alter table public.vip_sheet_history enable row level security;
drop policy if exists vip_hist_read on public.vip_sheet_history;
create policy vip_hist_read on public.vip_sheet_history for select to authenticated
  using (public.vip_can_see(programme_id));

-- ---------------------------------------------------------------- helpers (internal)
create or replace function public.vip_balance(p_profile uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(amount), 2), 0) from public.vip_ledger where profile_id = p_profile
$$;

-- The payout window: open from the moment the last closed month's statement is approved until `request_days` after
-- that month ended (never less than three days after a late approval).
create or replace function public.vip_window(p_profile uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.vip_members; p public.vip_programmes; lm public.vip_months; s public.vip_statements; om public.vip_months;
  v_close timestamptz;
begin
  select * into m from public.vip_members where profile_id = p_profile;
  if m is null then return jsonb_build_object('open', false); end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  select * into lm from public.vip_months where programme_id = p.id and status = 'closed' order by starts_at desc limit 1;
  select * into om from public.vip_months where programme_id = p.id and status in ('open', 'closing') order by starts_at desc limit 1;
  if lm.id is not null then
    select * into s from public.vip_statements where month_id = lm.id and profile_id = p_profile;
  end if;
  if s.id is not null and s.status = 'approved' then
    v_close := greatest(lm.ends_at + make_interval(days => p.request_days), s.approved_at + interval '3 days');
    if now() < v_close then
      return jsonb_build_object('open', true, 'opened_at', s.approved_at, 'closes_at', v_close,
        'year', lm.year, 'month', lm.month, 'next_at', om.ends_at);
    end if;
  end if;
  return jsonb_build_object('open', false,
    'waiting', lm.id is not null and s.id is not null and s.status = 'draft' and now() < lm.ends_at + make_interval(days => p.request_days),
    'next_at', coalesce(om.ends_at, lm.ends_at + interval '1 month'),
    'year', lm.year, 'month', lm.month);
end $$;

-- One member, one month: videos posted in it, the best single video's views counted in it, and whether that meets
-- the programme's rule (5 videos OR one video of 20,000+ views, by default).
create or replace function public.vip_req_check(p_profile uuid, p_month uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare mo public.vip_months; p public.vip_programmes; v_videos int; v_best bigint;
begin
  select * into mo from public.vip_months where id = p_month;
  select * into p from public.vip_programmes where id = mo.programme_id;
  select count(*) filter (where v.status = 'tracking'
           and coalesce(v.posted_at, v.submitted_at) >= mo.starts_at and coalesce(v.posted_at, v.submitted_at) < mo.ends_at)::int,
         coalesce(max(public.vip_video_counted(v, mo)), 0)
    into v_videos, v_best
    from public.vip_videos v where v.profile_id = p_profile and v.programme_id = mo.programme_id;
  return jsonb_build_object('videos', coalesce(v_videos, 0), 'best_views', coalesce(v_best, 0),
    'need_videos', p.req_videos, 'need_views', p.req_single_views, 'on', p.req_on,
    'met', not p.req_on or coalesce(v_videos, 0) >= p.req_videos or coalesce(v_best, 0) >= p.req_single_views,
    'by', case when coalesce(v_videos, 0) >= p.req_videos then 'videos' when coalesce(v_best, 0) >= p.req_single_views then 'views' end);
end $$;

-- Taking money out of the balance. Called by the creator's request and by the automatic payout; never directly.
create or replace function public.vip_pay_out(p_profile uuid, p_kind text, p_auto boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.vip_members; p public.vip_programmes; v_bal numeric; v_reward uuid; v_inv uuid; v_name text; v_label text;
begin
  perform pg_advisory_xact_lock(hashtext('vip_wallet:' || p_profile::text));
  select * into m from public.vip_members where profile_id = p_profile;
  if m is null then raise exception 'That creator is not a VIP.'; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  v_bal := public.vip_balance(p_profile);
  if v_bal <= 0 then raise exception 'There is nothing in the balance yet.'; end if;
  if p_kind = 'cash' then
    if v_bal < coalesce(p.min_payout, 0) then
      raise exception 'Cash payouts start at % %. Take it as a Tryp.com travel voucher instead, or let it keep growing.', p.currency, to_char(p.min_payout, 'FM999990');
    end if;
    if not public.vip_payment_ready(p_profile, p.currency) then
      raise exception 'Add your payment details in Settings first, then ask again.';
    end if;
    insert into public.rewards (creator_id, reward_type, amount, currency, status, community_id, source, payment_notes)
    values (p_profile, 'cash', v_bal, p.currency, 'pending', p.community_id, 'vip',
            'VIP balance paid out: ' || p.currency || ' ' || to_char(v_bal, 'FM999999990.00') || ' of views earnings.')
    returning id into v_reward;
    insert into public.vip_ledger (profile_id, programme_id, kind, amount, currency, reward_id, note, auto, created_by)
    values (p_profile, p.id, 'payout', -v_bal, p.currency, v_reward, case when p_auto then 'Paid automatically' else 'Cash payout' end, p_auto, auth.uid());
    select id into v_inv from public.invoices where reward_id = v_reward;
    if v_inv is not null then
      perform set_config('tryp.system_invoice', 'on', true);
      update public.invoices set stage = 'approved', status = 'approved', decided_at = now(), decided_by = auth.uid()
       where id = v_inv and stage = 'awaiting_approval';
      perform set_config('tryp.system_invoice', 'off', true);
    end if;
    v_label := 'cash payout';
  elsif p_kind = 'voucher' then
    insert into public.rewards (creator_id, reward_type, amount, currency, status, community_id, source, payment_notes)
    values (p_profile, 'voucher', v_bal, p.currency, 'pending', p.community_id, 'vip',
            'VIP balance as a Tryp.com travel voucher: ' || p.currency || ' ' || to_char(v_bal, 'FM999999990.00') || '.')
    returning id into v_reward;
    insert into public.vip_ledger (profile_id, programme_id, kind, amount, currency, reward_id, note, created_by)
    values (p_profile, p.id, 'voucher', -v_bal, p.currency, v_reward, 'Tryp.com travel voucher', auth.uid());
    v_label := 'Tryp.com travel voucher';
  else
    raise exception 'Unknown payout.';
  end if;

  select name into v_name from public.profiles where id = p_profile;
  insert into public.notifications (recipient_id, type, title, body, link)
  select mgr, 'vip', v_name || ' asked for a ' || v_label,
         p.name || ': ' || p.currency || ' ' || to_char(v_bal, 'FM999999990.00') ||
         case when p_kind = 'voucher' then '. Issue the voucher code on the Vouchers page.' else '. The invoice is approved and ready to pay.' end,
         '/vip?mode=tools&tab=wallets'
    from public.vip_manager_ids(p.id) mgr where mgr <> p_profile;
  perform public.notify_user(p_profile, 'vip',
    case when p_kind = 'voucher' then 'Your Tryp.com voucher is on its way' else 'Your VIP payout is on its way' end,
    p.currency || ' ' || to_char(v_bal, 'FM999999990.00') ||
      case when p_kind = 'voucher' then '. The team sends your voucher code shortly; it appears under Rewards.'
           else case when p_auto then ', paid automatically now that your balance reached the threshold.' else '. Your invoice is approved.' end end,
    '/vip?tab=payouts');
  return jsonb_build_object('reward_id', v_reward, 'amount', v_bal, 'kind', p_kind);
end $$;

-- ---------------------------------------------------------------- the creator's side
create or replace function public.vip_my_wallet()
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.vip_members; p public.vip_programmes; mo public.vip_months; v_who uuid := public.vip_who();
  v_views bigint; v_live numeric; v_cap numeric; v_entries jsonb; v_history jsonb;
begin
  select * into m from public.vip_members where profile_id = v_who;
  if m is null then return null; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  mo := public.vip_ensure_month(p.id);
  select s.views into v_views from public.vip_month_stats(mo.id) s where s.profile_id = v_who;
  v_live := public.vip_views_pay(coalesce(v_views, 0), coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end);
  v_cap := coalesce(m.monthly_cap, p.monthly_cap);
  if v_cap is not null and v_live > v_cap then v_live := v_cap; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id, 'kind', l.kind, 'amount', l.amount, 'currency', l.currency, 'note', l.note, 'auto', l.auto,
      'at', l.created_at, 'year', mm.year, 'month', mm.month,
      'reward_status', r.status, 'voucher_code', r.voucher_code, 'invoice_stage', i.stage, 'invoice_number', i.number,
      'invoice_id', i.id, 'paid_at', i.paid_at) order by l.created_at desc), '[]'::jsonb)
    into v_entries
    from public.vip_ledger l
    left join public.vip_months mm on mm.id = l.month_id
    left join public.rewards r on r.id = l.reward_id
    left join public.invoices i on i.reward_id = l.reward_id
   where l.profile_id = v_who;

  -- Month by month, for the "CPM panel": views, the rate and what it earned (statements), newest first.
  select coalesce(jsonb_agg(jsonb_build_object('year', mm.year, 'month', mm.month, 'views', s.views, 'videos', s.videos,
      'cpm', s.cpm, 'earned', s.total, 'status', s.status) order by mm.starts_at desc), '[]'::jsonb)
    into v_history
    from public.vip_statements s join public.vip_months mm on mm.id = s.month_id
   where s.profile_id = v_who and s.status <> 'void';

  return jsonb_build_object(
    'balance', public.vip_balance(v_who),
    'currency', p.currency,
    'threshold', coalesce(p.min_payout, 0),
    'payment_ready', public.vip_payment_ready(v_who, p.currency),
    'auto_payout', m.auto_payout,
    'window', public.vip_window(v_who),
    'this_month', jsonb_build_object('year', mo.year, 'month', mo.month, 'earned', v_live, 'views', coalesce(v_views, 0),
        'ends_at', mo.ends_at, 'cpm', coalesce(m.cpm, p.cpm)),
    'requirement', public.vip_req_check(v_who, mo.id),
    'entries', v_entries,
    'history', v_history,
    'lifetime_earned', (select coalesce(sum(amount), 0) from public.vip_ledger where profile_id = v_who and kind in ('earned', 'adjust')),
    'lifetime_paid', (select coalesce(-sum(amount), 0) from public.vip_ledger where profile_id = v_who and kind in ('payout', 'voucher')));
end $$;

create or replace function public.vip_request_payout(p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w jsonb;
begin
  if nullif(current_setting('vip.preview_as', true), '') is not null then raise exception 'A preview cannot ask for money.'; end if;
  if not exists (select 1 from public.vip_members where profile_id = auth.uid()) then raise exception 'Only a VIP can ask for a payout.'; end if;
  w := public.vip_window(auth.uid());
  if not coalesce((w ->> 'open')::boolean, false) then
    raise exception 'Payouts open at the end of each month, once your statement is approved.';
  end if;
  return public.vip_pay_out(auth.uid(), p_kind, false);
end $$;

create or replace function public.vip_set_auto_payout(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.vip_members set auto_payout = coalesce(p_on, false) where profile_id = auth.uid();
  if not found then raise exception 'Only a VIP can change this.'; end if;
end $$;

-- ---------------------------------------------------------------- the team's side
create or replace function public.vip_wallets(p_programme uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.vip_programmes;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Only the VIP team can see this.'; end if;
  select * into p from public.vip_programmes where id = p_programme;
  return jsonb_build_object(
    'threshold', p.min_payout, 'currency', p.currency, 'request_days', p.request_days,
    'rows', coalesce((
      select jsonb_agg(x order by (x ->> 'balance')::numeric desc, x ->> 'name') from (
        select jsonb_build_object(
          'profile_id', m.profile_id, 'name', pf.name, 'photo_url', pf.photo_url, 'status', m.status,
          'balance', public.vip_balance(m.profile_id), 'auto_payout', m.auto_payout,
          'payment_ready', public.vip_payment_ready(m.profile_id, p.currency),
          'window', public.vip_window(m.profile_id),
          'earned', (select coalesce(sum(amount), 0) from public.vip_ledger l where l.profile_id = m.profile_id and l.kind in ('earned', 'adjust')),
          'paid', (select coalesce(-sum(amount), 0) from public.vip_ledger l where l.profile_id = m.profile_id and l.kind = 'payout'),
          'vouchers', (select coalesce(-sum(amount), 0) from public.vip_ledger l where l.profile_id = m.profile_id and l.kind = 'voucher'),
          'last', (select jsonb_build_object('kind', l.kind, 'amount', -l.amount, 'at', l.created_at, 'auto', l.auto,
                      'reward_status', r.status, 'voucher_code', r.voucher_code, 'invoice_stage', i.stage)
                     from public.vip_ledger l left join public.rewards r on r.id = l.reward_id
                     left join public.invoices i on i.reward_id = l.reward_id
                    where l.profile_id = m.profile_id and l.kind in ('payout', 'voucher') order by l.created_at desc limit 1)) x
          from public.vip_members m join public.profiles pf on pf.id = m.profile_id
         where m.programme_id = p_programme and not public.vip_hidden_profile(m.profile_id)) z), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', pf.name, 'photo_url', pf.photo_url, 'profile_id', l.profile_id,
          'kind', l.kind, 'amount', -l.amount, 'at', l.created_at, 'auto', l.auto, 'reward_id', l.reward_id,
          'reward_status', r.status, 'voucher_code', r.voucher_code, 'invoice_stage', i.stage, 'invoice_number', i.number)
          order by l.created_at desc)
        from public.vip_ledger l join public.profiles pf on pf.id = l.profile_id
        left join public.rewards r on r.id = l.reward_id
        left join public.invoices i on i.reward_id = l.reward_id
       where l.programme_id = p_programme and l.kind in ('payout', 'voucher') and l.created_at > now() - interval '120 days'), '[]'::jsonb));
end $$;

-- A manager's correction to a balance (a goodwill top-up, a mistake put right), written down with a reason.
create or replace function public.vip_adjust_balance(p_profile uuid, p_amount numeric, p_note text)
returns numeric language plpgsql security definer set search_path = public as $$
declare m public.vip_members; p public.vip_programmes;
begin
  select * into m from public.vip_members where profile_id = p_profile;
  if m is null then raise exception 'That creator is not a VIP.'; end if;
  if not public.vip_can_manage(m.programme_id) then raise exception 'Only the market lead or the team can change a balance.'; end if;
  if coalesce(p_amount, 0) = 0 then raise exception 'Enter an amount.'; end if;
  if nullif(btrim(p_note), '') is null then raise exception 'Say why, so the creator and the team can see it.'; end if;
  if public.vip_balance(p_profile) + p_amount < 0 then raise exception 'That would take the balance below zero.'; end if;
  select * into p from public.vip_programmes where id = m.programme_id;
  insert into public.vip_ledger (profile_id, programme_id, kind, amount, currency, note, created_by)
  values (p_profile, p.id, 'adjust', round(p_amount, 2), p.currency, btrim(p_note), auth.uid());
  perform public.notify_user(p_profile, 'vip', 'Your VIP balance changed',
    case when p_amount > 0 then '+' else '' end || p.currency || ' ' || to_char(p_amount, 'FM999999990.00') || ': ' || btrim(p_note), '/vip?tab=payouts');
  return public.vip_balance(p_profile);
end $$;

-- The requirement list: this month live, or a closed month as it was written down at close.
create or replace function public.vip_requirements(p_programme uuid, p_month uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        'videos', r.videos, 'best_views', r.best_views, 'met', r.met, 'decision', r.decision, 'note', r.note,
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
          'videos', (c ->> 'videos')::int, 'best_views', (c ->> 'best_views')::bigint, 'met', (c ->> 'met')::boolean,
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
end $$;

create or replace function public.vip_record_requirements(p_month uuid)
returns int language plpgsql security definer set search_path = public as $$
declare mo public.vip_months; n int;
begin
  select * into mo from public.vip_months where id = p_month;
  if mo.id is null then return 0; end if;
  insert into public.vip_requirement_reviews (month_id, profile_id, programme_id, videos, best_views, met)
  select mo.id, m.profile_id, mo.programme_id, (c ->> 'videos')::int, (c ->> 'best_views')::bigint, (c ->> 'met')::boolean
    from public.vip_members m cross join lateral public.vip_req_check(m.profile_id, mo.id) c
   where m.programme_id = mo.programme_id and m.status = 'active'
     -- Somebody who joined in the last days of a month is not judged on it.
     and coalesce(m.joined_on, '1900-01-01'::date) <= (mo.starts_at at time zone 'UTC')::date + 3
  on conflict (month_id, profile_id) do update set videos = excluded.videos, best_views = excluded.best_views, met = excluded.met
    where public.vip_requirement_reviews.decision is null;
  select count(*) into n from public.vip_requirement_reviews where month_id = mo.id and not met;
  return n;
end $$;

create or replace function public.vip_requirement_decide(p_month uuid, p_profile uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
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
      'In ' || v_label || ' you did not reach ' || p.req_videos || ' videos or one video with ' ||
      to_char(p.req_single_views, 'FM999,999,999') || ' views. Reach it this month to keep your place.'
      || coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/vip');
  elsif p_decision = 'pause' then
    perform public.vip_update_member(p_profile, 'paused');
    perform public.notify_user(p_profile, 'vip', 'Your VIP place is paused',
      'You did not reach the monthly requirement in ' || v_label || '. Talk to your market lead to restart.'
      || coalesce(' ' || nullif(btrim(coalesce(p_note, '')), ''), ''), '/vip');
  elsif p_decision = 'remove' then
    perform public.vip_update_member(p_profile, 'left');
  end if;
end $$;

-- ---------------------------------------------------------------- the CPM sheet
create or replace function public.vip_cpm_sheet(p_programme uuid, p_months int default 12)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.vip_programmes; v_months jsonb; v_rows jsonb; v_hist jsonb;
begin
  if not public.vip_can_see(p_programme) then raise exception 'Only the VIP team can see this.'; end if;
  select * into p from public.vip_programmes where id = p_programme;

  create temporary table if not exists _sheet (profile_id uuid, name text, y int, m int, views bigint, earned numeric, cpm numeric, live boolean, hist boolean) on commit drop;
  truncate _sheet;

  -- Statements for closed months.
  insert into _sheet
  select s.profile_id, pf.name, mo.year, mo.month, s.views, s.total, s.cpm, false, false
    from public.vip_statements s join public.vip_months mo on mo.id = s.month_id join public.profiles pf on pf.id = s.profile_id
   where s.programme_id = p_programme and s.status <> 'void' and not public.vip_hidden_profile(s.profile_id);
  -- The open month, live.
  insert into _sheet
  select st.profile_id, pf.name, mo.year, mo.month, st.views,
         least(coalesce(m.monthly_cap, p.monthly_cap, 1e12), public.vip_views_pay(st.views, coalesce(m.cpm, p.cpm), coalesce(m.tiers, p.tiers), case when m.tiers is null then m.cpm end)),
         coalesce(m.cpm, p.cpm), true, false
    from public.vip_months mo cross join lateral public.vip_month_stats(mo.id) st
    join public.vip_members m on m.profile_id = st.profile_id and m.programme_id = p_programme
    join public.profiles pf on pf.id = st.profile_id
   where mo.programme_id = p_programme and mo.status in ('open', 'closing') and not public.vip_hidden_profile(st.profile_id)
     and not exists (select 1 from public.vip_statements s where s.month_id = mo.id and s.profile_id = st.profile_id);
  -- Past months typed in.
  insert into _sheet
  select h.profile_id, coalesce(pf.name, h.name), h.year, h.month, h.views, h.earned, h.cpm, false, true
    from public.vip_sheet_history h left join public.profiles pf on pf.id = h.profile_id
   where h.programme_id = p_programme
     and not exists (select 1 from _sheet x where x.profile_id = h.profile_id and x.y = h.year and x.m = h.month);

  select coalesce(jsonb_agg(jsonb_build_object('year', y, 'month', m, 'views', v, 'earned', e, 'live', l) order by y desc, m desc), '[]'::jsonb)
    into v_months
    from (select y, m, sum(views) v, sum(earned) e, bool_or(live) l from _sheet group by y, m order by y desc, m desc limit greatest(1, least(p_months, 36))) z;

  select coalesce(jsonb_agg(r order by (r ->> 'earned')::numeric desc), '[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'profile_id', coalesce(sh.profile_id::text, null), 'name', sh.name,
      'cpm', coalesce((select coalesce(vm.cpm, p.cpm) from public.vip_members vm where vm.profile_id = sh.profile_id), max(sh.cpm)),
      'status', (select vm.status from public.vip_members vm where vm.profile_id = sh.profile_id),
      'views', sum(sh.views), 'earned', round(sum(sh.earned), 2),
      'balance', case when sh.profile_id is null then null else public.vip_balance(sh.profile_id) end,
      'cells', jsonb_object_agg(sh.y || '-' || lpad(sh.m::text, 2, '0'), jsonb_build_object('views', sh.views, 'earned', round(sh.earned, 2), 'live', sh.live, 'hist', sh.hist))) r
      from _sheet sh group by sh.profile_id, sh.name) q;

  return jsonb_build_object('currency', p.currency, 'cpm', p.cpm, 'months', v_months, 'rows', v_rows,
    'total_views', (select coalesce(sum(views), 0) from _sheet), 'total_earned', (select coalesce(round(sum(earned), 2), 0) from _sheet));
end $$;

-- Past months typed in by a manager: rows of {name, year, month, views, earned, cpm}. A name that matches a member of
-- this programme is linked to them; anybody else is kept by name.
create or replace function public.vip_import_history(p_programme uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; v_profile uuid;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the market lead or the team can add past months.'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if nullif(btrim(r ->> 'name'), '') is null then continue; end if;
    select m.profile_id into v_profile from public.vip_members m join public.profiles pf on pf.id = m.profile_id
     where m.programme_id = p_programme and (lower(pf.name) = lower(btrim(r ->> 'name')) or lower(split_part(pf.name, ' ', 1)) = lower(btrim(r ->> 'name')))
     order by lower(pf.name) = lower(btrim(r ->> 'name')) desc limit 1;
    insert into public.vip_sheet_history (programme_id, profile_id, name, year, month, views, earned, cpm, created_by)
    values (p_programme, v_profile, btrim(r ->> 'name'), (r ->> 'year')::int, (r ->> 'month')::int,
            greatest(0, coalesce((r ->> 'views')::bigint, 0)), coalesce((r ->> 'earned')::numeric, 0), nullif(r ->> 'cpm', '')::numeric, auth.uid())
    on conflict (programme_id, name, year, month) do update set views = excluded.views, earned = excluded.earned, cpm = excluded.cpm, profile_id = excluded.profile_id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.vip_clear_history(p_programme uuid, p_name text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the market lead or the team can do that.'; end if;
  delete from public.vip_sheet_history where programme_id = p_programme and (p_name is null or name = p_name);
  get diagnostics n = row_count;
  return n;
end $$;

-- Programme settings for the new rules (the existing settings tab writes the table for the rest).
create or replace function public.vip_set_rules(p_programme uuid, p_threshold numeric, p_request_days int, p_req_on boolean, p_req_videos int, p_req_views bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.vip_can_manage(p_programme) then raise exception 'Only the market lead or the team can change this.'; end if;
  update public.vip_programmes set
    min_payout = coalesce(p_threshold, min_payout),
    request_days = coalesce(p_request_days, request_days),
    req_on = coalesce(p_req_on, req_on),
    req_videos = coalesce(p_req_videos, req_videos),
    req_single_views = coalesce(p_req_views, req_single_views)
  where id = p_programme;
end $$;

-- ---------------------------------------------------------------- nudges (daily)
create or replace function public.vip_requirement_nudges()
returns jsonb language plpgsql security definer set search_path = public as $$
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
           ' to go, or one video with ' || to_char(req_single_views, 'FM999,999,999') || ' views. ' ||
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
end $$;

-- ---------------------------------------------------------------- rewrites of existing functions
-- 1. Statements no longer roll over below a minimum: the balance does that now. Text-replaced so nothing else in the
--    function is retyped.
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.vip_compute_statements(uuid)'::regprocedure) into d;
  n := replace(d,
$a$    v_roll_in := coalesce(v_roll_in, 0);

    v_total := round(v_base + v_cash + v_adj_sum + v_roll_in, 2);
    v_roll_out := 0;
    if v_total < p.min_payout then
      v_roll_out := greatest(v_total, 0);
      v_total := 0;
    end if;$a$,
$b$    -- THE BALANCE CARRIES MONEY FORWARD NOW (migration 312), so a statement is what the month earned, in full.
    v_roll_in := 0;
    v_total := round(v_base + v_cash + v_adj_sum, 2);
    v_roll_out := 0;$b$);
  assert n <> d, 'vip_compute_statements: rollover block not found';
  n := replace(n,
$a$    if v_views = 0 then v_flags := v_flags || '"no_views"'::jsonb; end if;$a$,
$b$    if v_views = 0 then v_flags := v_flags || '"no_views"'::jsonb; end if;
    if mem.status = 'active' and not coalesce((public.vip_req_check(mem.profile_id, p_month) ->> 'met')::boolean, true) then
      v_flags := v_flags || '"missed_requirement"'::jsonb;
    end if;$b$);
  assert position('missed_requirement' in n) > 0, 'vip_compute_statements: flags anchor not found';
  execute n;
end $$;

-- 2. Approving a statement credits the balance (and pays out automatically for anybody who asked for that).
create or replace function public.vip_approve_statement(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.vip_statements; p public.vip_programmes; m public.vip_months; mem public.vip_members;
  v_b jsonb; v_vouch uuid[] := '{}'; v_id uuid; v_month text; v_bal numeric; v_auto jsonb; v_close timestamptz;
begin
  select * into s from public.vip_statements where id = p_id for update;
  if s is null then raise exception 'No such statement.'; end if;
  if not public.vip_can_manage(s.programme_id) then raise exception 'Only the market lead or the team can approve a statement.'; end if;
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
end $$;

-- 3. An invoice raised late (bank details added after a payout was asked for) is approved by itself, as it was for
--    statements.
create or replace function public.vip_invoice_follows_statement()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.vip_statements; l public.vip_ledger;
begin
  if new.reward_id is null then return new; end if;
  select * into l from public.vip_ledger where reward_id = new.reward_id and kind = 'payout' limit 1;
  if l.id is not null then
    if new.stage = 'awaiting_approval' then
      perform set_config('tryp.system_invoice', 'on', true);
      update public.invoices set stage = 'approved', status = 'approved', decided_at = now(), decided_by = l.created_by where id = new.id;
      perform set_config('tryp.system_invoice', 'off', true);
    end if;
    return new;
  end if;
  select * into s from public.vip_statements where reward_id = new.reward_id and status = 'approved';
  if s is null then return new; end if;
  update public.vip_statements set invoice_id = new.id where id = s.id;
  if new.stage = 'awaiting_approval' then
    perform set_config('tryp.system_invoice', 'on', true);
    update public.invoices set stage = 'approved', status = 'approved', decided_at = now(), decided_by = s.approved_by where id = new.id;
    perform set_config('tryp.system_invoice', 'off', true);
  end if;
  return new;
end $$;

-- 4. Month close writes the requirement list down and tells the team who missed it.
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.vip_close_due()'::regprocedure) into d;
  n := replace(d,
$a$    v_n := public.vip_compute_statements(m.id);$a$,
$b$    v_n := public.vip_compute_statements(m.id);
    v_missed := public.vip_record_requirements(m.id);
    if v_missed > 0 then
      insert into public.notifications (recipient_id, type, title, body, link)
      select mgr, 'vip', v_missed || ' VIP' || case when v_missed = 1 then '' else 's' end || ' missed the monthly requirement',
             to_char(make_date(m.year, m.month, 1), 'FMMonth YYYY') || ': keep, warn, pause or remove them.',
             '/vip?mode=tools&tab=requirements'
        from public.vip_manager_ids(m.programme_id) mgr;
    end if;$b$);
  assert n <> d, 'vip_close_due: anchor not found';
  n := replace(n, 'declare p record; m record; v_closed int := 0; v_synced int := 0; v_n int;',
                  'declare p record; m record; v_closed int := 0; v_synced int := 0; v_n int; v_missed int;');
  assert position('v_missed int' in n) > 0, 'vip_close_due: declare anchor not found';
  n := replace(n, '''/admin/vip?tab=close''', '''/vip?mode=tools&tab=close''');
  execute n;
end $$;

-- 5. The preview reads the wallet too.
create or replace function public.vip_preview(p_who uuid, p_what text, p_days integer default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prog uuid; r jsonb;
begin
  if p_what not in ('overview', 'statements', 'trends', 'perks', 'board', 'wallet') then raise exception 'Unknown preview.'; end if;
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
    when 'wallet' then public.vip_my_wallet()
    else null end;
  perform set_config('vip.preview_as', '', true);
  return r;
end $$;

-- 6. The owner gives (or takes) VIP team access from the team page; the notification points at the VIP page now.
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.vip_add_manager(uuid,uuid)'::regprocedure) into d;
  n := replace(d, '''/admin/vip''', '''/vip?mode=tools''');
  n := replace(n, '''Members, bonuses, month-end payouts and numbers are in the VIP tools.''',
                  '''Open the VIP page: the community as creators see it, plus the VIP tools for members, payouts and numbers.''');
  execute n;
end $$;

-- ---------------------------------------------------------------- the daily job
select cron.unschedule('vip-requirements') where exists (select 1 from cron.job where jobname = 'vip-requirements');
select cron.schedule('vip-requirements', '20 9 * * *', 'select public.vip_requirement_nudges()');

-- ---------------------------------------------------------------- QA access (Ethan, 2 Oct 2026: "Give the QA admin
-- account VIP access, so you can properly test everything with it.") qa-admin is the sandboxed demo login, so anything
-- that moves money (rewards, invoices) still answers SANDBOX_READ_ONLY; it can see and run the VIP tools.
insert into public.vip_managers (profile_id, programme_id, added_by)
select 'e1f0fe37-215c-429a-9752-166ae8433dc5'::uuid, p.id, null from public.vip_programmes p
 where exists (select 1 from public.profiles where id = 'e1f0fe37-215c-429a-9752-166ae8433dc5')
on conflict do nothing;
