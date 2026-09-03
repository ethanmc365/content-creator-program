-- ============================================================================
-- 184 - "Draft invoice raised." was printed whether or not one was.
--       APPLIED 3 Sep 2026.
--
-- FOUND BY RUNNING THE AWARD FOR REAL on the Spanish points challenge, inside a
-- transaction that rolled itself back. Six rewards were created correctly and
-- ranked correctly off the points board - and the report said "Draft invoice
-- raised." against all three cash prizes while `invoices` gained nothing.
--
-- NOTHING WAS BROKEN. `raise_invoice_for_reward` returns null when the creator
-- has no payable payment details, and `on_reward_draft_invoice` then notifies
-- the creator to add them. That is correct: you cannot invoice somebody you
-- have no bank details for. The three Spanish demo creators have no
-- `creator_private` row, so no invoice could be raised for any of them.
--
-- THE DEFECT IS THE SENTENCE. It was a constant - `case when v_kind = 'cash'
-- then 'Draft invoice raised.' ...` - emitted before anybody looked at whether
-- one had been. So the one screen an admin reads after publishing winners told
-- them three invoices existed and the queue was empty. That is almost certainly
-- what "awarding prizes on a points challenge is not working" was: the awarding
-- worked, the report about it did not.
--
-- It reports ground truth now - does a row in `invoices` point at this reward -
-- rather than an assumption. On a DRY RUN there is no reward to look at, so the
-- same payability test the raiser uses decides what to promise.
--
-- Everything else is byte-identical to the deployed body, read out with
-- pg_get_functiondef rather than retyped (md5 cb850b71694f9bd94751b6da474fa025).
--
-- VERIFIED, all four cases, in a rolled-back transaction:
--   dry run  / no details  -> "No payment details on file, so no invoice yet..."
--   for real / no details  -> same, and invoices raised: 0
--   dry run  / details     -> "Draft invoice will be raised."
--   for real / details     -> "Draft invoice raised.", and invoices raised: 3
-- The same run also proved the whole award path on a POINTS challenge: three
-- cash rewards and three participation vouchers, ranked off the points board,
-- each cash reward raising an `awaiting_approval` invoice carrying the payee.
--
-- See the deployed function for the body; only the two expressions below differ
-- from 158. Reproduced in full here so this folder is not behind the database.
-- ============================================================================

