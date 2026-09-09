-- THE MAP PAINTED THE COUNTRY AND THE PANEL SAID NOBODY HAD BEEN THERE.
--
-- Ethan: "I noticed that a country - for example Brazil - that someone has been
-- to, it shows 'nobody has been to Brazil yet', which is where it should show
-- up the people who have actually been there."
--
-- Both halves of that contradiction were shipped in migration 189, one line
-- apart. It sends `visited` - a flat, anonymised list of every country the
-- community has filmed in - which is what PAINTS Brazil in the lighter orange.
-- It does not send `countries_visited` per creator; it sends a COUNT. So
-- `openCountry` in CreatorMap.jsx, which builds the panel by asking each
-- creator whether this country is in their `countries_visited`, asks a question
-- no creator on that page can answer, gets an empty list every time, and prints
-- the empty-list copy underneath a country the same payload just told it to
-- colour in.
--
-- That is worse than either answer on its own. A map that paints nothing is
-- merely quiet; a map that paints a country and then denies it is a map the
-- reader stops believing.
--
-- WHY THE PRIVACY LINE MOVES, AND WHY ONLY THIS FAR.
--
-- 189's reasoning was: "somebody in this community has filmed in Morocco" is a
-- fact about the programme, and "this named person has been to Morocco" is a
-- fact about a person. That distinction is real and it is the right instinct in
-- general. It does not survive contact with what this particular payload
-- ALREADY sends, which is the person's name, their photograph, their bio, and
-- the town they live in. Having agreed to be a named face on a public map of a
-- travel-content programme, the countries they have filmed in are the least
-- private thing about them - it is the portfolio, and it is the reason a
-- stranger would click.
--
-- The gate is unchanged and it is the gate that matters: `show_on_map`, which
-- is a per-creator opt-in, plus active, not admin, not a test account, not
-- pending deletion. A creator who has not opted in to the public map is not in
-- this result at all and never was. Nothing new is exposed about anybody who
-- did not already agree to be here by name.
--
-- `visited` STAYS. It is not redundant: it is the union across everyone, it is
-- what the painter iterates, and computing it in the browser from forty arrays
-- would be the same list assembled more slowly. `countries` (the count) stays
-- too - the creator cards sort on it.

create or replace function public.public_creator_map()
returns json
language sql
stable security definer
set search_path to 'public'
as $function$
  select json_build_object(
    'creators', coalesce((
      select json_agg(row_to_json(c)) from (
        select p.id, p.name, p.photo_url, p.bio, p.city, p.country,
               p.city_lat, p.city_lng,
               coalesce(array_length(p.countries_visited, 1), 0) as countries,
               -- THE LIST, NOT JUST ITS LENGTH. Trimmed and emptied of blanks
               -- on the way out, because `sameCountry` in the browser compares
               -- these against world-atlas names and a stray space is a country
               -- that silently never matches. `'{}'` rather than null so the
               -- browser's `(c.countries_visited || [])` never has to run.
               coalesce((
                 select array_agg(trim(v) order by trim(v))
                 from unnest(coalesce(p.countries_visited, '{}')) as v
                 where trim(v) <> ''
               ), '{}') as countries_visited
        from public.profiles p
        where p.status = 'active' and not p.is_admin
          and coalesce(p.is_test, false) = false
          and p.deletion_requested_at is null
          and coalesce(p.show_on_map, true)
          and p.city_lat is not null and p.city_lng is not null
      ) c
    ), '[]'::json),
    -- EVERY COUNTRY THE COMMUNITY HAS FILMED IN, once each. This one is drawn
    -- from EVERY opted-in creator, including the ones with no coordinates, so
    -- it is deliberately wider than the union of the arrays above: a creator
    -- who has not set their home town still paints the countries they filmed
    -- in. That is also why a country can be painted with nobody in the panel -
    -- which is now an honest, rare case rather than the default one.
    'visited', coalesce((
      select json_agg(name order by name) from (
        select distinct trim(v) as name
        from public.profiles p
        cross join lateral unnest(coalesce(p.countries_visited, '{}')) as v
        where p.status = 'active' and not p.is_admin
          and coalesce(p.is_test, false) = false
          and p.deletion_requested_at is null
          and coalesce(p.show_on_map, true)
          and trim(v) <> ''
      ) q
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
