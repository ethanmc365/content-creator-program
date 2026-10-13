-- 410: the flight pages asked one question per route / per upcoming flight, in sequence (audit L3): up to six
-- route_flyers calls on the community page and up to eight same_flight calls on the flight log. These answer the
-- whole list in one request by calling the existing functions per item, so the rules (shared flights only, never
-- yourself, real active creators, same-flight only when you are on it too) stay exactly where they are.
-- Inputs are capped so a request cannot ask for an unbounded amount of work.
create or replace function public.route_flyers_many(p_routes jsonb)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(e.r ->> 'key', x.rows), '{}'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_routes) = 'array' then p_routes else '[]'::jsonb end)
         with ordinality as e(r, n)
    cross join lateral (
      select jsonb_agg(jsonb_build_object('creator_id', f.creator_id, 'name', f.name, 'photo_url', f.photo_url, 'flights', f.flights)) as rows
        from public.route_flyers(e.r ->> 'a', e.r ->> 'b') f
    ) x
   where e.n <= 12 and x.rows is not null;
$function$;

create or replace function public.same_flight_many(p_flights jsonb)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_object_agg(e.r ->> 'key', x.rows), '{}'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_flights) = 'array' then p_flights else '[]'::jsonb end)
         with ordinality as e(r, n)
    cross join lateral (
      select jsonb_agg(jsonb_build_object('creator_id', f.creator_id, 'name', f.name, 'photo_url', f.photo_url)) as rows
        from public.same_flight(e.r ->> 'from', e.r ->> 'to', (e.r ->> 'on')::date) f
    ) x
   where e.n <= 12 and x.rows is not null;
$function$;
