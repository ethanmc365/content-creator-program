-- THE WEEKLY ACTIVITY CHART COULD NOT BE READ ONE MARKET AT A TIME.
--
-- Ethan, 8 Sep 2026: "I noticed the community health and weekly activity chart
-- can't scope to the market. Not sure why this is. So maybe try actually fix it
-- if you can, so that we can see the activity by market, see which is the most
-- active."
--
-- The reason was honest and is now removed: every other figure on the Community
-- health tab is a filter over rows the page already holds, and this one is
-- aggregated inside Postgres and returns no creator id - so the client had
-- nothing to filter ON. The tab said so out loud rather than pretending
-- ("Programme-wide. This chart is not filtered to Spain yet."), which was the
-- right thing to do about it and not a fix.
--
-- The scoping has to happen where the aggregation does. `p_community` is a
-- community id; null keeps the old programme-wide behaviour exactly, so the
-- worldwide view is byte-for-byte what it was.
--
-- WHO COUNTS AS "IN" A MARKET: an active `community_members` row. That is the
-- same definition `lib/analyticsScope` applies to every other number on the
-- tab, which is the point - a scoped chart that used a second definition of
-- membership would disagree with the tiles beside it and be worse than the
-- honest warning it replaces.
--
-- EVERY CLAUSE IS SCOPED, NOT JUST THE MEMBER COUNT. `posts`, `chat_messages`,
-- `dms`, `connections` and `active_creators` all filter to the same set. A
-- chart whose bars were one market and whose line was the whole programme would
-- be the most misleading version of this available.
--
-- `connections` is scoped by EITHER end being a member, deliberately: a
-- connection between a Spanish creator and a German one is activity in both
-- markets, and counting it in neither would make the sum of the markets smaller
-- than the programme.
create or replace function public.admin_weekly_activity(
  p_weeks integer default 26,
  p_community uuid default null
)
returns table(
  week_start date, members integer, joined integer, posts integer,
  chat_messages integer, dms integer, connections integer, active_creators integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    with weeks as (
      select generate_series(
        date_trunc('week', now())::date - ((p_weeks - 1) * 7),
        date_trunc('week', now())::date,
        '7 days'::interval
      )::date as week_start
    ),
    -- The scope, resolved once. Empty `p_community` means everybody, which is
    -- expressed as "there is no membership test" rather than as a second query
    -- plan: `p_community is null or id in (scope)` reads once and is what keeps
    -- the unscoped result identical to the old function's.
    scope as (
      select m.profile_id as id
      from public.community_members m
      where m.status = 'active' and m.community_id = p_community
    )
    select
      w.week_start,
      (select count(*)::int from public.profiles p
        where p.status in ('active','muted') and not coalesce(p.is_test,false)
          and coalesce(p.accepted_at, p.created_at)::date < w.week_start + 7
          and (p_community is null or p.id in (select id from scope))),
      (select count(*)::int from public.profiles p
        where p.status in ('active','muted') and not coalesce(p.is_test,false)
          and coalesce(p.accepted_at, p.created_at)::date >= w.week_start
          and coalesce(p.accepted_at, p.created_at)::date < w.week_start + 7
          and (p_community is null or p.id in (select id from scope))),
      (select count(*)::int from public.submissions s
        where s.submitted_at::date >= w.week_start and s.submitted_at::date < w.week_start + 7
          and (p_community is null or s.creator_id in (select id from scope))),
      (select count(*)::int from public.messages m
        where m.created_at::date >= w.week_start and m.created_at::date < w.week_start + 7
          and not coalesce(m.deleted,false)
          and (p_community is null or m.sender_id in (select id from scope))),
      (select count(*)::int from public.direct_messages d
        where d.created_at::date >= w.week_start and d.created_at::date < w.week_start + 7
          and (p_community is null or d.sender_id in (select id from scope))),
      (select count(*)::int from public.connections cn
        where cn.status='accepted'
          and cn.created_at::date >= w.week_start and cn.created_at::date < w.week_start + 7
          and (p_community is null
               or cn.creator_id in (select id from scope)
               or cn.connected_creator_id in (select id from scope))),
      (select count(distinct x.uid)::int from (
          select s.creator_id as uid from public.submissions s
            where s.submitted_at::date >= w.week_start and s.submitted_at::date < w.week_start + 7
          union
          select m.sender_id from public.messages m
            where m.created_at::date >= w.week_start and m.created_at::date < w.week_start + 7
          union
          select d.sender_id from public.direct_messages d
            where d.created_at::date >= w.week_start and d.created_at::date < w.week_start + 7
        ) x
        where p_community is null or x.uid in (select id from scope))
    from weeks w
    order by w.week_start;
end;
$function$;

grant execute on function public.admin_weekly_activity(integer, uuid) to authenticated;

-- AND THE OLD SIGNATURE HAS TO GO, OR NEITHER OF THEM WORKS.
--
-- `create or replace function` cannot change a function's argument list, so the
-- statement above created a SECOND function rather than replacing the first:
--
--   admin_weekly_activity(integer)
--   admin_weekly_activity(integer, uuid)
--
-- The client calls it as `rpc('admin_weekly_activity', { p_weeks: 16 })`. That
-- matches the one-argument version exactly AND the two-argument version through
-- its default, so Postgres cannot choose - the call fails with "function is not
-- unique" and the Community health tab loses its chart entirely. Caught by
-- listing the signatures straight after applying the replace; it is the classic
-- trap of adding a defaulted argument to a live function.
drop function if exists public.admin_weekly_activity(integer);
