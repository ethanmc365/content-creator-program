-- 167: how many logged flights have no aircraft on them.
--
-- Ethan: "on the community flight log it's still showing that we're only flying
-- one plane even though it's obviously multiple - and I think Jacob selected
-- other ones too."
--
-- THE PAGE WAS TELLING THE TRUTH, which is why this is a reporting fix and not
-- a data fix. At the time of writing there are 45 flights in production from
-- non-test creators. FOUR of them carry an aircraft, and all four are the same
-- Airbus A320. Jacob's twenty-seven were all entered in one sitting on 28
-- August and not one has an aircraft on it - the field is optional, it is
-- several fields down the form, and in a bulk backfill it is the first thing
-- anybody skips.
--
-- So "Aircrafts: 1" is correct and reads as broken, which is a worse failure
-- than being wrong: there is nothing on the page that could tell you the
-- difference between "the community has flown one type" and "nobody filled the
-- box in". This is the number that tells you, so the wall can say so and ask.
--
-- Counted the same way `community_aircraft` counts: shared, already flown, real
-- creators only. Two functions reading one population differently is how a
-- page ends up contradicting itself.
create or replace function public.community_aircraft_gap()
returns table(flights_without_aircraft bigint, creators_without bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(*)::bigint,
         count(distinct f.creator_id)::bigint
    from public.flights f
    join public.profiles p on p.id = f.creator_id
   where f.share_with_community
     and coalesce(btrim(f.aircraft), '') = ''
     and f.flown_on <= current_date
     and p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null;
$function$;

revoke all on function public.community_aircraft_gap() from public;
grant execute on function public.community_aircraft_gap() to authenticated;
