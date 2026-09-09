-- THE FRONT PAGE INTRODUCED FOUR OF FORTY-FIVE CREATORS.
--
-- Ethan, 9 Sep 2026, about "Recently active creators": "it currently shows
-- four. I think we can show, like, the twenty most active creators here, and
-- you can scroll through them - so you're scrolling to the right. On desktop it
-- will show four and then scrolling to the right will show more. On mobile,
-- make sure you can see at least part of one more creator so they know they can
-- scroll."
--
-- The section is the most persuasive thing on the page - it is the only place a
-- stranger meets actual people rather than the programme describing itself -
-- and it was showing under a tenth of the community. Four is not a design
-- decision here, it is the `limit` this function has carried since migration
-- 022, written when there were barely four creators to show.
--
-- READ FIRST, per supabase/migrations/README.md. The live body was exactly the
-- body below with `limit 4`, and the ordering (`last_seen_at desc nulls last`,
-- then countries visited) is already what "recently active" means and is
-- UNCHANGED. Twenty-three of the forty-five have ever been seen, so the tail of
-- the list is ordered by countries visited, which is the right second key: a
-- creator nobody has a last-seen date for is still worth meeting.
--
-- WHY THE SIGNATURE IS NOT TOUCHED. Adding `featured_creators(n integer
-- default 4)` alongside the existing zero-argument function makes every
-- existing no-arg call ambiguous ("function is not unique"), and dropping the
-- old one means re-doing its grant and its row on migration 170's allowlist.
-- Twenty rows of (name, photo, bio, count) is about 4 kB - smaller than one of
-- the avatars the page then fetches - so the page asks for twenty once and
-- decides for itself how many to draw at each width. There is nothing to
-- parameterise.
--
-- STILL EXACTLY AS PUBLIC AS IT WAS. Name, photo, bio and a count of countries,
-- for active non-admin non-test creators who have a photo. Every one of those
-- four fields is already printed on this page today; the only thing that
-- changes is how many people it prints them for.
create or replace function public.featured_creators()
returns table(name text, photo_url text, bio text, countries integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.name, p.photo_url, p.bio, coalesce(array_length(p.countries_visited, 1), 0)
  from public.profiles p
  where p.status = 'active' and p.photo_url is not null and not p.is_admin
    and p.deletion_requested_at is null and not p.is_test
  order by p.last_seen_at desc nulls last,
           coalesce(array_length(p.countries_visited, 1), 0) desc
  limit 20;
$$;

-- Already on the allowlist (migration 170); re-granted explicitly because
-- `create or replace` is the moment a grant is easiest to lose.
grant execute on function public.featured_creators() to anon, authenticated;
