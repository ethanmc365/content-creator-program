-- CERTIFICATES AWARD THEMSELVES.
--
-- Ethan: "Will need to build the functionality for the certificates to
-- automatically be given out for certain criteria like winning global
-- challenge, market challenge... Also be able to add certificates to certain
-- milestones and creators will receive them then."
--
-- APPLIED 16 Sep 2026 as `certificates_award_themselves`. See 221 for the
-- tables and for why a certificate freezes its facts.
--
-- THE RULE THIS WHOLE FILE IS WRITTEN AROUND, and it is the migrations README's
-- rule, bought with a real outage: A BOOKKEEPING SIDE-EFFECT MUST NEVER BE ABLE
-- TO ABORT THE THING IT IS BOOKKEEPING. Prizes, invoices and notifications all
-- ride on `challenges.winners_published_at`. A certificate is a nice picture. A
-- certificate design with a bad placeholder must not be able to stop a creator
-- being paid, so every automatic path below is inside its own exception block
-- that reports a system error and carries on.

-- A SHORT CREDENTIAL ID, PRINTED ON THE FACE OF IT.
-- Readable out loud, so a brand can be told what to ask for. Ambiguous
-- characters are left out of the alphabet on purpose: O/0 and I/1 are the two
-- pairs that make a person read a code back wrong.
create or replace function public.certificate_serial()
returns text language plpgsql volatile security definer set search_path to 'public' as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  i integer;
begin
  for attempt in 1..10 loop
    candidate := 'TRYP-' || to_char(now(), 'YYYY') || '-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from public.certificate_awards where serial = candidate) then
      return candidate;
    end if;
  end loop;
  -- Ten collisions in a 32^6 space means something is very wrong; fall back to
  -- something that cannot collide rather than raising inside an award.
  return 'TRYP-' || to_char(now(), 'YYYY') || '-' || replace(gen_random_uuid()::text, '-', '');
end $$;

-- AWARD EVERY CERTIFICATE A CHALLENGE'S RESULTS HAVE EARNED.
--
-- Idempotent by construction: `certificate_awards_once` makes a second run a
-- no-op rather than a duplicate, which matters because publishing winners is a
-- thing admins do more than once (a correction, a re-rank, a late entry).
create or replace function public.award_challenge_certificates_internal(p_challenge uuid)
returns integer language plpgsql volatile security definer set search_path to 'public' as $$
declare
  ch     record;
  made   integer := 0;
  before integer;
begin
  select c.id, c.title, c.community_id, c.end_date, com.name as market_name
    into ch
  from public.challenges c
  left join public.communities com on com.id = c.community_id
  where c.id = p_challenge;
  if not found then return 0; end if;

  select count(*) into before from public.certificate_awards where challenge_id = p_challenge;

  -- PODIUM CERTIFICATES, from the published results.
  insert into public.certificate_awards
    (design_id, profile_id, challenge_id, community_id, facts, serial)
  select d.id, r.creator_id, ch.id, ch.community_id,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', ch.title, 'market', ch.market_name,
           'place', r.rank, 'views', nullif(r.final_views, 0),
           'date', coalesce(ch.end_date, now())
         )),
         public.certificate_serial()
  from public.certificate_designs d
  join public.results r on r.challenge_id = ch.id
  join public.profiles p on p.id = r.creator_id
  where d.is_active
    and d.award_on = 'challenge_rank'
    and r.rank = any(d.ranks)
    -- AN EMPTY MARKET LIST MEANS EVERY MARKET. Ethan asked for both and the
    -- common case is "all of them", which nobody should have to spell out.
    and (cardinality(d.community_ids) = 0 or ch.community_id = any(d.community_ids))
  on conflict do nothing;

  -- TOOK PART. Off the SUBMISSIONS rather than the results, because a creator
  -- who entered and did not place has no results row on some scorings, and
  -- "you took part" is exactly the certificate that person should get.
  insert into public.certificate_awards
    (design_id, profile_id, challenge_id, community_id, facts, serial)
  select d.id, s.creator_id, ch.id, ch.community_id,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', ch.title, 'market', ch.market_name,
           'date', coalesce(ch.end_date, now())
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
end $$;

-- REACHING A MILESTONE EARNS ITS CERTIFICATE.
create or replace function public.on_milestone_certificate()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    insert into public.certificate_awards
      (design_id, profile_id, milestone_id, facts, serial)
    select d.id, new.profile_id, new.milestone_id,
           jsonb_strip_nulls(jsonb_build_object(
             'name', p.name, 'milestone', m.title, 'date', new.reached_at
           )),
           public.certificate_serial()
    from public.certificate_designs d
    join public.profiles p on p.id = new.profile_id
    join public.milestones m on m.id = new.milestone_id
    where d.is_active and d.award_on = 'milestone' and d.milestone_id = new.milestone_id
    on conflict do nothing;
  exception when others then
    -- See the rule at the top of this file. Reaching a milestone is the FACT;
    -- the picture is a nicety, and a nicety does not get to veto a fact.
    perform public.report_system_error(
      'certificate-milestone',
      'Could not award a milestone certificate: ' || coalesce(sqlerrm, 'unknown'));
  end;
  return new;
end $$;

drop trigger if exists award_milestone_certificate on public.creator_milestones;
create trigger award_milestone_certificate
  after insert on public.creator_milestones
  for each row execute function public.on_milestone_certificate();

-- PUBLISHING WINNERS AWARDS THE CERTIFICATES TOO.
--
-- A SEPARATE TRIGGER FROM `on_winners_published`, AND WRAPPED. Prizes and
-- invoices ride on that one.
create or replace function public.on_winners_certificates()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.winners_published_at is not null
     and (tg_op = 'INSERT' or old.winners_published_at is distinct from new.winners_published_at) then
    begin
      perform public.award_challenge_certificates_internal(new.id);
    exception when others then
      perform public.report_system_error(
        'certificate-challenge',
        'Could not award certificates for "' || coalesce(new.title, '?') || '": ' || coalesce(sqlerrm, 'unknown'));
    end;
  end if;
  return new;
end $$;

drop trigger if exists award_challenge_certificates on public.challenges;
create trigger award_challenge_certificates
  after insert or update of winners_published_at on public.challenges
  for each row execute function public.on_winners_certificates();

-- AWARDING ONE BY HAND. Admins only, and it writes the same frozen facts the
-- automatic path does so a hand-given certificate is not a second shape.
create or replace function public.award_certificate(
  p_design uuid, p_profile uuid, p_challenge uuid default null, p_note text default null)
returns uuid language plpgsql volatile security definer set search_path to 'public' as $$
declare
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can award a certificate';
  end if;
  insert into public.certificate_awards
    (design_id, profile_id, challenge_id, community_id, facts, serial, awarded_by)
  select p_design, p_profile, p_challenge, c.community_id,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'challenge', c.title, 'market', com.name,
           'note', nullif(btrim(coalesce(p_note, '')), ''), 'date', now()
         )),
         public.certificate_serial(), auth.uid()
  from public.profiles p
  left join public.challenges c on c.id = p_challenge
  left join public.communities com on com.id = c.community_id
  where p.id = p_profile
  on conflict do nothing
  returning id into new_id;
  return new_id;
end $$;
