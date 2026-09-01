-- WHO FLIES A ROUTE, EVERYBODY, NOT JUST OTHER PEOPLE.
--
-- `route_flyers` (103, tightened in 104) deliberately excludes the caller: it
-- powers "others on your routes", a section whose whole point is the word
-- "others". The community map's route card is a different question - Ethan:
-- "on the across the community trips it should provide some info, show the
-- creator's name and profile picture" - and there the exclusion reads as a bug,
-- because the card says "6 flights" over five faces and you are the sixth.
--
-- So this is a second function rather than a change to the first. Same shape,
-- same privacy rules, one clause less.
--
-- WHAT IT STILL WILL NOT SAY. Names, photos and a per-creator flight COUNT, and
-- nothing else - no date, no airline, no flight number, no note, no photograph.
-- That is the line migration 103 drew and this does not cross it: how often
-- somebody has flown a route is a fact about the route, and when they flew it
-- is their movement history.
create or replace function public.route_creators(p_a text, p_b text)
returns table (creator_id uuid, name text, photo_url text, flights bigint)
language sql
security definer
set search_path = public
stable
as $$
  select f.creator_id, p.name, p.photo_url, count(*)::bigint
    from public.flights f
    join public.profiles p on p.id = f.creator_id
   where f.share_with_community
     and least(f.from_iata, f.to_iata)    = least(upper(p_a), upper(p_b))
     and greatest(f.from_iata, f.to_iata) = greatest(upper(p_a), upper(p_b))
     and f.flown_on <= current_date
     and p.is_test = false
     and p.status = 'active'
     and p.deletion_requested_at is null
   group by f.creator_id, p.name, p.photo_url
   order by count(*) desc, p.name
   limit 24
$$;

revoke execute on function public.route_creators(text, text) from public;
revoke execute on function public.route_creators(text, text) from anon;
grant execute on function public.route_creators(text, text) to authenticated;
