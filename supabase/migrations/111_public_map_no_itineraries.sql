-- THE LANDING PAGE WAS TELLING THE INTERNET WHEN EACH CREATOR'S HOME IS EMPTY.
--
-- `public_creator_map()` is SECURITY DEFINER and executable by `anon` - it has
-- to be, it draws the community map on the signed-out marketing page, and that
-- map is the point of the page. Showing "here is where our creators are based"
-- to a visitor is the feature working.
--
-- But it also returned `trips`: every upcoming collab post, keyed by creator,
-- with the destination city and the EXACT START AND END DATES. Joined to the
-- `creators` array in the same payload, one unauthenticated request to
--
--     POST /rest/v1/rpc/public_creator_map
--
-- returned, for 44 named people: their full name, their photograph, the city
-- they live in, that city's latitude and longitude, and the precise dates they
-- will not be in it. No login, no rate limit, no referrer check. Most of this
-- community are young women.
--
-- That is not a vulnerability in the "somebody broke in" sense - the function
-- does exactly what it was written to do. It is worse than that, because
-- nothing was broken and it was working like this in the open. A stranger did
-- not need to attack anything; they needed to open the home page.
--
-- The marketing map does not need the itineraries. "Creators all over the
-- world" is made by the pins, not by the dates, and the trip layer exists so
-- MEMBERS can find each other to collaborate - which is what /collab is, behind
-- the login, where it belongs.
--
-- So: trips are returned to a signed-in member and to nobody else. The shape of
-- the response is unchanged (`trips` is an empty object for a visitor), so the
-- landing page and CreatorMap need no change at all - the signed-out map simply
-- draws home pins, and a member who lands on / before being redirected still
-- sees the full thing.
--
-- Home city and coordinates stay public. A creator typed that into a profile
-- whose whole purpose is to be seen, it is city-level rather than an address,
-- and it is what makes the map a map. The dates are the part that turns a
-- marketing graphic into a schedule of unoccupied houses.
--
-- Applied to production 23 Aug 2026.
create or replace function public.public_creator_map()
returns json
language sql
stable
security definer
set search_path = public
as $function$
  select json_build_object(
    'creators', coalesce((
      select json_agg(row_to_json(c)) from (
        select p.id, p.name, p.photo_url, p.bio, p.city, p.country,
               p.city_lat, p.city_lng,
               coalesce(array_length(p.countries_visited, 1), 0) as countries
        from public.profiles p
        where p.status = 'active' and not p.is_admin
          and coalesce(p.is_test, false) = false
          and p.deletion_requested_at is null
          and coalesce(p.show_on_map, true)
          and p.city_lat is not null and p.city_lng is not null
      ) c
    ), '[]'::json),
    -- MEMBERS ONLY. `auth.uid()` is null for an anonymous caller, and this
    -- function is SECURITY DEFINER, so the check has to be explicit - the
    -- definer's rights would otherwise happily hand the rows to anybody.
    'trips', case when auth.uid() is null then '{}'::json else coalesce((
      select json_object_agg(creator_id, trips) from (
        select cp.creator_id,
               json_agg(json_build_object(
                 'city', cp.city, 'country', cp.country,
                 'start_date', cp.start_date, 'end_date', cp.end_date
               ) order by cp.start_date) as trips
        from public.collab_posts cp
        join public.profiles p on p.id = cp.creator_id
        where cp.end_date >= current_date
          and p.status = 'active' and coalesce(p.is_test, false) = false
          and p.deletion_requested_at is null
          and coalesce(p.show_on_map, true)
        group by cp.creator_id
      ) t
    ), '{}'::json) end
  );
$function$;
