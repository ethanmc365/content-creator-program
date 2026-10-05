-- A board (group) has every taking-part and award setting a challenge has (migration 338).
-- Self-rolling-back: it always ends in `raise exception 'REHEARSAL ...'`, so nothing persists. Read the message.
-- Run it with the Management API / MCP execute_sql. Expected tail:
--   cap 1 on a board        -> one 'earned', one 'waitlisted' (seats are per board)
--   outside_prizes          -> both of that board's rank-1/2 creators are 'excluded' (they are inside the paid places)
--   board-owned Most committed -> exactly one 'earned' and the rest 'contender', all labelled "... - <board>"
do $$
declare
  c uuid; ga uuid; gb uuid; out text := ''; r record; n_earned int; n_wait int; n_excl int; n_mc_earned int;
begin
  select ch.id into c from public.challenges ch
   where exists (select 1 from public.challenge_groups g where g.challenge_id = ch.id and g.participation_threshold is not null)
   order by ch.created_at desc limit 1;
  if c is null then raise exception 'REHEARSAL skipped: no challenge has groups with a taking-part reward'; end if;
  -- `ga` is the board that actually has qualifiers (a board nobody has qualified on proves nothing), `gb` is any other.
  select g.id into ga from public.challenge_groups g
   where g.challenge_id = c
   order by (select count(*) from public.challenge_prize_standings_internal(c) s
              where s.slot = 'participation' and s.label = 'Participation - ' || g.name) desc, g.position limit 1;
  select id into gb from public.challenge_groups where challenge_id = c and id <> ga order by position limit 1;

  -- 1. a cap of 1 on the first board
  update public.challenge_groups set participation_cap = 1, participation_scope = 'everyone' where id = ga;
  select count(*) filter (where status = 'earned'), count(*) filter (where status = 'waitlisted')
    into n_earned, n_wait
    from public.challenge_prize_standings_internal(c) s
   where s.slot = 'participation' and s.label = 'Participation - ' || (select name from public.challenge_groups where id = ga);
  out := out || format('cap 1: earned=%s waitlisted=%s%s', n_earned, n_wait, E'\n');
  if n_earned > 1 then raise exception 'FAIL cap not applied per board: %', n_earned; end if;
  if n_earned + n_wait = 0 then raise exception 'FAIL the board under test has no qualifiers, so the cap was not exercised'; end if;

  -- 2. who can earn it: outside the prize places excludes anybody ranked inside the paid places
  update public.challenge_groups set participation_scope = 'outside_prizes' where id = ga;
  select count(*) filter (where status = 'excluded') into n_excl
    from public.challenge_prize_standings_internal(c) s
   where s.slot = 'participation' and s.label = 'Participation - ' || (select name from public.challenge_groups where id = ga);
  out := out || format('outside_prizes: excluded=%s%s', n_excl, E'\n');

  -- 3. the other board's own Most committed
  if gb is not null then
    update public.challenge_groups
       set extra_awards = jsonb_build_array(jsonb_build_object('id','rehearsal-mc','kind','most_committed','label','Most committed','prize','20 EUR voucher','amount',20,'type','voucher','scope','anyone'))
     where id = gb;
    select count(*) filter (where status = 'earned') into n_mc_earned
      from public.challenge_prize_standings_internal(c) s where s.slot = 'award:rehearsal-mc';
    out := out || format('board Most committed: earned=%s%s', n_mc_earned, E'\n');
    if n_mc_earned > 1 then raise exception 'FAIL more than one Most committed winner on one board'; end if;
    for r in select label from public.challenge_prize_standings_internal(c) s where s.slot = 'award:rehearsal-mc' limit 1 loop
      out := out || 'label: ' || r.label || E'\n';
    end loop;
  end if;
  raise exception 'REHEARSAL OK %', out;
end $$;
