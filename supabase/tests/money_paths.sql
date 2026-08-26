-- ===========================================================================
-- THE FOUR WAYS MONEY IS CREATED, exercised against the real database.
-- ===========================================================================
--
-- Every block below ends in `raise exception`, which ROLLS THE WHOLE THING
-- BACK. Nothing persists: no rewards, no invoices, no notifications, no
-- invoice numbers consumed. The result arrives as the exception message.
--
-- Paste one block at a time into the SQL editor (or run it through the
-- Management API). Run them after ANY change to award_challenge_prizes,
-- on_reward_draft_invoice, raise_invoice_for_reward, mint_referral_reward or
-- milestone_progress.
--
-- Last run 26 Aug 2026, all four passing - results recorded under each block.

-- ---------------------------------------------------------------------------
-- 1. A CHALLENGE'S PRIZES.  Three cash places + a participation voucher.
--    Checks: one reward per place, one INVOICE per cash prize for a creator we
--    can pay, none for a creator we cannot, none for vouchers, and running the
--    award twice creates nothing the second time.
--
--    PASSED: RUN1 rewards=6 (cash=3 voucher=3) invoices=2
--            RUN2 rewards=6 invoices=2
--            payable creator -> inv=1 awaiting_approval
--            unpayable creator -> inv=0
-- ---------------------------------------------------------------------------
do $$
declare
  v_paid uuid; v_nopay uuid; v_third uuid; v_comm uuid; v_ch uuid;
  v_out text := ''; n_rewards int; n_invoices int; n_cash int; n_vouch int; r record;
begin
  select cp.id into v_paid from creator_private cp join profiles p on p.id=cp.id
   where public.invoice_is_payable(public.payment_snapshot(cp.id,'GBP')) and p.is_test=false limit 1;
  select p.id into v_nopay from profiles p
   where p.status='active' and p.is_admin=false and coalesce(p.is_test,false)=false
     and not public.invoice_is_payable(public.payment_snapshot(p.id,'GBP')) limit 1;
  select p.id into v_third from profiles p
   where p.status='active' and p.is_admin=false and coalesce(p.is_test,false)=false
     and p.id not in (v_paid, v_nopay) limit 1;
  select id into v_comm from communities where kind='chapter' limit 1;

  insert into challenges (title, description, community_id, status, scoring,
                          prize_structure, prize_currency, participation_threshold,
                          participation_prize, start_date, end_date)
  values ('TEST harness challenge', 'x', v_comm, 'archived', 'best_video',
          '[{"place":"1st","prize":"£100 cash"},{"place":"2nd","prize":"£50 cash"},{"place":"3rd","prize":"£25 cash"}]'::jsonb,
          'GBP', 1, '£10 Tryp.com voucher', current_date - 30, current_date - 1)
  returning id into v_ch;

  insert into results (challenge_id, creator_id, rank)
  values (v_ch, v_paid, 1), (v_ch, v_nopay, 2), (v_ch, v_third, 3);
  -- NB: platform is checked against ('Instagram','TikTok','YouTube','Other').
  insert into submissions (challenge_id, creator_id, video_url, platform, logged_views)
  values (v_ch, v_paid, 'https://x/1', 'TikTok', 100),
         (v_ch, v_nopay, 'https://x/2', 'TikTok', 50),
         (v_ch, v_third, 'https://x/3', 'TikTok', 10);

  perform public.award_challenge_prizes_internal(v_ch, false);
  select count(*) into n_rewards from rewards where challenge_id=v_ch;
  select count(*) into n_cash from rewards where challenge_id=v_ch and reward_type='cash';
  select count(*) into n_vouch from rewards where challenge_id=v_ch and reward_type='voucher';
  select count(*) into n_invoices from invoices i join rewards rw on rw.id=i.reward_id where rw.challenge_id=v_ch;
  v_out := format('RUN1 rewards=%s (cash=%s voucher=%s) invoices=%s', n_rewards, n_cash, n_vouch, n_invoices);

  perform public.award_challenge_prizes_internal(v_ch, false);
  select count(*) into n_rewards from rewards where challenge_id=v_ch;
  select count(*) into n_invoices from invoices i join rewards rw on rw.id=i.reward_id where rw.challenge_id=v_ch;
  v_out := v_out || format(' | RUN2 rewards=%s invoices=%s', n_rewards, n_invoices);

  for r in select p.name, rw.reward_type, rw.amount,
                  (select count(*) from invoices i where i.reward_id=rw.id) as inv,
                  (select string_agg(i.stage,',') from invoices i where i.reward_id=rw.id) as stage
             from rewards rw join profiles p on p.id=rw.creator_id
            where rw.challenge_id=v_ch order by rw.reward_type desc, rw.amount desc
  loop
    v_out := v_out || format(' || %s %s %s inv=%s %s', left(r.name,10), r.reward_type, r.amount, r.inv, coalesce(r.stage,'-'));
  end loop;
  raise exception 'RESULT: % (rolled back)', v_out;
end $$;

-- ---------------------------------------------------------------------------
-- 2. THE CATCH-UP.  A prize won by somebody with no bank details on file, then
--    the details arrive. The invoice must raise itself; nobody presses anything.
--
--    PASSED: invoices before details=0 after=1 stage=awaiting_approval payee=Test Payee
-- ---------------------------------------------------------------------------
do $$
declare
  v_nopay uuid; v_comm uuid; v_rw uuid; n_before int; n_after int;
  v_stage text; v_payee text;
