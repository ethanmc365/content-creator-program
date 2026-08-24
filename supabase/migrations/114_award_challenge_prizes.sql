-- 114  THE PRIZES AWARD THEMSELVES
--
-- WHAT WAS ACTUALLY BROKEN. Migration 091 automated the invoice: a cash reward
-- row MAKES its draft invoice, filled in, and the admin's job shrinks to reading
-- it and pressing send. That works. What nobody had written was the step before
-- it - NOTHING EVER CREATED THE REWARD ROW. A challenge could end, be scored,
-- have its winners published to 43 people's challenge board, and produce no
-- payable at all. The chain simply started one link too late, and because the
-- missing link was an absence rather than a failure there was nothing to show:
-- no error, no empty queue with a warning, no unpaid flag. Silence.
--
--   published winners -> (nothing) -> no rewards -> no invoices -> nobody paid
--
-- Measured on the live data before writing this: `Tryp.com Creative Challenge`
-- ended 20 Aug, winners published 24 Aug, ten ranked results, a three-place
-- cash structure (£105/£55/£30) and a £10 voucher for everyone with three
-- entries. rewards: 0 rows. invoices: 0 rows. In the whole database, for every
-- challenge ever run.
--
-- Publishing the winners is the moment the result becomes official - it is when
-- the money is decided, so it is when the money is recorded. The trigger below
-- awards on that transition, and `award_challenge_prizes` is the same work as an
-- RPC so it can be previewed, re-run, and used to catch up the challenges that
-- already ended.

-- ------------------------------------------------------- reading the prize
--
-- Prizes are prose: `prize_structure` is [{"place":"1st","prize":"£105 cash"}]
-- and the participation prize is a sentence like "£10 Tryp.com voucher". The
-- FIRST number in the string is the amount - stripping every non-digit instead
-- would read "£10 Tryp.com voucher" as "10." and "£10 + £5" as 105.
--
-- THE NUMBER IS ONE CAPTURE AND THE DECIMALS ARE NON-CAPTURING. `regexp_match`
-- returns the capture GROUPS when a pattern has any, not the whole match, so
-- '[0-9]+(\.[0-9]+)?' hands back the optional decimal group - null for "£105
-- cash" - and every prize on the platform read as £0. Caught by the dry run
-- before a single row was written, which is what the dry run is for.
create or replace function public.prize_amount_of(p_text text)
returns numeric language sql immutable as $$
  select coalesce(((regexp_match(coalesce(p_text, ''), '([0-9]+(?:\.[0-9]+)?)'))[1])::numeric, 0);
$$;

create or replace function public.prize_currency_of(p_text text, p_fallback text)
returns text language sql immutable as $$
  select case
    when coalesce(p_text, '') like '%£%' then 'GBP'
    when coalesce(p_text, '') like '%€%' then 'EUR'
    when coalesce(p_text, '') like '%$%' then 'USD'
    else coalesce(nullif(p_fallback, ''), 'GBP')
  end;
$$;

-- A voucher is a reward and is not a payable; cash is both. `rewards` allows
-- exactly these two, and the invoice trigger only fires on cash.
create or replace function public.prize_kind_of(p_text text)
returns text language sql immutable as $$
  select case when coalesce(p_text, '') ~* '(voucher|gift ?card|credit)' then 'voucher' else 'cash' end;
$$;

-- ONE REWARD PER CREATOR PER CHALLENGE PER KIND. Without this, publishing twice,
-- a double click, or the trigger and the button racing each other quietly makes
-- two payables for one prize - and 091's invoice trigger would faithfully draft
-- an invoice for each. A creator can hold both a cash prize and a participation
-- voucher for the same challenge, which is why the kind is part of the key.
create unique index if not exists rewards_challenge_creator_kind_uniq
  on public.rewards (challenge_id, creator_id, reward_type)
  where source = 'challenge' and challenge_id is not null;

-- --------------------------------------------------------------- the award
--
-- Returns a row per decision, always - including the ones it did NOT act on and
-- why. This function is the answer to "did anybody get paid", so it has to be
-- able to say "no, and here is who was missed".
create or replace function public.award_challenge_prizes_internal(
  p_challenge_id uuid, p_dry_run boolean default false
)
returns table (
  place text, creator_id uuid, creator_name text, reward_type text,
  amount numeric, currency text, outcome text, detail text
)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_ch      record;
  v_row     record;
  v_amount  numeric;
  v_cur     text;
  v_kind    text;
  v_exists  boolean;
