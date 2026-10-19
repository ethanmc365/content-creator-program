-- 435: VIDEO OF THE WEEK, AND "SOMEBODY OVERTOOK YOU" (19 Oct 2026).
--
-- 1. VIDEO OF THE WEEK. A challenge can carry `weekly_prize` = {amount, currency, type ('voucher'|'cash'), every_days}.
--    The challenge is cut into rounds of `every_days` from its start (a remainder shorter than half a round joins the
--    last one). In each round the entry with the most views, among the videos POSTED in that round, wins. On a split
--    challenge every group has its own winner. Once a round ends, `weekly_prize_tick` (cron, hourly) asks view-sync to
--    read that round's leading entries one last time, waits for the reading, then FREEZES the winner and tells the
--    team. Nothing is paid until somebody presses Award (`award_weekly_prize`), which writes the reward: cash raises
--    its invoice through the usual trigger, a voucher waits for its code like every other voucher.
--
-- 2. RANK ALERTS. `results` is rewritten by `rebuild_challenge_results` as a diff, so a statement trigger on it sees
--    exactly who moved. Moving up into the top of the board, or being pushed down from it, sends one notification
--    (type 'rank', so it can be muted), written in the creator's own language, never more than one every 12 hours per
--    challenge, except the moments that matter (reaching first, entering or leaving the prize places: 2 hours).

-- ---------------------------------------------------------------- notification type
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'challenge','announcement','results','reward','deadline','connection','dm','event','application','chat','submission',
  'deletion','referral','new_member','inactive','feedback','collab','mention','daily_streak','daily_reminder',
  'board_answer','report','event_reminder','event_rating','reaction','community','vip','rank'
]));

-- ---------------------------------------------------------------- video of the week
alter table public.challenges add column if not exists weekly_prize jsonb;

create table if not exists public.challenge_weekly_winners (
  id                uuid primary key default gen_random_uuid(),
  challenge_id      uuid not null references public.challenges(id) on delete cascade,
  group_id          uuid references public.challenge_groups(id) on delete cascade,
  round             int not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  submission_id     uuid references public.submissions(id) on delete set null,
  creator_id        uuid references public.profiles(id) on delete set null,
  views             bigint,
  read_requested_at timestamptz,
  locked_at         timestamptz,
  reward_id         uuid references public.rewards(id) on delete set null,
  awarded_at        timestamptz,
  awarded_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create unique index if not exists challenge_weekly_winners_one
  on public.challenge_weekly_winners (challenge_id, coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid), round);
create index if not exists challenge_weekly_winners_creator on public.challenge_weekly_winners (creator_id);
create index if not exists challenge_weekly_winners_submission on public.challenge_weekly_winners (submission_id);
create index if not exists challenge_weekly_winners_reward on public.challenge_weekly_winners (reward_id);
create index if not exists challenge_weekly_winners_awarded_by on public.challenge_weekly_winners (awarded_by);
create index if not exists challenge_weekly_winners_group on public.challenge_weekly_winners (group_id);

alter table public.challenge_weekly_winners enable row level security;
-- Readable by whoever can read the challenge (its RLS keeps the VIP fences); written only by the functions below.
drop policy if exists weekly_winners_read on public.challenge_weekly_winners;
create policy weekly_winners_read on public.challenge_weekly_winners for select to authenticated
  using (exists (select 1 from public.challenges c where c.id = challenge_id));
revoke insert, update, delete on public.challenge_weekly_winners from anon, authenticated;
grant select on public.challenge_weekly_winners to authenticated;

