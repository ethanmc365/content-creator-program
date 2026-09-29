-- THE WALL OF FAME, AND THE PRIVACY TOGGLE THAT GOES WITH IT.
--
-- Outstanding from the brief, and the two halves belong in one migration:
-- building the first without the second is how a creator who has deliberately
-- hidden themselves ends up on the front page.
--
-- WHAT IT SHOWS: the people who have actually won something. Not "featured
-- creators", which is the strip above it and is really "recently active" -
-- this is a RESULT, with a place and a challenge attached, and it is the one
-- thing a public page can say about this programme that a prospective creator
-- cannot argue with.
--
-- ONLY FINAL RESULTS. An interim leaderboard is a work in progress, and putting
-- somebody on a public wall as a winner and then moving them is not a mistake
-- anybody can take back.
--
-- AND THE BUG THIS ALSO FIXES. `featured_creators` never honoured
-- `show_on_map`, so a creator who had switched themselves off the public map
-- was still on the public landing page in the strip beside it. One flag, one
-- meaning: "do not put me on the public page". The Settings copy says so now.
--
-- IT ALSO HAS TO BE ON THE ALLOWLIST - see 279. Granting EXECUTE is not enough.

create or replace function public.public_wall_of_fame(p_limit integer default 12)
returns table (name text, photo_url text, place integer, challenge text, market text, ended_on date)
language sql stable security definer set search_path to 'public'
as $function$
  select p.name, p.photo_url, r.rank::integer, c.title,
         coalesce(cm.name, 'Worldwide'), c.end_date::date
    from public.results r
    join public.challenges c on c.id = r.challenge_id
    join public.profiles p on p.id = r.creator_id
    left join public.communities cm on cm.id = c.community_id
   where c.results_status = 'final'
     and r.rank is not null and r.rank <= 3
     and p.status = 'active' and not p.is_admin
     and not coalesce(p.is_test, false)
     and p.deletion_requested_at is null
     and coalesce(p.show_on_map, true)
   order by c.end_date desc, r.rank
   limit greatest(1, least(coalesce(p_limit, 12), 60));
$function$;

create or replace function public.featured_creators()
returns table(name text, photo_url text, bio text, countries integer)
language sql stable security definer set search_path to 'public'
as $function$
  select p.name, p.photo_url, p.bio, coalesce(array_length(p.countries_visited, 1), 0)
  from public.profiles p
  where p.status = 'active' and p.photo_url is not null and not p.is_admin
    and p.deletion_requested_at is null and not p.is_test
    and coalesce(p.show_on_map, true)
  order by p.last_seen_at desc nulls last,
           coalesce(array_length(p.countries_visited, 1), 0) desc
  limit 20;
$function$;
