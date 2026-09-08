-- THE CREATOR SCORECARD HAD NO FACES ON IT.
--
-- Ethan: "on the Community health tab, on the creator scorecard, for some
-- reason it doesn't show the creator profile pictures. Improve the design and
-- UI by actually showing the profile pictures."
--
-- The table renders `<Avatar name={c.name} size="xs" />` with no `src`, so
-- every row drew the initials fallback. It was not a styling problem and no
-- amount of front-end work would have fixed it: `admin_creator_scorecard` never
-- returned `photo_url`, so the component had nothing to pass. The avatar was
-- doing precisely what it is supposed to do when there is no photo.
--
-- `create or replace` cannot change a function's RETURNS TABLE, so this is a
-- drop and a create. It is a zero-argument function with one caller, so there
-- is no overload to leave behind and no signature anything else depends on.
--
-- Everything else is read out of `pg_get_functiondef` and unchanged - see
-- supabase/migrations/README.md. Same admin gate, same filters, same order.

drop function if exists public.admin_creator_scorecard();

create function public.admin_creator_scorecard()
returns table(
  creator_id uuid, name text, photo_url text, country text,
  joined_at timestamp with time zone, last_seen_at timestamp with time zone,
  challenges_entered bigint, posts bigint, total_views bigint,
  first_post_at timestamp with time zone, days_to_first_post integer,
  chat_messages bigint, connections bigint, has_push boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
    select p.id, p.name, p.photo_url, p.country,
      coalesce(p.accepted_at, p.created_at), p.last_seen_at,
      (select count(distinct s.challenge_id) from public.submissions s where s.creator_id = p.id)::bigint,
      (select count(*) from public.submissions s where s.creator_id = p.id)::bigint,
      (select coalesce(sum(s.logged_views),0) from public.submissions s where s.creator_id = p.id)::bigint,
      (select min(s.submitted_at) from public.submissions s where s.creator_id = p.id),
      (select (min(s.submitted_at)::date - coalesce(p.accepted_at, p.created_at)::date)::int
         from public.submissions s where s.creator_id = p.id),
      (select count(*) from public.messages m where m.sender_id = p.id and not coalesce(m.deleted,false))::bigint,
      (select count(*) from public.connections cn
        where cn.status='accepted' and (cn.creator_id = p.id or cn.connected_creator_id = p.id))::bigint,
      exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
    from public.profiles p
    where p.status in ('active','muted') and not coalesce(p.is_test,false)
      and not p.is_admin and p.deletion_requested_at is null
    order by p.name;
end;
$$;

grant execute on function public.admin_creator_scorecard() to authenticated;
