-- TWO MONEY-PAGE FIXES (1 Oct 2026).
--
-- 1. A SENT INVOICE SETTLES ITSELF AFTER SEVEN DAYS.
--    Ethan: "the best way to do it is to automatically mark them as paid after 7 days ... Once
--    they're actually sent ... they can go down into the actual challenge location, so that only
--    at the top, the pending ones show up." A transfer that has been instructed is paid in all
--    but name within a week, and nobody goes back to press "paid" on it. So a daily job marks any
--    invoice that has sat at `sent` for seven days as paid, with `paid_at` = the seventh day (the
--    day it was deemed paid, not the day the job happened to run). The reward was already
--    `distributed` when the invoice was sent (`reward_follows_invoice`), so nothing else moves.
--    `mark_invoice_paid(id, false)` still reopens one if a payment bounces.
--
-- 2. VOUCHERS IN TWO CURRENCIES CAN BE COMBINED.
--    Ethan: "Take 2 or more to combine them. I take 2, but there is no option to combine them."
--    The two he ticked were Jacob Pulley's: a GBP voucher from the August challenge and a EUR
--    milestone voucher. The screen dropped the first tick the moment the second was in another
--    currency, and this function refused the pair outright. A combined voucher is one code worth
--    the total, and the programme settles in euros, so the total is the euro value (`fx_convert`,
--    the rate every invoice uses). Each row still keeps its own amount and currency, so what each
--    challenge paid out never changes.

create or replace function public.auto_settle_sent_invoices_internal()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  update public.invoices
     set stage = 'paid',
         status = 'paid',
         paid_at = sent_at + interval '7 days'
   where stage = 'sent'
     and sent_at is not null
     and sent_at <= now() - interval '7 days';
  get diagnostics v_n = row_count;

  -- Belt and braces: the reward follows the invoice when it is SENT, but an older row may have
  -- been sent before that trigger existed.
  update public.rewards r
     set status = 'distributed', distributed_at = coalesce(r.distributed_at, now())
    from public.invoices i
   where i.reward_id = r.id and i.stage = 'paid' and r.status <> 'distributed';
  return v_n;
end $function$;

revoke all on function public.auto_settle_sent_invoices_internal() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'auto-settle-invoices';
select cron.schedule('auto-settle-invoices', '40 6 * * *', 'select public.auto_settle_sent_invoices_internal()');

create or replace function public.admin_combine_vouchers(p_rewards uuid[], p_code text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_creator uuid;
  v_ccy text;
  v_total numeric;
  v_mixed boolean;
  v_group uuid := gen_random_uuid();
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  if not public.is_admin() then raise exception 'Not authorised.'; end if;
  if v_code is null then raise exception 'Enter the code for the combined voucher.'; end if;
  if coalesce(array_length(p_rewards, 1), 0) < 2 then raise exception 'Pick at least two vouchers to combine.'; end if;

  if (select count(*) from public.rewards r where r.id = any (p_rewards)) <> array_length(p_rewards, 1) then
    raise exception 'One of those vouchers no longer exists.';
  end if;
  if exists (select 1 from public.rewards r where r.id = any (p_rewards) and (r.reward_type <> 'voucher' or r.status <> 'distributed')) then
    raise exception 'Only vouchers that have been handed over can be combined.';
  end if;
  if (select count(distinct creator_id) from public.rewards r where r.id = any (p_rewards)) <> 1 then
    raise exception 'Those vouchers belong to different creators.';
  end if;
  if exists (select 1 from public.rewards r where r.id = any (p_rewards) and r.used_at is not null) then
    raise exception 'One of those has already been used. Combine only the unspent ones.';
  end if;

  -- Rows already in a group bring their whole group with them: a code cannot be
  -- half-changed.
  perform set_config('tryp.silent_reward', 'on', true);
  update public.rewards
     set voucher_group = v_group, voucher_code = v_code, issued_via = null, used_at = null, used_by = null,
         payment_notes = coalesce(nullif(btrim(coalesce(p_note, '')), ''), payment_notes)
   where id = any (p_rewards)
      or (voucher_group is not null and voucher_group in (select voucher_group from public.rewards where id = any (p_rewards)));

  select count(distinct currency) > 1 into v_mixed from public.rewards where voucher_group = v_group;
  if v_mixed then
    v_ccy := 'EUR';
    select round(sum(public.fx_convert(amount, currency, 'EUR'))) into v_total from public.rewards where voucher_group = v_group;
  else
    select sum(amount), min(currency) into v_total, v_ccy from public.rewards where voucher_group = v_group;
  end if;
  select creator_id into v_creator from public.rewards where voucher_group = v_group limit 1;
  perform public.notify_user(
    v_creator, 'reward', 'Your vouchers are now one 🎟️',
    'We combined your vouchers into a single ' || regexp_replace(to_char(v_total, 'FM999990.00'), '\.00$', '') || ' ' || v_ccy || ' code. It is on your Rewards page.',
    '/rewards'
  );
  return jsonb_build_object('group', v_group, 'total', v_total, 'currency', v_ccy, 'converted', v_mixed);
end;
$function$;

select public.lock_down_definer_functions();
