-- 241: THE PARTICIPATION VOUCHER CAN BE EARNED WITH POINTS (21 Sep 2026)
--
-- Ethan: "Currently, we just have it so that you can set a number of videos,
-- and once it's reached... they get it. I want you to also add in, for the
-- point system, that if they reach, for example, 20 points, they'll get the
-- participation voucher... ensure it works and is given automatically."
--
-- 1. `challenges.participation_basis`: 'entries' (the number is videos posted,
--    as it always was) or 'points' (the number is a points total). The number
--    stays in `participation_threshold`, so everything that asks "does this
--    challenge have a participation prize" keeps working unchanged, and a
--    group's own threshold is read in its challenge's basis.
--
-- 2. WHO WAS FIRST, ON POINTS. A videos threshold has a natural moment - the
--    Nth entry's time - and the `participation_cap` ("the first 33") orders by
--    it. A points total has none: points are recomputed from scratch on every
--    view sync. `challenge_participation_marks` records the first time a
--    creator was seen at or over the threshold, written by a statement trigger
--    on `point_awards` (every rescore ends in inserts there) and by a trigger
--    on the challenge when the number or the basis changes. Keyed on the
--    threshold too, so raising the bar does not keep the old moments.
--
-- 3. `challenge_prize_standings` - still the one definition - qualifies by
--    whichever basis the challenge uses and now returns each creator's
--    `points`, so the challenge page can say "12 of 20 points". The payout
--    reads it, so the voucher is created on "Publish winners" exactly like the
--    videos version, with no step of its own.
--
-- The rest of each function is 233's body unchanged.

alter table public.challenges
  add column if not exists participation_basis text not null default 'entries';
alter table public.challenges drop constraint if exists challenges_participation_basis_check;
alter table public.challenges add constraint challenges_participation_basis_check
  check (participation_basis in ('entries', 'points'));

create table if not exists public.challenge_participation_marks (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  creator_id   uuid not null references public.profiles(id) on delete cascade,
  threshold    integer not null,
  reached_at   timestamptz not null default clock_timestamp(),
  primary key (challenge_id, creator_id, threshold)
);
alter table public.challenge_participation_marks enable row level security;
-- Read through challenge_prize_standings only; no policy means no direct access.
revoke all on public.challenge_participation_marks from anon, authenticated;

