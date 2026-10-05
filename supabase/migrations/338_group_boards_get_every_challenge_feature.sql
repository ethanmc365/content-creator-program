-- 338 - A GROUP (LEADERBOARD) CAN DO EVERYTHING THE CHALLENGE CAN (5 Oct 2026).
--
-- Marta, on the Spanish challenge, which is split into two boards: the EUR 10 taking-part voucher
-- could not be told who earns it ("everyone" or "outside the prize places"), nor capped, and a
-- board could not have its own "Most committed" award. The challenge form could do all three.
--
-- A group already owned its prize rows and its taking-part threshold / prize / value / type
-- (migrations 154, 307). It now also owns:
--   participation_cap    first N to get there on THIS board (null = no cap)
--   participation_scope  'everyone' | 'outside_prizes' (null = the challenge's)
--   extra_awards         its own "Most committed" awards, won within the board
--
-- A group with no taking-part reward of its own still inherits the challenge's reward, cap and
-- scope, exactly as before. A group WITH its own now ranks its seats on its own board (the cap is
-- per board), where it used to share one global queue with the other board.
--
-- BACKFILL: groups that already carried their own taking-part reward were being judged by the
-- challenge's cap and scope, so those values are copied onto them and nothing changes today.

alter table public.challenge_groups
  add column if not exists participation_cap integer,
  add column if not exists participation_scope text,
  add column if not exists extra_awards jsonb not null default '[]'::jsonb;

alter table public.challenge_groups drop constraint if exists challenge_groups_participation_scope_check;
alter table public.challenge_groups add constraint challenge_groups_participation_scope_check
  check (participation_scope is null or participation_scope in ('everyone', 'outside_prizes'));
alter table public.challenge_groups drop constraint if exists challenge_groups_participation_cap_check;
alter table public.challenge_groups add constraint challenge_groups_participation_cap_check
  check (participation_cap is null or participation_cap > 0);

update public.challenge_groups g
   set participation_cap = c.participation_cap,
       participation_scope = coalesce(c.participation_scope, 'everyone')
  from public.challenges c
 where c.id = g.challenge_id
   and nullif(btrim(coalesce(g.participation_prize, '')), '') is not null
   and g.participation_scope is null;

create or replace function public.challenge_prize_standings_internal(p_challenge uuid)
 returns table(slot text, label text, creator_id uuid, creator_name text, photo_url text, entries integer, reached_at timestamp with time zone, board_rank integer, status text, reward_type text, prize text, amount numeric, currency text, seat integer, points integer)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_ch    record;
  v_src   record;
  v_award jsonb;
  v_gid   uuid;
  v_gname text;
  v_basis text;
begin
  select * into v_ch from public.challenges where id = p_challenge;
  if v_ch is null then return; end if;
  v_basis := coalesce(v_ch.participation_basis, 'entries');

  -- PARTICIPATION
  return query
  with per_creator as (
    select s.creator_id as cid,
           gm.group_id as gid,
           count(*)::int as n,
           array_agg(s.submitted_at order by s.submitted_at, s.id) as times,
           round(coalesce((
             select sum(a.points) from public.point_awards a
              where a.challenge_id = p_challenge and a.creator_id = s.creator_id
           ), 0))::int as pts
      from public.submissions s
      left join public.challenge_group_members gm
             on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
     where s.challenge_id = p_challenge
     group by s.creator_id, gm.group_id
  ),
  boarded as (
    select pc.*,
           coalesce(g.participation_threshold, v_ch.participation_threshold) as threshold,
           coalesce(nullif(btrim(coalesce(g.participation_prize, '')), ''), v_ch.participation_prize) as ptext,
           coalesce(g.prize_currency, v_ch.prize_currency) as cur,
           (nullif(btrim(coalesce(g.participation_prize, '')), '') is not null) as own_part,
           g.participation_amount as gamount,
           g.participation_reward_type as gtype,
           -- A board with its own taking-part reward has its own cap and scope (338);
           -- one without shares the challenge's.
           case when nullif(btrim(coalesce(g.participation_prize, '')), '') is not null
                then g.participation_cap else v_ch.participation_cap end as pcap,
           case when nullif(btrim(coalesce(g.participation_prize, '')), '') is not null
                then coalesce(g.participation_scope, v_ch.participation_scope, 'everyone')
                else coalesce(v_ch.participation_scope, 'everyone') end as pscope,
           jsonb_array_length(coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb)) as places,
           r.rank as brank,
           pr.name as pname, pr.photo_url as pphoto,
           coalesce(pr.is_test, false) as is_test
      from per_creator pc
      left join public.challenge_groups g on g.id = pc.gid
      left join public.results r on r.challenge_id = p_challenge and r.creator_id = pc.cid
      join public.profiles pr on pr.id = pc.cid
  ),
  qualified as (
    select b.*,
           case when v_basis = 'points'
                then coalesce((select m.reached_at from public.challenge_participation_marks m
                                where m.challenge_id = p_challenge and m.creator_id = b.cid
                                  and m.threshold = b.threshold), now())
                else b.times[b.threshold] end as at,
           (b.brank is not null and b.brank <= b.places) as won_place
      from boarded b
     where b.threshold is not null and coalesce(b.ptext, '') <> ''
       and case when v_basis = 'points' then b.pts >= b.threshold else b.n >= b.threshold end
  ),
  ordered as (
    select q.*,
           case
             when q.is_test then null
             when q.pscope = 'outside_prizes' and q.won_place then null
             else row_number() over (
               -- one queue per board that has its own reward; everyone else shares the challenge's
               partition by (case when q.own_part then q.gid end),
                            (q.is_test or (q.pscope = 'outside_prizes' and q.won_place))
               order by q.at, q.brank nulls last, q.cid)
           end as seat
      from qualified q
  )
  select 'participation'::text,
         case when o.gid is null then 'Participation'
              else 'Participation - ' || coalesce((select g.name from public.challenge_groups g where g.id = o.gid), 'group') end,
         o.cid, o.pname, o.pphoto, o.n, o.at, o.brank,
         case
           when o.is_test then 'test'
           when o.seat is null then 'excluded'
           when o.pcap is not null and o.seat > o.pcap then 'waitlisted'
           else 'earned'
         end,
         case when o.own_part then coalesce(o.gtype, public.prize_kind_of(o.ptext))
              else coalesce(v_ch.participation_reward_type, public.prize_kind_of(o.ptext)) end,
         o.ptext,
         case when o.own_part then coalesce(o.gamount, public.prize_amount_of(o.ptext))
              else coalesce(v_ch.participation_amount, public.prize_amount_of(o.ptext)) end,
         public.prize_currency_of(o.ptext, o.cur),
         o.seat::int,
         o.pts
    from ordered o
   order by o.seat nulls last, o.at;

  -- EXTRA AWARDS: the challenge's (for everyone on a board with none of its own), then each
  -- board's own, won within that board.
  for v_src in
    select a.value as award, null::uuid as gid
      from jsonb_array_elements(coalesce(v_ch.extra_awards, '[]'::jsonb)) a
    union all
    select a.value, g.id
      from public.challenge_groups g,
           jsonb_array_elements(coalesce(g.extra_awards, '[]'::jsonb)) a
     where g.challenge_id = p_challenge
  loop
    v_award := v_src.award;
    v_gid := v_src.gid;
    continue when coalesce(v_award ->> 'kind', '') <> 'most_committed';
    continue when coalesce(v_award ->> 'id', '') = '';
    v_gname := case when v_gid is null then null else (select g.name from public.challenge_groups g where g.id = v_gid) end;

    return query
    with per_creator as (
      select s.creator_id as cid,
             gm.group_id as gid,
             count(*)::int as n,
             max(s.submitted_at) as last_at,
             round(coalesce((
               select sum(a.points) from public.point_awards a
                where a.challenge_id = p_challenge and a.creator_id = s.creator_id
             ), 0))::int as pts
        from public.submissions s
        left join public.challenge_group_members gm
               on gm.challenge_id = p_challenge and gm.creator_id = s.creator_id
       where s.challenge_id = p_challenge
       group by s.creator_id, gm.group_id
    ),
    boarded as (
      select pc.*,
             r.rank as brank,
             -- `scope: 'anyone'` lets a prize winner take it too (Ethan:
             -- "admins should have the opportunity to choose").
             case when v_award ->> 'scope' = 'anyone' then 0
                  else coalesce(
                    nullif(v_award ->> 'exclude_top', '')::int,
                    jsonb_array_length(coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb)))
             end as cutoff,
             coalesce(g.prize_currency, v_ch.prize_currency) as cur,
             pr.name as pname, pr.photo_url as pphoto,
             coalesce(pr.is_test, false) as is_test,
             jsonb_array_length(coalesce(g.extra_awards, '[]'::jsonb)) as own_awards
        from per_creator pc
        left join public.challenge_groups g on g.id = pc.gid
        left join public.results r on r.challenge_id = p_challenge and r.creator_id = pc.cid
        join public.profiles pr on pr.id = pc.cid
    ),
    eligible as (
      select b.*,
             row_number() over (order by b.n desc, b.brank asc nulls last, b.last_at asc, b.cid) as pos
        from boarded b
       where not b.is_test
         and (b.brank is null or b.brank > b.cutoff)
         and case when v_gid is null then coalesce(b.own_awards, 0) = 0
                  else b.gid is not distinct from v_gid end
    )
    select 'award:' || (v_award ->> 'id'),
           coalesce(nullif(v_award ->> 'label', ''), 'Most committed')
             || case when v_gname is null then '' else ' - ' || v_gname end,
           e.cid, e.pname, e.pphoto, e.n, e.last_at, e.brank,
           case when e.pos = 1 then 'earned' else 'contender' end,
           coalesce(nullif(v_award ->> 'type', ''), public.prize_kind_of(v_award ->> 'prize')),
           v_award ->> 'prize',
           coalesce(nullif(v_award ->> 'amount', '')::numeric, public.prize_amount_of(v_award ->> 'prize')),
           public.prize_currency_of(v_award ->> 'prize', e.cur),
           e.pos::int,
           e.pts
      from eligible e
     where e.pos <= 3
     order by e.pos;
  end loop;
end $function$;

-- The count of vouchers a challenge gave. A challenge whose reward lives only on its boards has no
-- threshold of its own, so it was reading the hand-typed number instead of counting.
create or replace function public.challenge_voucher_counts()
 returns table(challenge_id uuid, vouchers integer, source text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    c.id,
    case
      when c.participation_threshold is null
           and not exists (select 1 from public.challenge_groups g where g.challenge_id = c.id and g.participation_threshold is not null)
        then coalesce(c.vouchers_given, 0)
      else coalesce((
        select count(*) from public.challenge_prize_standings_internal(c.id) st
         where st.slot = 'participation' and st.status = 'earned'
      ), 0)
    end::integer,
    case when c.participation_threshold is null
              and not exists (select 1 from public.challenge_groups g where g.challenge_id = c.id and g.participation_threshold is not null)
         then 'recorded' else 'counted' end
  from public.challenges c;
$function$;
