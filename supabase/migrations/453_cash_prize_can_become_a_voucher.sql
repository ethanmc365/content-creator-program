-- 453: A CASH PRIZE CAN BECOME A TRIP.COM VOUCHER, WORTH A LITTLE MORE (22 Oct 2026, Ethan).
--
-- THE CASE: Evelin Salinas came 8th in the Global Challenge (EUR 30 cash). The team issued her a voucher instead, but the
-- cash row stayed "to pay" and the only button on it was "Mark distributed", which would have told her she got both.
--
-- THE RULE: every challenge cash prize can be swapped by the creator for a voucher worth the cash PLUS A BONUS, so that
-- the voucher is the better deal and the money stays inside Tryp.com / trip.com. The bonus is a TIER TABLE the team edits
-- (app_settings 'voucher_choice_bonus'): the bonus of the highest tier whose "from" is at or below the cash amount.
--   from 0   -> +5        (EUR 30 becomes 35, EUR 40 becomes 45)
--   from 100 -> +10       (EUR 100 becomes 110)
-- Same currency as the cash. The team can also convert any pending cash prize BY HAND at any value (admin_convert_...).
--
-- HOW A CONVERSION WORKS: the unpaid cash row is replaced by a new PENDING voucher row (so the existing "Needs a code"
-- flow, the team alert on a new voucher and the wallet all apply untouched). The cash row is DELETED rather than flagged:
-- no total, chart, spend figure or "still to pay" list anywhere needs a new status, and the delete is in the audit log.
-- The voucher keeps the whole old row in `converted_from` so the story is on the row itself.
-- A draft invoice already raised for the cash is deleted with it; an invoice that is APPROVED, SENT or PAID blocks the
-- swap (the money is on its way: the team deletes the invoice first if they want to).

alter table public.rewards add column if not exists converted_from jsonb;
comment on column public.rewards.converted_from is
  'Set when this voucher replaced an unpaid cash prize: the cash reward row as it was, plus the bonus that was added.';

insert into public.app_settings (key, value) values
  ('voucher_choice_bonus', '{"enabled": true, "tiers": [{"from": 0, "bonus": 5}, {"from": 100, "bonus": 10}]}'::jsonb)
on conflict (key) do nothing;

-- INTERNAL: the bonus for a cash amount (0 when switched off or no tier matches).
create or replace function public.voucher_choice_bonus(p_amount numeric)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((
    select (t->>'bonus')::numeric
      from public.app_settings s, jsonb_array_elements(coalesce(s.value->'tiers', '[]'::jsonb)) t
     where s.key = 'voucher_choice_bonus'
       and coalesce((s.value->>'enabled')::boolean, true)
       and (t->>'from')::numeric <= p_amount
     order by (t->>'from')::numeric desc
     limit 1
  ), 0)
$$;

-- INTERNAL: the swap itself. p_amount null = cash + tier bonus.
create or replace function public.convert_reward_to_voucher_internal(p_reward uuid, p_amount numeric, p_by_admin boolean)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.rewards%rowtype;
  v_bonus numeric;
  v_amount numeric;
  v_new uuid;
  v_note text;
begin
  select * into r from public.rewards where id = p_reward for update;
  if not found then raise exception 'That prize no longer exists.'; end if;
  if r.reward_type <> 'cash' or r.status <> 'pending' then
    raise exception 'Only a cash prize that has not been paid yet can become a voucher.';
  end if;
  if not p_by_admin and (r.source <> 'challenge' or r.challenge_id is null) then
    raise exception 'Only challenge prizes can be swapped for a voucher.';
  end if;
  if exists (select 1 from public.invoices where reward_id = r.id and stage in ('approved', 'sent', 'paid')) then
    raise exception 'This prize already has an invoice that is approved or sent. Delete that invoice first, then convert.';
  end if;

  v_bonus := public.voucher_choice_bonus(r.amount);
  v_amount := coalesce(p_amount, r.amount + v_bonus);
  if v_amount <= 0 then raise exception 'The voucher needs a value.'; end if;

  v_note := coalesce(nullif(btrim(r.payment_notes), ''), 'Prize')
    || ' (voucher instead of ' || r.currency || ' ' || to_char(r.amount, 'FM999999990.00') || ' cash)';

  delete from public.invoices where reward_id = r.id and stage in ('draft', 'awaiting_approval', 'rejected');
  -- The cash row goes FIRST: one prize slot per creator per challenge is a unique index (rewards_challenge_creator_slot_uniq).
  delete from public.rewards where id = r.id;

  insert into public.rewards (creator_id, challenge_id, community_id, reward_type, amount, currency, status,
                              payment_notes, source, referred_creator_id, milestone_id, prize_slot, converted_from)
  values (r.creator_id, r.challenge_id, r.community_id, 'voucher', v_amount, r.currency, 'pending',
          v_note, r.source, r.referred_creator_id, r.milestone_id, r.prize_slot,
          to_jsonb(r) || jsonb_build_object('bonus', v_amount - r.amount, 'by_admin', p_by_admin, 'converted_at', now()))
  returning id into v_new;
  return v_new;