-- Record everyone in one challenge who is at or over its points threshold now.
create or replace function public.mark_points_participation(p_challenge uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch record;
begin
  select id, participation_basis, participation_threshold into v_ch
    from public.challenges where id = p_challenge;
  if v_ch.id is null or v_ch.participation_basis <> 'points' or v_ch.participation_threshold is null then
    return;
  end if;
  insert into public.challenge_participation_marks (challenge_id, creator_id, threshold, reached_at)
  select p_challenge, t.creator_id, coalesce(g.participation_threshold, v_ch.participation_threshold), clock_timestamp()
    from (
      select a.creator_id, sum(a.points) as pts
        from public.point_awards a
       where a.challenge_id = p_challenge
       group by a.creator_id
    ) t
    left join public.challenge_group_members gm
           on gm.challenge_id = p_challenge and gm.creator_id = t.creator_id
    left join public.challenge_groups g on g.id = gm.group_id
   where t.pts >= coalesce(g.participation_threshold, v_ch.participation_threshold)
  on conflict do nothing;
end $function$;
revoke all on function public.mark_points_participation(uuid) from public, anon, authenticated;

create or replace function public.trg_mark_points_participation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  for v_id in select distinct challenge_id from new_rows where challenge_id is not null loop
    perform public.mark_points_participation(v_id);
  end loop;
  return null;
end $function$;
revoke all on function public.trg_mark_points_participation() from public, anon, authenticated;

drop trigger if exists trg_point_awards_mark_participation on public.point_awards;
create trigger trg_point_awards_mark_participation
  after insert on public.point_awards
  referencing new table as new_rows
  for each statement
  execute function public.trg_mark_points_participation();

create or replace function public.trg_challenge_mark_participation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.mark_points_participation(new.id);
  return new;
end $function$;
revoke all on function public.trg_challenge_mark_participation() from public, anon, authenticated;

drop trigger if exists trg_challenge_mark_participation on public.challenges;
create trigger trg_challenge_mark_participation
  after insert or update of participation_basis, participation_threshold on public.challenges
  for each row
  when (new.participation_basis = 'points')
  execute function public.trg_challenge_mark_participation();

-- The return type grows a column, which `create or replace` cannot do.
drop function if exists public.challenge_prize_standings(uuid);
drop function if exists public.challenge_prize_standings_internal(uuid);

create or replace function public.challenge_prize_standings_internal(p_challenge uuid)
 returns table(
   slot text, label text, creator_id uuid, creator_name text, photo_url text,
   entries integer, reached_at timestamptz, board_rank integer, status text,
   reward_type text, prize text, amount numeric, currency text, seat integer,
   points integer
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch    record;
  v_award jsonb;
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
           jsonb_array_length(coalesce(nullif(g.prize_structure, '[]'::jsonb), v_ch.prize_structure, '[]'::jsonb)) as places,
           r.rank as brank,
           pr.name as pname, pr.photo_url as pphoto,
           coalesce(pr.is_test, false) as is_test
      from per_creator pc
      left join public.challenge_groups g on g.id = pc.gid
      left join public.results r on r.challenge_id = p_challenge and r.creator_id = pc.cid
      join public.profiles pr on pr.id = pc.cid
  ),
  -- BY VIDEOS OR BY POINTS (241). On a points basis the threshold is a
  -- points total, and "first" is the moment the creator was first seen at or
  -- over it (`challenge_participation_marks`); a creator who has reached it but
  -- whose moment was never recorded counts from now, behind everyone who was.
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
             when v_ch.participation_scope = 'outside_prizes' and q.won_place then null
             else row_number() over (
               partition by (q.is_test or (v_ch.participation_scope = 'outside_prizes' and q.won_place))
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
           when v_ch.participation_cap is not null and o.seat > v_ch.participation_cap then 'waitlisted'
           else 'earned'
         end,
         coalesce(v_ch.participation_reward_type, public.prize_kind_of(o.ptext)),
         o.ptext,
         coalesce(v_ch.participation_amount, public.prize_amount_of(o.ptext)),
         public.prize_currency_of(o.ptext, o.cur),
         o.seat::int,
         o.pts
    from ordered o
   order by o.seat nulls last, o.at;

  -- EXTRA AWARDS
  for v_award in select * from jsonb_array_elements(coalesce(v_ch.extra_awards, '[]'::jsonb)) loop
    continue when coalesce(v_award ->> 'kind', '') <> 'most_committed';
    continue when coalesce(v_award ->> 'id', '') = '';

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
             coalesce(pr.is_test, false) as is_test
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
    )
    select 'award:' || (v_award ->> 'id'),
           coalesce(nullif(v_award ->> 'label', ''), 'Most committed'),
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

create or replace function public.challenge_prize_standings(p_challenge uuid)
 returns table(
   slot text, label text, creator_id uuid, creator_name text, photo_url text,
   entries integer, reached_at timestamptz, board_rank integer, status text,
   reward_type text, prize text, amount numeric, currency text, seat integer,
   points integer
 )
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from public.challenges c
     where c.id = p_challenge
       and (public.is_admin()
            or c.status = 'archived'
            or c.community_id in (select public.my_scopes()))
  ) then
    return;
  end if;
  return query select * from public.challenge_prize_standings_internal(p_challenge);