create or replace function public.award_challenge_prizes_internal(p_challenge_id uuid, p_dry_run boolean DEFAULT false)
returns TABLE(place text, creator_id uuid, creator_name text, reward_type text, amount numeric, currency text, outcome text, detail text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ch      record;
  v_board   record;
  v_row     record;
  v_amount  numeric;
  v_cur     text;
  v_kind    text;
  v_exists  boolean;
  v_label   text;
  v_reward  uuid;
  v_invoice boolean;
begin
  if not public.award_prizes_caller_is_allowed() then
    raise exception 'Only the team can award prizes.';
  end if;
  select * into v_ch from public.challenges where id = p_challenge_id;
  if v_ch is null then raise exception 'No such challenge.'; end if;

  if not exists (select 1 from public.results where challenge_id = p_challenge_id) then
    return query select null::text, null::uuid, null::text, null::text, null::numeric, null::text,
                        'blocked'::text, 'No leaderboard has been generated for this challenge.'::text;
    return;
  end if;

  for v_board in
    select distinct
           r.group_id as gid,
           g.name     as gname,
           coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb) as prizes,
           coalesce(g.prize_currency, v_ch.prize_currency) as gcur,
           coalesce(g.participation_threshold, v_ch.participation_threshold) as pthreshold,
           coalesce(nullif(btrim(coalesce(g.participation_prize, '')), ''), v_ch.participation_prize) as pprize
      from public.results r
      left join public.challenge_groups g on g.id = r.group_id
     where r.challenge_id = p_challenge_id
     order by 2 nulls first
  loop
    for v_row in
      select p.ord::int as ord,
             coalesce(p.value ->> 'place', p.ord || '') as label,
             p.value ->> 'prize' as prize,
             r.creator_id as cid,
             pr.name as cname,
             coalesce(pr.is_test, false) as is_test
        from jsonb_array_elements(v_board.prizes) with ordinality p(value, ord)
        left join public.results r
               on r.challenge_id = p_challenge_id
              and r.rank = p.ord
              and r.group_id is not distinct from v_board.gid
        left join public.profiles pr on pr.id = r.creator_id
       order by p.ord
    loop
      v_label  := case when v_board.gid is null then v_row.label
                       else v_row.label || ' - ' || coalesce(v_board.gname, 'group') end;
      v_amount := public.prize_amount_of(v_row.prize);
      v_cur    := public.prize_currency_of(v_row.prize, v_board.gcur);
      v_kind   := public.prize_kind_of(v_row.prize);

      if v_row.cid is null then
        return query select v_label, null::uuid, null::text, v_kind, v_amount, v_cur,
                            'skipped'::text, 'Nobody finished in this place.'::text;
        continue;
      end if;
      if v_amount <= 0 then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'skipped'::text, format('No amount could be read from "%s".', coalesce(v_row.prize, ''));
        continue;
      end if;
      if v_row.is_test then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'skipped'::text, 'Test account.'::text;
        continue;
      end if;

      select exists (
        select 1 from public.rewards
         where challenge_id = p_challenge_id and rewards.creator_id = v_row.cid
           and rewards.reward_type = v_kind and source = 'challenge'
      ) into v_exists;
      if v_exists then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'already awarded'::text, 'A reward for this place already exists.'::text;
        continue;
      end if;

      v_reward := null;
      if not p_dry_run then
        insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                    status, payment_notes, community_id, source)
        values (v_row.cid, p_challenge_id, v_kind, v_amount, v_cur, 'pending',
                format('%s place - %s', v_label, v_ch.title), v_ch.community_id, 'challenge')
        returning id into v_reward;
      end if;

      -- WHAT ACTUALLY HAPPENED TO THE INVOICE, not what usually happens.
      -- After a real insert the reward trigger has already run, so the honest
      -- answer is simply whether a row points at it. On a dry run there is no
      -- reward to look at, so the same payability test the raiser uses decides
      -- what to promise.
      if v_kind <> 'cash' then
        v_invoice := null;
      elsif p_dry_run then
        v_invoice := public.invoice_is_payable(public.payment_snapshot(v_row.cid, v_cur));
      else
        v_invoice := exists (select 1 from public.invoices where reward_id = v_reward);
      end if;

      return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                          case when p_dry_run then 'would create' else 'created' end::text,
                          case
                            when v_kind <> 'cash' then 'Voucher to issue.'
                            when v_invoice and p_dry_run then 'Draft invoice will be raised.'
                            when v_invoice then 'Draft invoice raised.'
                            else 'No payment details on file, so no invoice yet. They have been asked for them, and it raises itself when they are added.'
                          end::text;
    end loop;

    continue when v_board.pthreshold is null or coalesce(v_board.pprize, '') = '';

    v_amount := public.prize_amount_of(v_board.pprize);
    v_cur    := public.prize_currency_of(v_board.pprize, v_board.gcur);
    v_kind   := public.prize_kind_of(v_board.pprize);
    v_label  := case when v_board.gid is null then 'Participation'
                     else 'Participation - ' || coalesce(v_board.gname, 'group') end;

    for v_row in
      select s.creator_id as cid, pr.name as cname, count(*) as entries,
             coalesce(pr.is_test, false) as is_test
        from public.submissions s
        join public.profiles pr on pr.id = s.creator_id
        left join public.challenge_group_members gm
               on gm.challenge_id = p_challenge_id and gm.creator_id = s.creator_id
       where s.challenge_id = p_challenge_id
         and gm.group_id is not distinct from v_board.gid
       group by s.creator_id, pr.name, pr.is_test
      having count(*) >= v_board.pthreshold
       order by count(*) desc
    loop
      if v_amount <= 0 then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'skipped'::text, format('No amount could be read from "%s".', v_board.pprize);
        continue;
      end if;
      if v_row.is_test then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'skipped'::text, 'Test account.'::text;
        continue;
      end if;

      select exists (
        select 1 from public.rewards
         where challenge_id = p_challenge_id and rewards.creator_id = v_row.cid
           and rewards.reward_type = v_kind and source = 'challenge'
      ) into v_exists;
      if v_exists then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'already awarded'::text,
                            format('%s already holds a %s reward for this challenge.', v_row.cname, v_kind);
        continue;
      end if;

      if not p_dry_run then
        insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                    status, payment_notes, community_id, source)
        values (v_row.cid, p_challenge_id, v_kind, v_amount, v_cur, 'pending',
                format('%s - %s (%s entries)', v_board.pprize, v_ch.title, v_row.entries),
                v_ch.community_id, 'challenge');
      end if;
      return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                          case when p_dry_run then 'would create' else 'created' end::text,
                          format('%s entries.', v_row.entries);
    end loop;
  end loop;
end $function$;