begin
  select * into v_ch from public.challenges where id = p_challenge_id;
  if v_ch is null then raise exception 'No such challenge.'; end if;

  -- THE SAVED RESULTS, NOT THE LIVE STANDINGS. The board preview recomputes
  -- from the entries every time a view count changes; money follows the ranking
  -- that was actually published.
  if not exists (select 1 from public.results where challenge_id = p_challenge_id) then
    return query select null::text, null::uuid, null::text, null::text, null::numeric, null::text,
                        'blocked'::text, 'No leaderboard has been generated for this challenge.'::text;
    return;
  end if;

  -- ---- the places, in the order the prize structure lists them ----------
  for v_row in
    select p.ord::int as ord,
           coalesce(p.value ->> 'place', p.ord || '') as label,
           p.value ->> 'prize' as prize,
           r.creator_id as cid,
           pr.name as cname,
           coalesce(pr.is_test, false) as is_test
      from jsonb_array_elements(coalesce(v_ch.prize_structure, '[]'::jsonb)) with ordinality p(value, ord)
      left join public.results r on r.challenge_id = p_challenge_id and r.rank = p.ord
      left join public.profiles pr on pr.id = r.creator_id
     order by p.ord
  loop
    v_amount := public.prize_amount_of(v_row.prize);
    v_cur    := public.prize_currency_of(v_row.prize, v_ch.prize_currency);
    v_kind   := public.prize_kind_of(v_row.prize);

    if v_row.cid is null then
      return query select v_row.label, null::uuid, null::text, v_kind, v_amount, v_cur,
                          'skipped'::text, 'Nobody finished in this place.'::text;
      continue;
    end if;
    if v_amount <= 0 then
      return query select v_row.label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                          'skipped'::text, format('No amount could be read from "%s".', coalesce(v_row.prize, ''));
      continue;
    end if;
    -- A QA account is not owed money. They rank like anybody else so the
    -- leaderboard stays honest, and they are stopped here rather than there.
    if v_row.is_test then
      return query select v_row.label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                          'skipped'::text, 'Test account.'::text;
      continue;
    end if;

    select exists (
      select 1 from public.rewards
       where challenge_id = p_challenge_id and rewards.creator_id = v_row.cid
         and rewards.reward_type = v_kind and source = 'challenge'
    ) into v_exists;
    if v_exists then
      return query select v_row.label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                          'already awarded'::text, 'A reward for this place already exists.'::text;
      continue;
    end if;

    if not p_dry_run then
      insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                  status, payment_notes, community_id, source)
      values (v_row.cid, p_challenge_id, v_kind, v_amount, v_cur, 'pending',
              format('%s place - %s', v_row.label, v_ch.title), v_ch.community_id, 'challenge');
    end if;
    return query select v_row.label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                        case when p_dry_run then 'would create' else 'created' end::text,
                        case when v_kind = 'cash' then 'Draft invoice raised.' else 'Voucher to issue.' end::text;
  end loop;

  -- ---- the participation prize -----------------------------------------
  --
  -- EVERYONE who cleared the threshold, podium included. Placing first does not
  -- un-earn the prize for turning up, and the podium graphic says so out loud.
  if v_ch.participation_threshold is not null and coalesce(v_ch.participation_prize, '') <> '' then
    v_amount := public.prize_amount_of(v_ch.participation_prize);
    v_cur    := public.prize_currency_of(v_ch.participation_prize, v_ch.prize_currency);
    v_kind   := public.prize_kind_of(v_ch.participation_prize);

    for v_row in
      select s.creator_id as cid, pr.name as cname, count(*) as entries,
             coalesce(pr.is_test, false) as is_test
        from public.submissions s
        join public.profiles pr on pr.id = s.creator_id
       where s.challenge_id = p_challenge_id
       group by s.creator_id, pr.name, pr.is_test
      having count(*) >= v_ch.participation_threshold
       order by count(*) desc
    loop
      if v_amount <= 0 then
        return query select 'Participation'::text, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'skipped'::text, format('No amount could be read from "%s".', v_ch.participation_prize);
        continue;
      end if;
      if v_row.is_test then
        return query select 'Participation'::text, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'skipped'::text, 'Test account.'::text;
        continue;
      end if;

      select exists (
        select 1 from public.rewards
         where challenge_id = p_challenge_id and rewards.creator_id = v_row.cid
           and rewards.reward_type = v_kind and source = 'challenge'
      ) into v_exists;
      if v_exists then
        return query select 'Participation'::text, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'already awarded'::text,
                            format('%s already holds a %s reward for this challenge.', v_row.cname, v_kind);
        continue;
      end if;

      if not p_dry_run then
        insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                    status, payment_notes, community_id, source)
        values (v_row.cid, p_challenge_id, v_kind, v_amount, v_cur, 'pending',
                format('%s - %s (%s entries)', v_ch.participation_prize, v_ch.title, v_row.entries),
                v_ch.community_id, 'challenge');
      end if;
      return query select 'Participation'::text, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                          case when p_dry_run then 'would create' else 'created' end::text,
                          format('%s entries.', v_row.entries);
    end loop;
  end if;