end $$;

-- CREATOR: what they can swap right now, with the voucher value worked out (so the app never reads the tiers).
create or replace function public.my_voucher_offers()
returns table (reward_id uuid, challenge_id uuid, challenge_title text, note text,
               cash_amount numeric, voucher_amount numeric, bonus numeric, currency text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.id, r.challenge_id, c.title, r.payment_notes,
         r.amount, r.amount + public.voucher_choice_bonus(r.amount), public.voucher_choice_bonus(r.amount),
         r.currency, r.created_at
    from public.rewards r
    left join public.challenges c on c.id = r.challenge_id
   where r.creator_id = auth.uid()
     and r.reward_type = 'cash' and r.status = 'pending'
     and r.source = 'challenge' and r.challenge_id is not null
     and r.amount > 0
     and coalesce((select (s.value->>'enabled')::boolean from public.app_settings s where s.key = 'voucher_choice_bonus'), true)
     and not exists (select 1 from public.invoices i where i.reward_id = r.id and i.stage in ('approved', 'sent', 'paid'))
   order by r.created_at
$$;

-- CREATOR: take the voucher. The value is always worked out here, never trusted from the app.
create or replace function public.convert_reward_to_voucher(p_reward uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.my_voucher_offers() o where o.reward_id = p_reward) then
    raise exception 'That prize cannot be swapped for a voucher.';
  end if;
  return public.convert_reward_to_voucher_internal(p_reward, null, false);
end $$;

-- TEAM: convert any unpaid cash prize, at the standard value or at a value of their choosing.
create or replace function public.admin_convert_reward_to_voucher(p_reward uuid, p_amount numeric default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_new uuid; v_creator uuid;
begin
  if not public.is_admin() then raise exception 'Only the team can do this.'; end if;
  v_new := public.convert_reward_to_voucher_internal(p_reward, p_amount, true);
  select creator_id into v_creator from public.rewards where id = v_new;
  perform public.notify_user(v_creator, 'reward', 'Your prize is now a voucher',
    'Your cash prize has been swapped for a Tryp.com voucher. The team is preparing the code and it will appear in your wallet.',
    '/rewards');
  return v_new;
end $$;

revoke all on function public.my_voucher_offers() from public, anon;
revoke all on function public.convert_reward_to_voucher(uuid) from public, anon;
revoke all on function public.admin_convert_reward_to_voucher(uuid, numeric) from public, anon;
grant execute on function public.my_voucher_offers() to authenticated;
grant execute on function public.convert_reward_to_voucher(uuid) to authenticated;
grant execute on function public.admin_convert_reward_to_voucher(uuid, numeric) to authenticated;

insert into public.owner_only_rpcs (proname, why) values
  ('voucher_choice_bonus', 'internal: reads the bonus tiers'),
  ('convert_reward_to_voucher_internal', 'internal: swaps any cash prize with no caller check')
on conflict do nothing;
select public.lock_down_definer_functions();

-- EVELIN SALINAS, 8th in the Global Challenge: she holds the EUR 80 voucher (code issued), so the EUR 30 cash row that
-- was still "to pay" goes. The voucher keeps a record of it. Guarded by id and by what the rows must still look like.
do $m$
declare
  v_cash public.rewards%rowtype;
begin
  select * into v_cash from public.rewards
   where id = 'd4303066-a202-43cd-a6b2-bc52c1643f80'
     and creator_id = 'd7007ec7-1897-4d68-afbd-9220c107a919'
     and reward_type = 'cash' and status = 'pending';
  if found then
    if not exists (select 1 from public.rewards where id = 'bcd4800a-eea5-4e49-adc0-692d4b5dc7ab'
                      and creator_id = v_cash.creator_id and reward_type = 'voucher' and status = 'distributed') then
      raise exception 'Evelin''s voucher is not as expected; not touching her cash row';
    end if;
    delete from public.invoices where reward_id = v_cash.id and stage in ('draft', 'awaiting_approval', 'rejected');
    update public.rewards
       set converted_from = to_jsonb(v_cash) || jsonb_build_object('by_admin', true, 'converted_at', now(), 'note', 'voucher issued by hand and combined with her earlier voucher')
     where id = 'bcd4800a-eea5-4e49-adc0-692d4b5dc7ab';
    delete from public.rewards where id = v_cash.id;
  end if;
end $m$;