end $function$;

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

  -- PLACES, per leaderboard.
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
             nullif(p.value ->> 'type', '') as ptype,
             nullif(p.value ->> 'amount', '') as pamount,
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
      v_amount := coalesce(nullif(regexp_replace(coalesce(v_row.pamount, ''), '[^0-9.]', '', 'g'), '')::numeric,
                           public.prize_amount_of(v_row.prize));
      v_cur    := public.prize_currency_of(v_row.prize, v_board.gcur);
      v_kind   := case when v_row.ptype in ('cash', 'voucher') then v_row.ptype
                       else public.prize_kind_of(v_row.prize) end;

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
        select 1 from public.rewards w
         where w.challenge_id = p_challenge_id and w.creator_id = v_row.cid and w.source = 'challenge'
           and (w.prize_slot = 'place' or (w.prize_slot is null and w.reward_type = v_kind))
      ) into v_exists;
      if v_exists then
        return query select v_label, v_row.cid, v_row.cname, v_kind, v_amount, v_cur,
                            'already awarded'::text, 'A reward for this place already exists.'::text;
        continue;
      end if;

      v_reward := null;
      if not p_dry_run then
        insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                    status, payment_notes, community_id, source, prize_slot)
        values (v_row.cid, p_challenge_id, v_kind, v_amount, v_cur, 'pending',
                format('%s place - %s', v_label, v_ch.title), v_ch.community_id, 'challenge', 'place')
        returning id into v_reward;
      end if;

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
  end loop;

  -- PARTICIPATION AND EXTRA AWARDS, from the one standings definition.
  for v_row in
    select * from public.challenge_prize_standings_internal(p_challenge_id) st
     where st.status in ('earned', 'waitlisted')
  loop
    if v_row.status = 'waitlisted' then
      return query select v_row.label, v_row.creator_id, v_row.creator_name, v_row.reward_type, v_row.amount, v_row.currency,
                          'skipped'::text,
                          format('Qualified after the first %s places were taken.', v_ch.participation_cap);
      continue;
    end if;
    if coalesce(v_row.amount, 0) <= 0 then
      return query select v_row.label, v_row.creator_id, v_row.creator_name, v_row.reward_type, v_row.amount, v_row.currency,
                          'skipped'::text, format('No amount could be read from "%s".', coalesce(v_row.prize, ''));
      continue;
    end if;

    select exists (
      select 1 from public.rewards w
       where w.challenge_id = p_challenge_id and w.creator_id = v_row.creator_id and w.source = 'challenge'
         and (w.prize_slot = v_row.slot
              or (w.prize_slot is null and v_row.slot = 'participation' and w.reward_type = v_row.reward_type))
    ) into v_exists;
    if v_exists then
      return query select v_row.label, v_row.creator_id, v_row.creator_name, v_row.reward_type, v_row.amount, v_row.currency,
                          'already awarded'::text, 'This prize has already been awarded.'::text;
      continue;
    end if;

    v_reward := null;
    if not p_dry_run then
      insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency,
                                  status, payment_notes, community_id, source, prize_slot)
      values (v_row.creator_id, p_challenge_id, v_row.reward_type, v_row.amount, v_row.currency, 'pending',
              case when coalesce(v_ch.participation_basis, 'entries') = 'points' and v_row.slot = 'participation'
                   then format('%s: %s - %s (%s points)', v_row.label, coalesce(v_row.prize, ''), v_ch.title, v_row.points)
                   else format('%s: %s - %s (%s entries)', v_row.label, coalesce(v_row.prize, ''), v_ch.title, v_row.entries) end,
              v_ch.community_id, 'challenge', v_row.slot)
      returning id into v_reward;
    end if;

    if v_row.reward_type <> 'cash' then
      v_invoice := null;
    elsif p_dry_run then
      v_invoice := public.invoice_is_payable(public.payment_snapshot(v_row.creator_id, v_row.currency));
    else
      v_invoice := exists (select 1 from public.invoices where reward_id = v_reward);
    end if;

    return query select v_row.label, v_row.creator_id, v_row.creator_name, v_row.reward_type, v_row.amount, v_row.currency,
                        case when p_dry_run then 'would create' else 'created' end::text,
                        format('%s. %s',
                          case when coalesce(v_ch.participation_basis, 'entries') = 'points' and v_row.slot = 'participation'
                               then v_row.points || ' points' else v_row.entries || ' entries' end,
                          case
                            when v_row.reward_type <> 'cash' then 'Voucher to issue.'
                            when v_invoice and p_dry_run then 'Draft invoice will be raised.'
                            when v_invoice then 'Draft invoice raised.'
                            else 'No payment details on file yet.'
                          end);
  end loop;
end $function$;

create or replace function public.challenge_voucher_counts()
 returns table(challenge_id uuid, vouchers integer, source text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    c.id,
    case
      when c.participation_threshold is null then coalesce(c.vouchers_given, 0)
      else coalesce((
        select count(*) from public.challenge_prize_standings_internal(c.id) st
         where st.slot = 'participation' and st.status = 'earned'
      ), 0)
    end::integer,
    case when c.participation_threshold is null then 'recorded' else 'counted' end
  from public.challenges c;
$function$;


revoke all on function public.challenge_prize_standings_internal(uuid) from public, anon, authenticated;
revoke all on function public.award_challenge_prizes_internal(uuid, boolean) from public, anon, authenticated;
revoke all on function public.challenge_prize_standings(uuid) from public, anon;
grant execute on function public.challenge_prize_standings(uuid) to authenticated;

notify pgrst, 'reload schema';
