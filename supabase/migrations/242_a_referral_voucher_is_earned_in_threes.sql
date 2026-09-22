-- 242: A REFERRAL VOUCHER IS EARNED IN THREES (22 Sep 2026).
--
-- THE BUG. Ethan: "1 girl Noemi referred someone and they joined and it now
-- says she is owed a £10 tryp.com voucher under rewards, which makes no sense."
--
-- The programme, as the Refer page has always told creators, is: every THREE
-- creators you bring in who sign up, get ACCEPTED and POST in a challenge earn
-- you ONE voucher. `mint_referral_reward` (a trigger on submissions, never in
-- this repo - see migrations/README) paid a voucher for EVERY SINGLE referral on
-- that referral's first video, in whatever `app_settings.referral_reward` said
-- (GBP 10, left over from the UK days). So the first person to reach the stage
-- was paid three times too early, in the wrong currency, for the wrong amount.
--
-- THE MODEL NOW.
--   * A referral QUALIFIES when the referred creator is accepted (status active
--     or muted), is not a test account, is not the referrer, and has at least
--     one challenge submission. Exactly what lib/referrals `counted` shows.
--   * Every `per` (3) qualifying referrals earn one voucher of `amount`
--     `currency` (EUR 20, what the page promises). Settings live in
--     app_settings.referral_reward so the number is never in two places.
--   * `sync_referral_rewards(referrer)` is the ONE bookkeeper. It counts, and
--     tops the referrer's referral vouchers UP to floor(qualifying / per). It
--     never deletes: a voucher already owed stays owed.
--   * Each voucher row is keyed on the referral that COMPLETED its three
--     (`referred_creator_id`), so the existing unique index
--     `rewards_one_per_referral` still makes a double payment impossible.
--   * It runs on a submission (first video) AND on a profile becoming active
--     (accepted after they had already posted, or re-activated), and tells the
--     referrer where they are: "1 of 3", "2 of 3", or "you've earned it".

update public.app_settings
   set value = jsonb_build_object('label', 'Tryp.com voucher', 'amount', 20, 'currency', 'EUR', 'per', 3)
 where key = 'referral_reward';

insert into public.app_settings (key, value)
select 'referral_reward', jsonb_build_object('label', 'Tryp.com voucher', 'amount', 20, 'currency', 'EUR', 'per', 3)
where not exists (select 1 from public.app_settings where key = 'referral_reward');

-- The referrals that count, in the order they came to count (first video).
create or replace function public.qualifying_referrals(p_referrer uuid)
returns table (creator_id uuid, name text, qualified_at timestamptz)
language sql stable security definer set search_path = public as $$
  select q.id, q.name, min(s.submitted_at)
    from public.profiles q
    join public.submissions s on s.creator_id = q.id
   where q.referred_by = p_referrer
     and q.id <> p_referrer
     and q.status in ('active', 'muted')
     and coalesce(q.is_test, false) = false
   group by q.id, q.name
   order by min(s.submitted_at), q.id
$$;
revoke all on function public.qualifying_referrals(uuid) from public, anon, authenticated;

create or replace function public.sync_referral_rewards(p_referrer uuid, p_notify boolean default true)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_cfg      jsonb;
  v_amount   numeric;
  v_currency text;
  v_label    text;
  v_per      int;
  v_list     uuid[];
  v_names    text[];
  v_n        int;
  v_owed     int;
  v_have     int;
  v_minted   int := 0;
  i          int;