end $$;

-- The callable version. The internal one exists so the trigger can run as the
-- system: publishing winners is a market admin's job, paying is not, and an
-- admin check inside the trigger would make the publish fail for them.
create or replace function public.award_challenge_prizes(
  p_challenge_id uuid, p_dry_run boolean default false
)
returns table (
  place text, creator_id uuid, creator_name text, reward_type text,
  amount numeric, currency text, outcome text, detail text
)
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_global_admin() then
    raise exception 'Only the team can award prizes.';
  end if;
  return query select * from public.award_challenge_prizes_internal(p_challenge_id, p_dry_run);
end $$;

revoke execute on function public.award_challenge_prizes_internal(uuid, boolean) from public;
revoke execute on function public.award_challenge_prizes(uuid, boolean) from public;
grant execute on function public.award_challenge_prizes(uuid, boolean) to authenticated;

-- ------------------------------------------------------------- the trigger
--
-- Fires when winners_published_at goes from nothing to something - the single
-- moment the result stops being a preview. Unpublishing and publishing again
-- re-runs it, which is safe: everything already awarded comes back as "already
-- awarded" and nothing is inserted twice.
create or replace function public.on_winners_published()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.winners_published_at is not null
     and (tg_op = 'INSERT' or old.winners_published_at is distinct from new.winners_published_at) then
    perform public.award_challenge_prizes_internal(new.id, false);
  end if;
  return new;
end $$;

drop trigger if exists trg_on_winners_published on public.challenges;
create trigger trg_on_winners_published
  after insert or update of winners_published_at on public.challenges
  for each row execute function public.on_winners_published();

-- ------------------------------------------- numbering a system's invoice
--
-- `next_invoice_number()` refuses anybody who is not an admin, which is right
-- for the composer and wrong for a trigger: when the prizes award themselves the
-- number is needed with nobody at a keyboard, and the whole publish failed with
-- "admins only" from four frames down. The gate stays; a transaction-local flag
-- that only `on_reward_draft_invoice` sets says "this one is ours". It cannot
-- outlive the statement that set it, and it grants nothing but an integer.
create or replace function public.next_invoice_number()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  if not public.is_admin() and coalesce(current_setting('tryp.system_invoice', true), '') <> 'on' then
    raise exception 'admins only';
  end if;
  perform pg_advisory_xact_lock(hashtext('tryp.invoice.number'));
  select coalesce(max(number), 0) + 1 into n from public.invoices;
  return n;
end $$;

-- 091's trigger, with the flag set around the one insert that needs it. The
-- body is otherwise unchanged.
create or replace function public.on_reward_draft_invoice()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_name   text;
  v_desc   text;
  v_bill   text;
  v_priv   record;
  v_pay    jsonb;
begin
  if new.reward_type is distinct from 'cash' or coalesce(new.amount, 0) <= 0 then
    return new;
  end if;
  if exists (select 1 from public.invoices where reward_id = new.id) then
    return new;
  end if;

  select name into v_name from public.profiles where id = new.creator_id;
  select coalesce('Prize for ' || title, 'Creator prize') into v_desc
    from public.challenges where id = new.challenge_id;
  v_desc := coalesce(v_desc, 'Creator prize');
  select coalesce(value ->> 'text', '') into v_bill
    from public.app_settings where key = 'invoice_bill_to';

  select * into v_priv from public.creator_private where id = new.creator_id;
  v_pay := jsonb_build_object(
    'currency',      coalesce(v_priv.pay_currency, new.currency, 'GBP'),
    'name',          coalesce(v_priv.pay_name, ''),
    'bank',          coalesce(v_priv.pay_bank, ''),
    'sortCode',      coalesce(v_priv.pay_sort_code, ''),
    'accountNumber', coalesce(v_priv.pay_account_number, ''),
    'iban',          coalesce(v_priv.pay_iban, ''),
    'bic',           coalesce(v_priv.pay_bic, ''),
    'address',       coalesce(v_priv.pay_address, '')
  );

  perform set_config('tryp.system_invoice', 'on', true);
  insert into public.invoices (
    number, reward_id, creator_id, creator_name, amount, currency, description,
    bill_to, payment, stage, status, auto_generated, community_id, created_by
  ) values (
    public.next_invoice_number(), new.id, new.creator_id, coalesce(v_name, 'Creator'),
    new.amount, coalesce(new.currency, 'GBP'), v_desc,
    coalesce(v_bill, ''), v_pay, 'draft', 'draft', true, new.community_id, auth.uid()
  );
  perform set_config('tryp.system_invoice', 'off', true);
  return new;
end $$;

notify pgrst, 'reload schema';
