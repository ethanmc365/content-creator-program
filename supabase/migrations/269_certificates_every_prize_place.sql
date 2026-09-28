-- 269: A CERTIFICATE FOR EVERY PRIZE PLACE, AND DESIGN OPTIONS (28 Sep 2026).
--
-- Ethan: "there should be a different one for each place. So for example,
-- everyone that wins the Tryp.com challenge should get one, but obviously
-- first, second, third, fourth, fifth should be different ... And it should
-- only go to how many places are on it. So there's 10 for the worldwide
-- challenge ... for the previous UK challenge there was only three."
--
-- `all_prize_places`: award to every place the CHALLENGE pays, however many
-- that is (its winners_count, or the length of its prize structure) - so one
-- design covers a 3-place and a 10-place challenge correctly. The card draws
-- each place differently from `facts.place`. `places` goes into the facts too,
-- so a certificate can say "1st of 10".
--
-- `options`: small per-design switches the studio sets (show the plane, show
-- the route, show the place medal, the line above the name). jsonb so a new
-- switch never needs a migration.
--
-- Both are additive. Existing designs keep `ranks` exactly as before.

alter table public.certificate_designs
  add column if not exists all_prize_places boolean not null default false,
  add column if not exists options jsonb not null default '{}'::jsonb;

-- How many places a challenge pays.
create or replace function public.challenge_prize_places(p_challenge uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select greatest(
    coalesce(c.winners_count, 0),
    case when jsonb_typeof(c.prize_structure) = 'array' then jsonb_array_length(c.prize_structure) else 0 end
  )
  from public.challenges c where c.id = p_challenge;
$$;

create or replace function public.award_challenge_certificates_internal(p_challenge uuid)
returns integer
language plpgsql security definer set search_path = public
as $function$
declare
  ch       record;
  made     integer := 0;
  before   integer;
  v_places integer;
begin
  select c.id, c.title, c.community_id, c.end_date, com.name as market_name
    into ch
  from public.challenges c
  left join public.communities com on com.id = c.community_id
  where c.id = p_challenge;
  if not found then return 0; end if;
  v_places := coalesce(public.challenge_prize_places(p_challenge), 0);

  select count(*) into before from public.certificate_awards where challenge_id = p_challenge;

  -- PODIUM / PRIZE-PLACE CERTIFICATES, from the published results.
  insert into public.certificate_awards
    (design_id, profile_id, challenge_id, community_id, facts, serial)
  select d.id, r.creator_id, ch.id, ch.community_id,
         jsonb_strip_nulls(jsonb_build_object(
           'name',      p.name,
           'challenge', ch.title,
           'market',    ch.market_name,
           'place',     r.rank,
           'places',    nullif(v_places, 0),
           'views',     nullif(r.final_views, 0),
           'date',      coalesce(ch.end_date, now())
         )),
         public.certificate_serial()
  from public.certificate_designs d
  join public.results r on r.challenge_id = ch.id
  join public.profiles p on p.id = r.creator_id
  where d.is_active
    and d.award_on = 'challenge_rank'
    and (r.rank = any(d.ranks) or (d.all_prize_places and r.rank between 1 and v_places))
    and (cardinality(d.community_ids) = 0 or ch.community_id = any(d.community_ids))
  on conflict do nothing;

  -- TOOK PART.
  insert into public.certificate_awards
    (design_id, profile_id, challenge_id, community_id, facts, serial)
  select d.id, s.creator_id, ch.id, ch.community_id,
         jsonb_strip_nulls(jsonb_build_object(
           'name',      p.name,
           'challenge', ch.title,
           'market',    ch.market_name,
           'date',      coalesce(ch.end_date, now())
         )),
         public.certificate_serial()
  from public.certificate_designs d
  join (select distinct creator_id from public.submissions where challenge_id = p_challenge) s on true
  join public.profiles p on p.id = s.creator_id
  where d.is_active
    and d.award_on = 'challenge_entry'
    and (cardinality(d.community_ids) = 0 or ch.community_id = any(d.community_ids))
  on conflict do nothing;

  select count(*) - before into made from public.certificate_awards where challenge_id = p_challenge;
  return made;
end $function$;

create or replace function public.certificate_candidates(p_design uuid)
returns table(profile_id uuid, creator_name text, challenge_title text, place integer, facts jsonb, already boolean)
language sql stable security definer set search_path = public
as $function$
  with d as (select * from public.certificate_designs where id = p_design)
  select r.creator_id, p.name, c.title, r.rank,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', c.title, 'market', com.name,
           'place', r.rank, 'places', nullif(public.challenge_prize_places(c.id), 0),
           'views', nullif(r.final_views, 0),
           'date', coalesce(c.end_date, now())
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = r.creator_id
                   and a.challenge_id = c.id)
  from d
  join public.challenges c on c.winners_published_at is not null
  join public.results r on r.challenge_id = c.id
  join public.profiles p on p.id = r.creator_id
  left join public.communities com on com.id = c.community_id
  where d.award_on = 'challenge_rank'
    and (r.rank = any(d.ranks) or (d.all_prize_places and r.rank between 1 and coalesce(public.challenge_prize_places(c.id), 0)))
    and (cardinality(d.community_ids) = 0 or c.community_id = any(d.community_ids))

  union all

  select s.creator_id, p.name, c.title, null::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', c.title, 'market', com.name,
           'date', coalesce(c.end_date, now())
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = s.creator_id
                   and a.challenge_id = c.id)
  from d
  join public.challenges c on c.winners_published_at is not null
  join (select distinct creator_id, challenge_id from public.submissions) s on s.challenge_id = c.id
  join public.profiles p on p.id = s.creator_id
  left join public.communities com on com.id = c.community_id
  where d.award_on = 'challenge_entry'
    and (cardinality(d.community_ids) = 0 or c.community_id = any(d.community_ids))

  union all

  select cm.profile_id, p.name, m.title, null::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'milestone', m.title, 'date', cm.reached_at
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = cm.profile_id
                   and a.milestone_id = cm.milestone_id)
  from d
  join public.creator_milestones cm on cm.milestone_id = d.milestone_id
  join public.profiles p on p.id = cm.profile_id
  join public.milestones m on m.id = cm.milestone_id
  where d.award_on = 'milestone' and d.milestone_id is not null;
$function$;

-- The verify page draws the certificate from this, so it has to carry every
-- field the card reads - the new options and the trigger included.
create or replace function public.verify_certificate(p_serial text)
returns json
language sql stable security definer set search_path = public
as $function$
  select json_build_object(
    'serial',      a.serial,
    'title',       d.title,
    'subtitle',    d.subtitle,
    'body',        d.body,
    'tier',        d.tier,
    'accent',      d.accent,
    'emblem',      d.emblem,
    'pattern',     d.pattern,
    'layout',      d.layout,
    'paper',       d.paper,
    'signature',   d.signature,
    'signature_role', d.signature_role,
    'footnote',    d.footnote,
    'award_on',    d.award_on,
    'options',     d.options,
    'facts',       a.facts,
    'awarded_at',  a.awarded_at
  )
  from public.certificate_awards a
  join public.certificate_designs d on d.id = a.design_id
  join public.profiles p on p.id = a.profile_id
  where upper(btrim(a.serial)) = upper(btrim(p_serial))
    and p.status = 'active'
    and p.deletion_requested_at is null;
$function$;