begin
  select p.id into v_nopay from profiles p
   where p.status='active' and p.is_admin=false and coalesce(p.is_test,false)=false
     and not public.invoice_is_payable(public.payment_snapshot(p.id,'GBP')) limit 1;
  select id into v_comm from communities where kind='chapter' limit 1;

  insert into rewards (creator_id, reward_type, amount, currency, status, community_id, source)
  values (v_nopay, 'cash', 77, 'GBP', 'pending', v_comm, 'challenge') returning id into v_rw;
  select count(*) into n_before from invoices where reward_id = v_rw;

  insert into creator_private (id, pay_currency, pay_name, pay_bank, pay_sort_code, pay_account_number, pay_address)
  values (v_nopay, 'GBP', 'Test Payee', 'A Bank', '112233', '12345678', '1 Somewhere St')
  on conflict (id) do update set pay_currency='GBP', pay_name='Test Payee', pay_bank='A Bank',
    pay_sort_code='112233', pay_account_number='12345678', pay_address='1 Somewhere St';

  select count(*) into n_after from invoices where reward_id = v_rw;
  select stage, payment->>'name' into v_stage, v_payee from invoices where reward_id = v_rw;
  raise exception 'RESULT: invoices before details=% after=% stage=% payee=% (rolled back)',
    n_before, n_after, coalesce(v_stage,'-'), coalesce(v_payee,'-');
end $$;

-- ---------------------------------------------------------------------------
-- 3. A REFERRAL VOUCHER.  Minted on the referred creator's FIRST submission,
--    exactly once, and never invoiced (a voucher is a code, not a payment).
--
--    PASSED: rewards=1 amount=10.00 source=referral type=voucher invoices=0
--            after a 2nd video rewards=1
-- ---------------------------------------------------------------------------
do $$
declare
  v_ref uuid; v_new uuid; v_ch uuid; v_out text := '';
  n int; v_amt numeric; v_type text; v_inv int;
begin
  select id into v_ch from challenges order by created_at desc limit 1;
  select p.id into v_ref from profiles p where p.status='active' and p.is_admin=false
    and coalesce(p.is_test,false)=false limit 1;
  select p.id into v_new from profiles p
   where p.status='active' and p.is_admin=false and coalesce(p.is_test,false)=false and p.id <> v_ref
     and not exists (select 1 from submissions s where s.creator_id=p.id)
     and not exists (select 1 from rewards r where r.source='referral' and r.referred_creator_id=p.id)
   limit 1;

  update profiles set referred_by = v_ref where id = v_new;
  insert into submissions (challenge_id, creator_id, video_url, platform, logged_views)
  values (v_ch, v_new, 'https://x/first', 'TikTok', 1);

  select count(*), max(amount), max(reward_type) into n, v_amt, v_type
    from rewards where source='referral' and referred_creator_id = v_new;
  select count(*) into v_inv from invoices i join rewards r on r.id=i.reward_id
   where r.source='referral' and r.referred_creator_id = v_new;
  v_out := format('rewards=%s amount=%s type=%s invoices=%s', n, coalesce(v_amt,0), coalesce(v_type,'-'), v_inv);

  insert into submissions (challenge_id, creator_id, video_url, platform, logged_views)
  values (v_ch, v_new, 'https://x/second', 'TikTok', 2);
  select count(*) into n from rewards where source='referral' and referred_creator_id = v_new;
  raise exception 'RESULT: % | after a 2nd video rewards=% (rolled back)', v_out, n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A MILESTONE VOUCHER.  Reaching a voucher stop pays once; a role stop pays
--    nothing; running the recompute again pays nothing more.
--
--    PASSED: reached=2 milestone_rewards=1
--            Getting Started [role] reward_rows=0
--            Building Momentum [voucher] reward_rows=1
--            2nd run rewards=1
-- ---------------------------------------------------------------------------
do $$
declare
  v_p uuid; v_ref uuid; v_ch uuid; v_out text := '';
  n_ms int; n_rw int; n_rw2 int; r record;
begin
  select id into v_ch from challenges order by created_at desc limit 1;
  select p.id into v_p from profiles p
   where p.status='active' and p.is_admin=false and coalesce(p.is_test,false)=false
     and not exists (select 1 from creator_milestones cm where cm.profile_id=p.id)
     and not exists (select 1 from submissions s where s.creator_id=p.id)
   limit 1;
  select p.id into v_ref from profiles p where p.id <> v_p and p.status='active'
     and p.is_admin=false and coalesce(p.is_test,false)=false and p.referred_by is null limit 1;

  for i in 1..10 loop
    insert into submissions (challenge_id, creator_id, video_url, platform, logged_views)
    values (v_ch, v_p, 'https://x/ms' || i, 'TikTok', 2000);
  end loop;
  update profiles set referred_by = v_p where id = v_ref;

  perform public.milestone_progress(v_p);
  select count(*) into n_ms from creator_milestones where profile_id = v_p;
  select count(*) into n_rw from rewards where creator_id = v_p and source = 'milestone';
  v_out := format('reached=%s milestone_rewards=%s', n_ms, n_rw);

  for r in select m.title, m.reward_kind,
                  (select count(*) from rewards rw where rw.milestone_id=m.id and rw.creator_id=v_p) as paid
             from creator_milestones cm join milestones m on m.id=cm.milestone_id
            where cm.profile_id=v_p order by m.sort_order
  loop
    v_out := v_out || format(' || %s [%s] reward_rows=%s', r.title, r.reward_kind, r.paid);
  end loop;

  perform public.milestone_progress(v_p);
  select count(*) into n_rw2 from rewards where creator_id = v_p and source = 'milestone';
  raise exception 'RESULT: % | 2nd run rewards=% (rolled back)', v_out, n_rw2;
end $$;