begin
  if p_referrer is null then return 0; end if;

  select value into v_cfg from public.app_settings where key = 'referral_reward';
  v_amount   := coalesce((v_cfg ->> 'amount')::numeric, 20);
  v_currency := coalesce(v_cfg ->> 'currency', 'EUR');
  v_label    := coalesce(v_cfg ->> 'label', 'Tryp.com voucher');
  v_per      := greatest(coalesce((v_cfg ->> 'per')::int, 3), 1);

  select array_agg(creator_id order by qualified_at, creator_id),
         array_agg(name order by qualified_at, creator_id)
    into v_list, v_names
    from public.qualifying_referrals(p_referrer);
  v_n := coalesce(array_length(v_list, 1), 0);
  v_owed := v_n / v_per;

  select count(*) into v_have
    from public.rewards where creator_id = p_referrer and source = 'referral';

  -- Top up. Voucher k is completed by referral number k*per.
  i := v_have + 1;
  while i <= v_owed loop
    insert into public.rewards
      (creator_id, challenge_id, reward_type, amount, currency, status, source,
       referred_creator_id, payment_notes)
    values
      (p_referrer, null, 'voucher', v_amount, v_currency, 'pending', 'referral',
       v_list[i * v_per],
       format('Referral voucher: %s creators joined and posted (%s)', v_per,
              array_to_string(v_names[(i - 1) * v_per + 1 : i * v_per], ', ')))
    on conflict do nothing;
    if found then v_minted := v_minted + 1; end if;
    i := i + 1;
  end loop;

  if p_notify and v_minted > 0 then
    perform public.notify_user(
      p_referrer, 'referral',
      'You earned a ' || v_label,
      format('%s creators you referred have joined and posted in a challenge. Your %s %s is on its way.',
             v_per, v_currency, trim(to_char(v_amount, 'FM999999990.##'))),
      '/refer');
  end if;

  return v_minted;
end;
$$;
revoke all on function public.sync_referral_rewards(uuid, boolean) from public, anon, authenticated;

-- ON A SUBMISSION: only the referred creator's FIRST video changes anything.
create or replace function public.mint_referral_reward()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_referrer uuid;
  v_name     text;
  v_status   text;
  v_test     boolean;
  v_cfg      jsonb;
  v_per      int;
  v_n        int;
  v_minted   int;
begin
  select referred_by, name, status, coalesce(is_test, false)
    into v_referrer, v_name, v_status, v_test
    from public.profiles where id = new.creator_id;
  if v_referrer is null or v_referrer = new.creator_id or v_test then return new; end if;
  if exists (select 1 from public.submissions where creator_id = new.creator_id and id <> new.id) then
    return new;
  end if;
  if v_status not in ('active', 'muted') then return new; end if;

  v_minted := public.sync_referral_rewards(v_referrer, true);

  -- Not a voucher yet: say how close they are, so the count is visible at the
  -- moment it moves rather than discovered on the Refer page later.
  if v_minted = 0 then
    select value into v_cfg from public.app_settings where key = 'referral_reward';
    v_per := greatest(coalesce((v_cfg ->> 'per')::int, 3), 1);
    select count(*) into v_n from public.qualifying_referrals(v_referrer);
    perform public.notify_user(
      v_referrer, 'referral',
      'Your referral counts',
      format('%s posted their first challenge video. That is %s of %s towards your next voucher.',
             coalesce(v_name, 'Someone you referred'), ((v_n - 1) % v_per) + 1, v_per),
      '/refer');
  end if;
  return new;
end;
$$;

-- ON ACCEPTANCE: somebody who posted before being accepted (or was re-activated)
-- starts counting the moment their status turns active.
create or replace function public.referral_on_profile_active()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is not null
     and new.status in ('active', 'muted')
     and old.status is distinct from new.status
     and old.status not in ('active', 'muted')
     and exists (select 1 from public.submissions where creator_id = new.id) then
    perform public.sync_referral_rewards(new.referred_by, true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_referral_on_profile_active on public.profiles;
create trigger trg_referral_on_profile_active
  after update of status on public.profiles
  for each row execute function public.referral_on_profile_active();

-- THE ONE-OFF CORRECTION. Every PENDING referral voucher minted under the old
-- one-per-referral rule is withdrawn, then every referrer is re-synced under the
-- new rule without notifications (nobody should be pinged about a correction).
-- Paid (distributed) ones are history and are never touched. On 22 Sep 2026
-- this was exactly one row: Noemi's GBP 10 for a single referral.
delete from public.rewards
 where source = 'referral' and status = 'pending' and distributed_at is null
   and not exists (select 1 from public.invoices i where i.reward_id = rewards.id);

select public.sync_referral_rewards(r.referred_by, false)
  from (select distinct referred_by from public.profiles where referred_by is not null) r;

-- The Refer page reads the terms (amount, currency, per) so the promise on the
-- page and the payout are one number. Public read, like the tour flag.
drop policy if exists "app_settings: read public flags" on public.app_settings;
create policy "app_settings: read public flags" on public.app_settings
  for select to authenticated
  using (key = any (array['tour_enabled', 'referral_reward']));
