-- WHERE WE LIVE AND WHERE WE HAVE BEEN, AS TWO ANSWERS.
--
-- Ethan, on the landing page's community map: "perhaps in Tryp.com orange we
-- could have the countries that everyone lives in, and then in the lighter
-- orange that we currently have, it could be for all the countries we've
-- travelled to. And maybe a little key on the bottom left to show that."
--
-- The map component can already draw both tints - the creator directory has a
-- "Been together" toggle that paints `exploredCountries` in the lighter shade.
-- The public RPC just never sent the names: it returned a COUNT per creator
-- (`countries`) and nothing else, so a stranger's map could only ever show
-- where people live.
--
-- `visited` is a flat, DISTINCT, sorted list across everybody on the map. Not
-- per creator, and that is a privacy decision as much as a size one: "somebody
-- in this community has filmed in Morocco" is a fact about the programme, and
-- "this named person has been to Morocco" is a fact about a person, which is
-- not a public page's to give away. It also keeps the payload small - roughly a
-- hundred short strings instead of forty arrays.
--
-- (`unnest(...) as country` collides with `profiles.country` in the WHERE
-- clause, so the alias is `v` - an ambiguous column reference here is a
-- migration that will not apply rather than a wrong answer, but only just.)
--
-- Same visibility rules as the creators list it sits beside: active, not
-- admin, not a test account, not pending deletion, opted in to the map.

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
               coalesce(array_length(p.countries_visited, 1), 0) as countries
        from public.profiles p
        where p.status = 'active' and not p.is_admin
          and coalesce(p.is_test, false) = false
          and p.deletion_requested_at is null
          and coalesce(p.show_on_map, true)
          and p.city_lat is not null and p.city_lng is not null
      ) c
    ), '[]'::json),
    -- EVERY COUNTRY THE COMMUNITY HAS FILMED IN, once each, nobody attached.
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
