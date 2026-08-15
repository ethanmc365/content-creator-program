-- 099: "I'm interested" becomes a message, not a counter tick.
--
-- Pressing the button used to insert a row and fire a notification, and that
-- was the whole feature: the trip owner learned that somebody, somewhere, had
-- pressed a button. There was nothing to reply to, nothing to act on, and no
-- way to tell that you had already dealt with it. Ethan: "the I'm interested
-- button does seemingly nothing, just sends a notification."
--
-- So an interest now carries a NOTE ("I'm in Lisbon those exact dates, would
-- love to shoot something") and a state the trip owner can move: acknowledged,
-- or not yet.
--
-- THE NOTE IS PRIVATE TO THE TWO PEOPLE, AND THAT IS WHY THE READ POLICY
-- CHANGES. `collab_interests: read for members` let any member read any row,
-- which was harmless when a row was a (post, creator) pair and is not once it
-- carries a sentence written to one person. RLS cannot hide one COLUMN of a row
-- you are allowed to read (the same reason entry feedback got its own table),
-- so the row itself becomes private to the sender and the trip owner.
--
-- Which leaves the count on a trip card - "3 interested" - with nothing to read.
-- That is an AGGREGATE and aggregates are not private, so it comes from a
-- definer function that returns nothing but post ids and numbers.

alter table public.collab_interests
  add column if not exists message text,
  add column if not exists acknowledged_at timestamptz;

drop policy if exists "collab_interests: read for members" on public.collab_interests;

create policy "collab_interests: read own or on my trip"
  on public.collab_interests for select
  using (
    creator_id = (select auth.uid())
    or exists (
      select 1 from public.collab_posts p
      where p.id = collab_interests.post_id and p.creator_id = (select auth.uid())
    )
    or is_admin()
  );

-- HOW MANY PEOPLE ARE INTERESTED, WITHOUT SAYING WHO OR WHAT THEY WROTE.
create or replace function public.collab_interest_counts()
returns table (post_id uuid, n bigint)
language sql
security definer
set search_path to 'public'
stable
as $$
  select i.post_id, count(*)::bigint
  from public.collab_interests i
  where is_member()
  group by i.post_id
$$;

-- ACKNOWLEDGING IS AN RPC, NOT AN UPDATE POLICY.
-- UPDATE is not column-aware, so the grant that lets a trip owner tick
-- "acknowledged" would equally let them rewrite the message somebody sent them
-- - which is the one thing on this row that must be exactly what its author
-- typed. Same reasoning as edit_message in 097.
create or replace function public.acknowledge_collab_interest(p_interest uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_owner uuid; v_from uuid; v_city text; v_owner_name text;
begin
  select p.creator_id, i.creator_id, p.city
    into v_owner, v_from, v_city
  from public.collab_interests i
  join public.collab_posts p on p.id = i.post_id
  where i.id = p_interest;

  if v_owner is null then raise exception 'No such interest'; end if;
  if v_owner <> auth.uid() then raise exception 'That is not your trip'; end if;

  update public.collab_interests
     set acknowledged_at = now()
   where id = p_interest and acknowledged_at is null;

  if found then
    select name into v_owner_name from public.profiles where id = v_owner;
    perform notify_user(v_from, 'collab',
      coalesce(v_owner_name, 'They') || ' saw your message',
      coalesce(v_owner_name, 'They') || ' has seen that you want to meet up in '
        || coalesce(v_city, 'their destination') || '. Send them a DM to sort the details.',
      '/collab');
  end if;
end $$;

-- The note travels with the notification, so the trip owner reads WHY somebody
-- is interested in the bell rather than having to go and find out.
create or replace function public.on_collab_interest()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare interested_name text; post_city text; post_owner uuid;
begin
  select p.city, p.creator_id into post_city, post_owner from public.collab_posts p where p.id = new.post_id;
  if post_owner is not null and post_owner <> new.creator_id then
    select name into interested_name from public.profiles where id = new.creator_id;
    perform notify_user(post_owner, 'collab',
      coalesce(interested_name, 'Someone') || ' wants to meet up in ' || coalesce(post_city, 'your destination'),
      coalesce(
        nullif(btrim(new.message), ''),
        coalesce(interested_name, 'Someone') || ' is interested in your trip.'
      ),
      '/collab');
  end if;
  return new;
end $$;

-- SUPABASE'S ALTER DEFAULT PRIVILEGES GRANTS EXECUTE ON EVERY NEW FUNCTION TO
-- `anon` BY NAME, and `revoke ... from public` does not touch a named grant.
-- Same trap as migrations 081 and 097: check proacl after every new function.
revoke execute on function public.collab_interest_counts() from public, anon;
revoke execute on function public.acknowledge_collab_interest(uuid) from public, anon;
grant execute on function public.collab_interest_counts() to authenticated;
grant execute on function public.acknowledge_collab_interest(uuid) to authenticated;

notify pgrst, 'reload schema';
