-- AWARDING THE PRIZES, ONE LEADERBOARD AT A TIME.
--
-- THE BUG. `award_challenge_prizes_internal` was written (migration 114) when a
-- challenge had exactly one leaderboard, and it joins the prize structure to
-- the results on RANK ALONE:
--
--     left join public.results r on r.challenge_id = ... and r.rank = p.ord
--
-- Migration 154 gave a challenge more than one board, and `rebuild_challenge_
-- results` ranks WITHIN a board (`partition by group_id`) - so a challenge
-- split in two now has two rows at rank 1, three at rank 2 if there are three
-- groups, and so on. That join therefore matched every group's winner for the
-- challenge's own "1st" prize, awarded it to all of them under one label, and
-- never looked at `challenge_groups.prize_amount` or
-- `challenge_groups.prize_structure` at all - which is the entire point of
-- giving a group its own prize.
--
-- Spain is the first market to run a split brief, and nobody has published its
-- winners yet, so nothing has been paid wrongly. This is the fix before that
-- happens rather than after.
--
-- WHAT IT DOES NOW. It walks the BOARDS - the distinct `group_id`s the results
-- actually contain, which is exactly one null board for an ungrouped challenge
-- and therefore identical behaviour there - and for each one:
--
--   * takes that group's `prize_structure` if it has one, and the challenge's
--     if it does not (the same fall-through `prizeForGroup` does in the app, so
--     the money and the leaderboard cannot disagree);
--   * matches rank to place WITHIN that board;
--   * labels the reward with the group's name, so "1st place - Group B" is what
--     an admin reads on the rewards page and what the invoice carries.
--
-- Everything else is unchanged and deliberately so: the participation reward is
-- a fact about the whole challenge, not about a board, and is still paid to
-- everyone over the threshold exactly once. The idempotency check is still
-- (challenge, creator, reward_type, source='challenge'), which is still safe -
-- a creator is in at most one group by primary key, so they cannot be paid a
-- first place on two boards.
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

  for v_board in
    select distinct
           r.group_id as gid,
           g.name     as gname,
           coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb) as prizes,
           coalesce(g.prize_currency, v_ch.prize_currency) as gcur
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
  end loop;

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
end $function$;
