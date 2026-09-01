-- A GROUP CAN CARRY A WHOLE PRIZE, INCLUDING THE ONE FOR TURNING UP.
--
-- Migration 154 gave a challenge more than one leaderboard and 158 taught the
-- payout to walk them. What a board could actually PROMISE was still half a
-- prize: `challenge_groups` had `prize_structure` (which 158 pays from) and the
-- two derived reporting figures, and nothing else. Two things followed from
-- that, and both are fixed here.
--
-- 1. THE FORM NEVER WROTE `prize_structure`. It asked for a pot and a number of
--    winners - the two figures every other surface DERIVES from the rows - and
--    saved those. So a group set up with "its own prize" of 300 euros over 3
--    winners had an empty breakdown, 158's `nullif(g.prize_structure, '[]')`
--    fell straight through to the challenge's, and every board was paid the
--    challenge's prizes no matter what the admin had typed. Ethan: "it needs
--    the actual proper data, and this would need to be synced to the database
--    and everything so it works correctly." That half is an app change
--    (PrizeBreakdownFields + saveGroups); this migration is the other half.
--
-- 2. THE PARTICIPATION REWARD WAS THE CHALLENGE'S ONLY. 158 said so in as many
--    words - "the participation reward is a fact about the whole challenge, not
--    about a board" - and that was true when a board could only carry a pot.
--    Once a board carries a whole prize it is not: Spain running two groups for
--    two different sponsors can owe two different vouchers for taking part, and
--    "post 3 videos and everyone gets X" is a promise made to a GROUP of people
--    the moment those people are on separate boards.
--
-- SO THE PARTICIPATION PASS WALKS THE BOARDS TOO, and it falls through exactly
-- the way the places do: a group with no participation settings of its own is
-- paid the challenge's. The board a creator belongs to comes from
-- `challenge_group_members`, not from `results` - somebody who posted their
-- three videos and never had a view logged has no result row and is still owed
-- the reward.
--
-- BEHAVIOUR ON AN UNGROUPED CHALLENGE IS IDENTICAL, by construction: with no
-- groups there is one null board, every creator's `group_id` is null, and the
-- coalesce lands on the challenge's own settings - which is the query that was
-- here before, with a join that matches everybody.
--
-- THE IDEMPOTENCY CHECK IS UNCHANGED and still safe: (challenge, creator,
-- reward_type, source='challenge'). A creator is in at most one group by
-- primary key, so they cannot be paid a participation reward on two boards.

alter table public.challenge_groups
  add column if not exists participation_threshold integer,
  add column if not exists participation_prize     text;

comment on column public.challenge_groups.participation_threshold is
  'Videos this board''s members must post to earn the participation reward. Null falls through to the challenge''s.';
comment on column public.challenge_groups.participation_prize is
  'What this board pays for taking part. Null falls through to the challenge''s.';
comment on column public.challenge_groups.prize_structure is
  'This board''s prize rows [{place, prize, amount}]. An empty array means "same prize as the challenge" and is what the payout falls through on.';

create or replace function public.award_challenge_prizes_internal(p_challenge_id uuid, p_dry_run boolean default false)
returns table(place text, creator_id uuid, creator_name text, reward_type text, amount numeric, currency text, outcome text, detail text)
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
begin
  select * into v_ch from public.challenges where id = p_challenge_id;
  if v_ch is null then raise exception 'No such challenge.'; end if;

  if not exists (select 1 from public.results where challenge_id = p_challenge_id) then
    return query select null::text, null::uuid, null::text, null::text, null::numeric, null::text,
                        'blocked'::text, 'No leaderboard has been generated for this challenge.'::text;
    return;
  end if;

  -- THE BOARDS COME FROM THE RESULTS, not from `challenge_groups`, so a group
  -- that nobody entered is not walked and a creator who was never dealt in
  -- still gets the null board. 158's rule, unchanged.
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
    -- ---- the places on this board --------------------------------------
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

      if not p_dry_run then
        insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                    status, payment_notes, community_id, source)
        values (v_row.cid, p_challenge_id, v_kind, v_amount, v_cur, 'pending',
                format('%s place - %s', v_label, v_ch.title), v_ch.community_id, 'challenge');
      end if;
      return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                          case when p_dry_run then 'would create' else 'created' end::text,
                          case when v_kind = 'cash' then 'Draft invoice raised.' else 'Voucher to issue.' end::text;
    end loop;

    -- ---- and what this board pays for taking part ------------------------
    -- Restricted to the board's own members. `is not distinct from` is what
    -- makes the ungrouped case one query rather than a branch: with no groups
    -- every creator's membership is null and so is the board.
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