-- The rounds of one challenge. Pure arithmetic on its dates and setting.
create or replace function public.weekly_rounds(p_challenge uuid)
returns table (round int, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable
set search_path to 'public'
as $$
declare
  v_start timestamptz; v_end timestamptz; v_days int; v_step interval; v_n int; v_i int; v_last_end timestamptz;
begin
  select c.start_date, c.end_date, greatest(1, least(31, coalesce((c.weekly_prize ->> 'every_days')::int, 7)))
    into v_start, v_end, v_days
    from public.challenges c where c.id = p_challenge and c.weekly_prize is not null;
  if v_start is null or v_end is null or v_end <= v_start then return; end if;
  v_step := make_interval(days => v_days);
  v_n := greatest(1, floor(extract(epoch from (v_end - v_start)) / extract(epoch from v_step))::int);
  -- A remainder of half a round or more is a round of its own; a shorter one joins the last.
  if v_start + v_step * v_n < v_end and (v_end - (v_start + v_step * v_n)) >= v_step / 2 then v_n := v_n + 1; end if;
  for v_i in 1 .. v_n loop
    round := v_i;
    starts_at := v_start + v_step * (v_i - 1);
    ends_at := case when v_i = v_n then v_end else v_start + v_step * v_i end;
    return next;
  end loop;
end $$;

-- The entries a round is decided between, best first. `p_group` null = the whole challenge (no groups).
create or replace function public.weekly_round_entries(p_challenge uuid, p_group uuid, p_from timestamptz, p_to timestamptz)
returns table (submission_id uuid, creator_id uuid, views bigint, posted timestamptz)
language sql stable
set search_path to 'public'
as $$
  select s.id, s.creator_id, coalesce(s.logged_views, 0)::bigint, coalesce(s.posted_at, s.submitted_at)
    from public.submissions s
   where s.challenge_id = p_challenge
     and coalesce(s.posted_at, s.submitted_at) >= p_from
     and coalesce(s.posted_at, s.submitted_at) < p_to
     and (p_group is null or exists (
           select 1 from public.challenge_group_members gm
            where gm.challenge_id = p_challenge and gm.creator_id = s.creator_id and gm.group_id = p_group))
   order by coalesce(s.logged_views, 0) desc, coalesce(s.posted_at, s.submitted_at) asc, s.id
$$;

-- THE WEEKLY BOARD, for the challenge page and the results page: every round, every board, its top five (a frozen
-- round shows its winner first with the views it was judged on). Read with the reader's own rights.
create or replace function public.weekly_prize_board(p_challenge uuid, p_top int default 5)
returns table (
  round int, starts_at timestamptz, ends_at timestamptz, group_id uuid, group_name text, state text,
  place int, submission_id uuid, creator_id uuid, name text, photo_url text, views bigint, platform text,
  video_url text, row_id uuid, reward_id uuid, awarded_at timestamptz
)
language sql stable
set search_path to 'public'
as $$
  with boards as (
    select g.id as gid, g.name as gname from public.challenge_groups g where g.challenge_id = p_challenge
    union all
    select null::uuid, null::text where not exists (select 1 from public.challenge_groups g where g.challenge_id = p_challenge)
  ),
  rounds as (select * from public.weekly_rounds(p_challenge)),
  cells as (
    select r.round, r.starts_at, r.ends_at, b.gid, b.gname, w.id as wid, w.locked_at, w.submission_id as wsub,
           w.creator_id as wcreator, w.views as wviews, w.reward_id as wreward, w.awarded_at as wawarded,
           case when w.awarded_at is not null then 'awarded'
                when w.locked_at is not null then 'ready'
                when r.ends_at <= now() then 'reading'
                when r.starts_at <= now() then 'live'
                else 'upcoming' end as state
      from rounds r cross join boards b
      left join public.challenge_weekly_winners w
        on w.challenge_id = p_challenge and w.round = r.round and w.group_id is not distinct from b.gid
  ),
  picks as (
    -- Frozen: the winner as judged. Otherwise: the live top of that round's entries.
    select c.*, 1 as place, c.wsub as sid, c.wcreator as cid, c.wviews as v
      from cells c where c.locked_at is not null
    union all
    select c.*, e.place::int, e.submission_id, e.creator_id, e.views
      from cells c
      cross join lateral (
        select x.*, row_number() over (order by x.views desc, x.posted asc, x.submission_id) as place
          from public.weekly_round_entries(p_challenge, c.gid, c.starts_at, c.ends_at) x
         limit greatest(1, least(p_top, 20))
      ) e
     where c.locked_at is null and c.state <> 'upcoming'
    union all
    select c.*, null::int, null::uuid, null::uuid, null::bigint
      from cells c where c.state = 'upcoming'
  )
  select p.round, p.starts_at, p.ends_at, p.gid, p.gname, p.state, p.place, p.sid, p.cid,
         pr.name, pr.photo_url, p.v, s.platform, s.video_url, p.wid, p.wreward, p.wawarded
    from picks p
    left join public.profiles pr on pr.id = p.cid
    left join public.submissions s on s.id = p.sid
   order by p.round, p.gname nulls first, p.place nulls last
$$;
grant execute on function public.weekly_prize_board(uuid, int) to authenticated;
grant execute on function public.weekly_rounds(uuid) to authenticated;
grant execute on function public.weekly_round_entries(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- Freeze one row's winner from the current readings.
create or replace function public.weekly_prize_lock_internal(p_row uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare w record; e record;
begin
  select * into w from public.challenge_weekly_winners where id = p_row for update;
  if w.id is null or w.awarded_at is not null then return; end if;
  select * into e from public.weekly_round_entries(w.challenge_id, w.group_id, w.starts_at, w.ends_at) limit 1;
  update public.challenge_weekly_winners
     set submission_id = e.submission_id, creator_id = e.creator_id, views = e.views, locked_at = now()
   where id = p_row;
end $$;

-- THE HOURLY TICK. Cheap when nothing is due: one query over challenges that have a weekly prize.
create or replace function public.weekly_prize_tick()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'private', 'extensions'
as $$
declare
  c record; r record; b record; w record;
  v_new int := 0; v_locked int := 0; v_ids jsonb;
  secret text := (select value from private.config where key = 'webhook_secret');
  v_admin record; v_who text; v_title text;
begin
  for c in
    select ch.id, ch.title from public.challenges ch
     where ch.weekly_prize is not null and coalesce(ch.status, '') <> 'draft'
       and ch.start_date <= now() and ch.end_date > now() - interval '3 days'
  loop
    for r in select * from public.weekly_rounds(c.id) x where x.ends_at <= now() loop
      for b in
        select g.id as gid from public.challenge_groups g where g.challenge_id = c.id
        union all
        select null::uuid where not exists (select 1 from public.challenge_groups g where g.challenge_id = c.id)
      loop
        if exists (select 1 from public.challenge_weekly_winners x
                    where x.challenge_id = c.id and x.round = r.round and x.group_id is not distinct from b.gid) then
          continue;
        end if;
        insert into public.challenge_weekly_winners (challenge_id, group_id, round, starts_at, ends_at, read_requested_at)
        values (c.id, b.gid, r.round, r.starts_at, r.ends_at, now());
        v_new := v_new + 1;
        -- ONE LAST READING of the round's front runners (and anything never read) before the winner is frozen.
        select coalesce(jsonb_agg(e.submission_id), '[]'::jsonb) into v_ids
          from (select submission_id from public.weekly_round_entries(c.id, b.gid, r.starts_at, r.ends_at) limit 40) e;
        if jsonb_array_length(v_ids) > 0 then
          begin
            perform net.http_post(
              url := public.edge_function_url('view-sync'),
              headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(secret, '')),
              body := jsonb_build_object('submission_ids', v_ids)
            );
          exception when others then null;
          end;
        end if;
      end loop;
    end loop;
  end loop;

  -- An hour after the reading was asked for, freeze and tell the team.
  for w in
    select x.*, ch.title from public.challenge_weekly_winners x join public.challenges ch on ch.id = x.challenge_id
     where x.locked_at is null and x.read_requested_at < now() - interval '50 minutes'
  loop
    perform public.weekly_prize_lock_internal(w.id);
    v_locked := v_locked + 1;
    select pr.name into v_who from public.challenge_weekly_winners x join public.profiles pr on pr.id = x.creator_id where x.id = w.id;
    v_title := 'Video of the Week ready: week ' || w.round;
    for v_admin in select id from public.profiles where platform_role in ('global_admin', 'owner') and coalesce(is_test, false) = false loop
      perform public.notify_user(v_admin.id, 'reward', v_title,
        coalesce(v_who || ' has the most viewed video of week ' || w.round || ' in ' || w.title || '. Check it and award it.',
                 'Nobody posted in week ' || w.round || ' of ' || w.title || '.'),
        '/admin/challenges/' || w.challenge_id || '/results#weekly');
    end loop;
  end loop;
  return jsonb_build_object('rounds_opened', v_new, 'locked', v_locked);
end $$;

-- AWARD: the team's press. `p_type` overrides cash/voucher for this one prize.
create or replace function public.award_weekly_prize(p_row uuid, p_type text default null)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $$
declare w record; c record; v_type text; v_amount numeric; v_cur text; v_reward uuid;
begin
  if not public.is_global_admin() then raise exception 'Only the team can award prizes.'; end if;
  select * into w from public.challenge_weekly_winners where id = p_row for update;
  if w.id is null then raise exception 'No such round.'; end if;
  if w.awarded_at is not null then return w.reward_id; end if;
  if w.locked_at is null then raise exception 'This round is still being read. Try again in a few minutes.'; end if;
  if w.creator_id is null then raise exception 'Nobody posted in this round.'; end if;
  select * into c from public.challenges where id = w.challenge_id;
  v_type := coalesce(nullif(p_type, ''), c.weekly_prize ->> 'type', 'voucher');
  if v_type not in ('cash', 'voucher') then raise exception 'A prize is cash or a voucher.'; end if;
  v_amount := coalesce((c.weekly_prize ->> 'amount')::numeric, 0);
  v_cur := coalesce(c.weekly_prize ->> 'currency', c.prize_currency, 'EUR');
  if v_amount <= 0 then raise exception 'Set the Video of the Week amount on the challenge first.'; end if;
  insert into public.rewards (creator_id, challenge_id, reward_type, amount, currency, status, payment_notes,
                              community_id, source, prize_slot)
  values (w.creator_id, w.challenge_id, v_type, v_amount, v_cur, 'pending',
          format('Video of the Week, week %s - %s', w.round, c.title), c.community_id, 'challenge', 'weekly')
  returning id into v_reward;
  update public.challenge_weekly_winners set reward_id = v_reward, awarded_at = now(), awarded_by = auth.uid() where id = p_row;
  perform public.notify_user(w.creator_id, 'reward', 'You won the Video of the Week! 🏆',
    format('Your video had the most views in week %s of %s. A %s %s is on its way to your Rewards page.',
           w.round, c.title, regexp_replace(to_char(v_amount, 'FM999990.00'), '\.00$', '') || ' ' || v_cur,
           case when v_type = 'cash' then 'cash prize' else 'Tryp.com voucher' end),
    '/rewards');
  return v_reward;
end $$;

-- RE-FREEZE from the latest readings (an entry was disqualified, a number was corrected). Never after the award.
create or replace function public.weekly_prize_refresh(p_row uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not public.is_global_admin() then raise exception 'Only the team can do this.'; end if;
  perform public.weekly_prize_lock_internal(p_row);
end $$;

-- ---------------------------------------------------------------- rank alerts
create table if not exists public.rank_alerts (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  creator_id   uuid not null references public.profiles(id) on delete cascade,
  last_rank    int,
  sent_at      timestamptz not null default now(),
  primary key (challenge_id, creator_id)
);
create index if not exists rank_alerts_creator on public.rank_alerts (creator_id);
alter table public.rank_alerts enable row level security;
revoke all on public.rank_alerts from anon, authenticated;

create or replace function public.rank_alert_text(p_locale text, p_kind text, p jsonb)
returns text
language plpgsql immutable
set search_path to 'public'
as $$
declare
  l text := lower(left(coalesce(p_locale, 'en'), 2));
  t text;
  unit text;
begin
  unit := case when p ->> 'unit' = 'points'
    then case l when 'es' then 'puntos' when 'pt' then 'pontos' when 'de' then 'Punkte' when 'ro' then 'puncte' else 'points' end
    else case l when 'es' then 'visualizaciones' when 'pt' then 'visualizações' when 'de' then 'Aufrufe' when 'ro' then 'vizualizări' else 'views' end end;
  t := case p_kind
    when 'up_title' then case l
      when 'es' then 'Has subido al puesto {n}' when 'pt' then 'Subiste para o {n}º lugar'
      when 'de' then 'Du bist auf Platz {n} aufgestiegen' when 'ro' then 'Ai urcat pe locul {n}' else 'You moved up to #{n}' end
    when 'up_body' then case l
      when 'es' then '{c}: antes eras el {o}º.' when 'pt' then '{c}: estavas em {o}º.'
      when 'de' then '{c}: vorher Platz {o}.' when 'ro' then '{c}: înainte erai pe locul {o}.' else '{c}: up from #{o}.' end
    when 'up_prize' then case l
      when 'es' then ' Estás en los puestos con premio.' when 'pt' then ' Estás nos lugares com prémio.'
      when 'de' then ' Du bist auf einem Gewinnplatz.' when 'ro' then ' Ești pe un loc premiat.' else ' You are in the prize places.' end
    when 'up_gap' then case l
      when 'es' then ' Te faltan {g} {u} para el puesto {a}.' when 'pt' then ' Faltam {g} {u} para o {a}º lugar.'
      when 'de' then ' Noch {g} {u} bis Platz {a}.' when 'ro' then ' Mai ai {g} {u} până la locul {a}.' else ' {g} {u} to #{a}.' end
    when 'top_title' then case l
      when 'es' then '¡Eres el número 1!' when 'pt' then 'Estás em 1º lugar!'
      when 'de' then 'Du bist auf Platz 1!' when 'ro' then 'Ești pe locul 1!' else 'You are #1!' end
    when 'down_title' then case l
      when 'es' then '{p} te ha adelantado' when 'pt' then '{p} passou-te à frente'
      when 'de' then '{p} hat dich überholt' when 'ro' then '{p} te-a depășit' else '{p} overtook you' end
    when 'down_body' then case l
      when 'es' then '{c}: ahora eres el {n}º.' when 'pt' then '{c}: estás agora em {n}º.'
      when 'de' then '{c}: Du bist jetzt auf Platz {n}.' when 'ro' then '{c}: acum ești pe locul {n}.' else '{c}: you are now #{n}.' end
    when 'down_gap' then case l
      when 'es' then ' Te faltan {g} {u} para recuperar el puesto {o}.' when 'pt' then ' Faltam {g} {u} para recuperar o {o}º lugar.'
      when 'de' then ' Noch {g} {u}, um Platz {o} zurückzuholen.' when 'ro' then ' Mai ai {g} {u} ca să recuperezi locul {o}.'
      else ' {g} {u} to take #{o} back.' end
    when 'down_prize' then case l
      when 'es' then ' Has salido de los puestos con premio, ¡recupéralo!' when 'pt' then ' Saíste dos lugares com prémio, recupera-o!'
      when 'de' then ' Du bist aus den Gewinnplätzen gerutscht, hol ihn dir zurück!' when 'ro' then ' Ai ieșit dintre locurile premiate, recuperează-l!'
      else ' You dropped out of the prize places. Take it back!' end
    else '' end;
  return replace(replace(replace(replace(replace(replace(replace(t,
    '{n}', coalesce(p ->> 'n', '')), '{o}', coalesce(p ->> 'o', '')), '{a}', coalesce(p ->> 'a', '')),
    '{g}', coalesce(p ->> 'g', '')), '{u}', unit), '{c}', coalesce(p ->> 'c', '')), '{p}', coalesce(p ->> 'p', ''));
end $$;

create or replace function public.notify_rank_changes()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare
  r record; ch record; v_places int; v_zone int; v_last record; v_big boolean; v_loc text;
  v_passer text; v_above bigint; v_gap bigint; v_unit text; v_title text; v_body text; v_p jsonb;
begin
  for r in
    select n.challenge_id, n.creator_id, n.group_id, o.rank as old_rank, n.rank as new_rank, n.final_views as score
      from new_rows n join old_rows o on o.challenge_id = n.challenge_id and o.creator_id = n.creator_id
     where o.rank is not null and n.rank is not null and o.rank <> n.rank
  loop
    begin
      select c.id, c.title, c.status, c.scoring, c.winners_published_at, c.end_date, c.winners_count, c.prize_structure
        into ch from public.challenges c where c.id = r.challenge_id;
      if ch.id is null or ch.status <> 'active' or ch.winners_published_at is not null or ch.end_date < now() then continue; end if;
      select coalesce(nullif(jsonb_array_length(coalesce(g.prize_structure, '[]'::jsonb)), 0), g.winners_count) into v_places
        from public.challenge_groups g where g.id = r.group_id;
      v_places := coalesce(v_places, ch.winners_count, nullif(jsonb_array_length(coalesce(ch.prize_structure, '[]'::jsonb)), 0), 3);
      v_zone := greatest(v_places + 5, 10);
      -- Up: only when you land in the zone. Down: only when you were in it.
      if (r.new_rank < r.old_rank and r.new_rank > v_zone) or (r.new_rank > r.old_rank and r.old_rank > v_zone) then continue; end if;
      v_big := r.new_rank = 1
        or (r.new_rank <= v_places and r.old_rank > v_places)
        or (r.old_rank <= v_places and r.new_rank > v_places);
      select * into v_last from public.rank_alerts a where a.challenge_id = r.challenge_id and a.creator_id = r.creator_id;
      if v_last.sent_at is not null and v_last.sent_at > now() - (case when v_big then interval '2 hours' else interval '12 hours' end) then continue; end if;
      if v_last.last_rank is not distinct from r.new_rank then continue; end if;

      -- Their chosen language, or (most never choose one) the language of their market.
      select coalesce(pr.locale, (
               select case when c.name ilike 'spain%' then 'es' when c.name ilike 'portugal%' then 'pt'
                           when c.name ilike 'germany%' then 'de' when c.name ilike 'romania%' then 'ro' end
                 from public.community_members m join public.communities c on c.id = m.community_id and c.kind = 'chapter'
                where m.profile_id = pr.id
                order by (c.name ilike 'spain%' or c.name ilike 'portugal%' or c.name ilike 'germany%' or c.name ilike 'romania%') desc
                limit 1), 'en')
        into v_loc from public.profiles pr where pr.id = r.creator_id;
      v_unit := case when ch.scoring = 'points' then 'points' else 'views' end;
      v_p := jsonb_build_object('c', ch.title, 'n', r.new_rank, 'o', r.old_rank, 'unit', v_unit);

      if r.new_rank < r.old_rank then
        select x.final_views into v_above from public.results x
         where x.challenge_id = r.challenge_id and x.group_id is not distinct from r.group_id and x.rank = r.new_rank - 1;
        v_gap := greatest(coalesce(v_above, 0) - coalesce(r.score, 0), 0);
        v_title := public.rank_alert_text(v_loc, case when r.new_rank = 1 then 'top_title' else 'up_title' end, v_p);
        v_body := public.rank_alert_text(v_loc, 'up_body', v_p)
          || case when r.new_rank > 1 and r.new_rank <= v_places then public.rank_alert_text(v_loc, 'up_prize', v_p)
                  when r.new_rank > 1 and v_gap > 0 then public.rank_alert_text(v_loc, 'up_gap', v_p || jsonb_build_object('g', to_char(v_gap, 'FM999G999G999'), 'a', r.new_rank - 1))
                  else '' end;
      else
        select split_part(coalesce(pr.name, ''), ' ', 1), x.final_views into v_passer, v_above
          from public.results x left join public.profiles pr on pr.id = x.creator_id
         where x.challenge_id = r.challenge_id and x.group_id is not distinct from r.group_id and x.rank = r.old_rank;
        if coalesce(v_passer, '') = '' then continue; end if;
        v_gap := greatest(coalesce(v_above, 0) - coalesce(r.score, 0), 0);
        v_p := v_p || jsonb_build_object('p', v_passer, 'g', to_char(v_gap, 'FM999G999G999'));
        v_title := public.rank_alert_text(v_loc, 'down_title', v_p);
        v_body := public.rank_alert_text(v_loc, 'down_body', v_p)
          || case when r.old_rank <= v_places and r.new_rank > v_places then public.rank_alert_text(v_loc, 'down_prize', v_p)
                  when v_gap > 0 then public.rank_alert_text(v_loc, 'down_gap', v_p)
                  else '' end;
      end if;

      perform public.notify_user(r.creator_id, 'rank', v_title, v_body, '/challenges/' || r.challenge_id || '?tab=leaderboard');
      insert into public.rank_alerts (challenge_id, creator_id, last_rank, sent_at)
      values (r.challenge_id, r.creator_id, r.new_rank, now())
      on conflict (challenge_id, creator_id) do update set last_rank = excluded.last_rank, sent_at = excluded.sent_at;
    exception when others then
      -- An alert must never stop a leaderboard from saving.
      null;
    end;
  end loop;
  return null;
end $$;

drop trigger if exists trg_results_rank_alerts on public.results;
create trigger trg_results_rank_alerts
  after update on public.results
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.notify_rank_changes();

-- ---------------------------------------------------------------- grants and the cron
insert into public.owner_only_rpcs (proname, why)
select x.p, x.w from (values
  ('weekly_prize_tick', 'cron: opens and freezes Video of the Week rounds'),
  ('weekly_prize_lock_internal', 'freezes one round; reached through weekly_prize_refresh and the tick'),
  ('notify_rank_changes', 'trigger on results')
) x(p, w)
where not exists (select 1 from public.owner_only_rpcs o where o.proname = x.p);
select public.lock_down_definer_functions();

select cron.unschedule(jobid) from cron.job where jobname = 'weekly-prize';
select cron.schedule('weekly-prize', '17 * * * *', 'select public.weekly_prize_tick()');

-- 435b (applied separately): the invoker functions are for signed-in readers only.
revoke all on function public.weekly_prize_board(uuid, int) from public, anon;
revoke all on function public.weekly_rounds(uuid) from public, anon;
revoke all on function public.weekly_round_entries(uuid, uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.rank_alert_text(text, text, jsonb) from public, anon;
grant execute on function public.weekly_prize_board(uuid, int) to authenticated;
grant execute on function public.weekly_rounds(uuid) to authenticated;
grant execute on function public.weekly_round_entries(uuid, uuid, timestamptz, timestamptz) to authenticated;
