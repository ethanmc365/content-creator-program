-- HOW MANY MESSAGES SOMEBODY SENT, WITHOUT READING ONE.
--
-- Ethan, on the Year in Review lab: "we have the year around that shows the
-- four messages. But I think he also sent more than that many messages. And I
-- told you to also count DMs in here as well."
--
-- The DMs ARE counted - `buildYearInReview` has added `directMessages` to the
-- total since 19 Sep. The lab still showed room messages only, and the cause is
-- correct behaviour rather than a bug: `direct_messages` is behind RLS that
-- lets you see the conversations you are IN, so an admin previewing somebody
-- else's recap reads their own nine DMs and none of that creator's. Measured as
-- qa-admin on 20 Sep 2026: `select count(*) from direct_messages` returns 9
-- from the browser against 216 in the table.
--
-- That is the policy doing exactly its job, and it must not be relaxed. So this
-- returns COUNTS AND NOTHING ELSE - no body, no recipient, no thread, not even
-- a timestamp. It is the same shape the recap's own fetch uses
-- (`sender_id, created_at` and nothing more), reduced further.
--
-- ADMIN ONLY, CHECKED INSIDE THE BODY. A definer function that forgets to ask
-- is a hole with a helpful name, and "how chatty is every creator" is not a
-- fact a creator is owed about their peers. It returns no rows rather than
-- raising, because the caller is a preview and a lab that explodes on a
-- permission it was never going to have is worse than one that shows zero.
--
-- APPLIED TO PRODUCTION 20 Sep 2026.
create or replace function public.year_dm_counts(p_year integer)
returns table (sender_id uuid, n integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select d.sender_id, count(*)::int as n
  from public.direct_messages d
  where public.is_admin()
    and d.created_at >= make_date(p_year, 1, 1)
    and d.created_at <  make_date(p_year + 1, 1, 1)
  group by d.sender_id;
$function$;

revoke all on function public.year_dm_counts(integer) from public, anon;
grant execute on function public.year_dm_counts(integer) to authenticated;
