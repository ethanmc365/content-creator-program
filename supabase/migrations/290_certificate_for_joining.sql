-- 290: an "Official creator" certificate for everybody who joins.
--
-- Ethan, 30 Sep 2026: "Official creator one: this will be given to every creator that joins." And
-- "I give you permission to properly set it up. Don't turn anything live yet." So:
--
--   award_on = 'creator_joined'  a new trigger kind, beside challenge_rank / challenge_entry /
--                                milestone / manual.
--   on_creator_joined_certificate  fires when a profile becomes active (approved, or created active)
--                                and awards every ACTIVE design of that kind. Wrapped in its own
--                                exception block, like the other two paths: a certificate must
--                                never be able to stop somebody being approved.
--   certificate_candidates       gains the same rule, so the studio's "Who gets this" and its
--                                backfill button cover every creator who joined before today.
--
-- NOTHING IS LIVE: designs arrive as drafts (is_active = false) and `certificates_live` stays off, so
-- no creator sees or receives anything until Ethan switches both on.

alter table public.certificate_designs drop constraint if exists certificate_designs_award_on_check;
alter table public.certificate_designs add constraint certificate_designs_award_on_check
  check (award_on = any (array['manual', 'challenge_rank', 'challenge_entry', 'milestone', 'creator_joined']));

-- The market a person belongs to, for the certificate's wording: their home market, else any market
-- they are in, else nothing (the card then says Worldwide).
create or replace function public.creator_market_name(p_profile uuid)
returns text
language sql stable security definer set search_path to 'public'
as $$
  select c.name
  from public.community_members m
  join public.communities c on c.id = m.community_id
  where m.profile_id = p_profile and c.kind = 'chapter' and c.retired_at is null
    and coalesce(m.status, 'active') = 'active'
  order by m.is_home desc nulls last, m.joined_at
  limit 1
$$;
revoke all on function public.creator_market_name(uuid) from public, anon, authenticated;

create or replace function public.award_joined_certificates_internal(p_profile uuid)
returns integer
language plpgsql security definer set search_path to 'public'
as $$
declare
  made integer := 0;
begin
  insert into public.certificate_awards (design_id, profile_id, facts, serial)
  select d.id, p.id,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name,
           'market', public.creator_market_name(p.id),
           'date', now()
         )),
         public.certificate_serial()
  from public.certificate_designs d
  join public.profiles p on p.id = p_profile
  where d.is_active
    and d.award_on = 'creator_joined'
    and p.status = 'active'
    and not coalesce(p.is_test, false)
    and not coalesce(p.is_admin, false)
    and (cardinality(d.community_ids) = 0 or exists (
      select 1 from public.community_members m where m.profile_id = p.id and m.community_id = any(d.community_ids)))
  on conflict do nothing;
  get diagnostics made = row_count;
  return made;
end $$;
revoke all on function public.award_joined_certificates_internal(uuid) from public, anon, authenticated;

create or replace function public.on_creator_joined_certificate()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    begin
      perform public.award_joined_certificates_internal(new.id);
    exception when others then
      perform public.report_system_error(
        'certificates', 'joined-award',
        'Could not award the joining certificate to ' || coalesce(new.name, '?') || ': ' || coalesce(sqlerrm, 'unknown'));
    end;
  end if;
  return new;
end $$;
revoke all on function public.on_creator_joined_certificate() from public, anon, authenticated;

drop trigger if exists award_joined_certificate on public.profiles;
create trigger award_joined_certificate
  after insert or update of status on public.profiles
  for each row execute function public.on_creator_joined_certificate();

-- The studio's "Who gets this" + backfill: the three existing rules unchanged, plus everybody active.
create or replace function public.certificate_candidates(p_design uuid)
 returns table(profile_id uuid, creator_name text, challenge_title text, place integer, facts jsonb, already boolean)
 language sql
 stable security definer
 set search_path to 'public'
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
    and ((r.rank = any(d.ranks) and (coalesce(public.challenge_prize_places(c.id), 0) = 0 or r.rank <= public.challenge_prize_places(c.id))) or (d.all_prize_places and r.rank between 1 and coalesce(public.challenge_prize_places(c.id), 0)))
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
  where d.award_on = 'milestone' and d.milestone_id is not null

  union all

  select p.id, p.name, null::text, null::integer,
         jsonb_strip_nulls(jsonb_build_object(
           'name', p.name, 'market', public.creator_market_name(p.id), 'date', p.created_at
         )),
         exists (select 1 from public.certificate_awards a
                 where a.design_id = p_design and a.profile_id = p.id
                   and a.challenge_id is null and a.milestone_id is null)
  from d
  join public.profiles p on p.status = 'active' and not coalesce(p.is_test, false) and not coalesce(p.is_admin, false)
  where d.award_on = 'creator_joined'
    and (cardinality(d.community_ids) = 0 or exists (
      select 1 from public.community_members m where m.profile_id = p.id and m.community_id = any(d.community_ids)));
$function$;

-- The self-test learns the new path too (run it after touching any award function).
create or replace function public.certificate_selftest()
 returns table(handler text, survived boolean, note text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    perform public.report_system_error('certificates', 'selftest', 'Self test, ignore.');
    perform public.clear_system_error('certificates', 'selftest');
    handler := 'report_system_error'; survived := true; note := 'callable with 3 args';
  exception when others then
    handler := 'report_system_error'; survived := false; note := sqlerrm;
  end;
  return next;

  begin
    perform public.award_challenge_certificates_internal('00000000-0000-0000-0000-000000000000');
    handler := 'award_challenge_certificates_internal'; survived := true; note := 'unknown challenge is a no-op';
  exception when others then
    handler := 'award_challenge_certificates_internal'; survived := false; note := sqlerrm;
  end;
  return next;

  begin
    perform * from public.certificate_candidates('00000000-0000-0000-0000-000000000000');
    handler := 'certificate_candidates'; survived := true; note := 'unknown design returns nothing';
  exception when others then
    handler := 'certificate_candidates'; survived := false; note := sqlerrm;
  end;
  return next;

  begin
    perform public.award_joined_certificates_internal('00000000-0000-0000-0000-000000000000');
    handler := 'award_joined_certificates_internal'; survived := true; note := 'unknown profile is a no-op';
  exception when others then
    handler := 'award_joined_certificates_internal'; survived := false; note := sqlerrm;
  end;
  return next;
end $function$;
