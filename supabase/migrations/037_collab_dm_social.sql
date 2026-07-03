-- 037_collab_dm_social.sql
-- Collab interest + overlap alerts, and DM gating (1 message to non-connections;
-- a reply auto-connects; connected = unlimited).

-- 1. New 'collab' notification type.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'challenge','announcement','results','reward','deadline','connection','dm','event',
  'application','chat','submission','deletion','referral','new_member','inactive','feedback','collab'
]));

-- 2. "I'm interested" on a trip -> pings the poster.
create table if not exists public.collab_interests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.collab_posts(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, creator_id)
);
create index if not exists idx_collab_interests_post on public.collab_interests(post_id);
create index if not exists idx_collab_interests_creator on public.collab_interests(creator_id);
alter table public.collab_interests enable row level security;

create policy "collab_interests: read for members" on public.collab_interests
  for select using (is_member());
create policy "collab_interests: add own" on public.collab_interests
  for insert with check (((creator_id = (select auth.uid())) and can_post()));
create policy "collab_interests: remove own" on public.collab_interests
  for delete using ((creator_id = (select auth.uid())));

create or replace function public.on_collab_interest()
returns trigger language plpgsql security definer set search_path = public as $$
declare interested_name text; post_city text; post_owner uuid;
begin
  select p.city, p.creator_id into post_city, post_owner from public.collab_posts p where p.id = new.post_id;
  if post_owner is not null and post_owner <> new.creator_id then
    select name into interested_name from public.profiles where id = new.creator_id;
    perform notify_user(post_owner, 'collab',
      coalesce(interested_name, 'Someone') || ' is interested in your trip',
      coalesce(interested_name, 'Someone') || ' wants to meet up in ' || coalesce(post_city, 'your destination') || '.',
      '/collab');
  end if;
  return new;
end $$;
drop trigger if exists trg_on_collab_interest on public.collab_interests;
create trigger trg_on_collab_interest after insert on public.collab_interests
  for each row execute function public.on_collab_interest();

-- 3. New trip -> alert creators whose own upcoming trip overlaps in the same country.
create or replace function public.on_collab_post_overlap()
returns trigger language plpgsql security definer set search_path = public as $$
declare poster_name text; rec record;
begin
  if new.country is null then return new; end if;
  select name into poster_name from public.profiles where id = new.creator_id;
  for rec in
    select distinct p.creator_id
    from public.collab_posts p
    where p.creator_id <> new.creator_id
      and p.country is not null
      and lower(p.country) = lower(new.country)
      and p.start_date <= new.end_date
      and p.end_date >= new.start_date
  loop
    perform notify_user(rec.creator_id, 'collab',
      coalesce(poster_name, 'A creator') || ' will be in ' || new.city,
      'Your trips overlap - you could meet up.',
      '/collab');
  end loop;
  return new;
end $$;
drop trigger if exists trg_on_collab_post_overlap on public.collab_posts;
create trigger trg_on_collab_post_overlap after insert on public.collab_posts
  for each row execute function public.on_collab_post_overlap();

-- 4. DM gating. Replace the send policy so a non-connection can send only until
--    the recipient replies (or they connect). First message always allowed.
drop policy if exists "dms: send as yourself" on public.direct_messages;
create policy "dms: send as yourself" on public.direct_messages
  for insert with check ((
    (sender_id = (select auth.uid())) and can_post()
    and exists (
      select 1 from public.conversations c
      where c.id = direct_messages.conversation_id
        and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
    )
    and (
      -- connected (accepted either direction) => unlimited
      exists (
        select 1 from public.connections k where k.status = 'accepted'
          and ((k.creator_id = direct_messages.sender_id and k.connected_creator_id = direct_messages.recipient_id)
            or (k.creator_id = direct_messages.recipient_id and k.connected_creator_id = direct_messages.sender_id))
      )
      -- OR this is my first message in the conversation
      or not exists (
        select 1 from public.direct_messages m
        where m.conversation_id = direct_messages.conversation_id and m.sender_id = direct_messages.sender_id
      )
      -- OR the recipient already messaged me (they replied => mutual)
      or exists (
        select 1 from public.direct_messages m
        where m.conversation_id = direct_messages.conversation_id and m.sender_id = direct_messages.recipient_id
      )
    )
  ));

-- When someone REPLIES to an opening message and they aren't connected, connect
-- them automatically (a reply == accepting the message request).
create or replace function public.on_dm_reply_connect()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.connections k where k.status = 'accepted'
      and ((k.creator_id = new.sender_id and k.connected_creator_id = new.recipient_id)
        or (k.creator_id = new.recipient_id and k.connected_creator_id = new.sender_id))
  ) and exists (
    select 1 from public.direct_messages m
    where m.conversation_id = new.conversation_id and m.sender_id = new.recipient_id
  ) then
    if exists (
      select 1 from public.connections k
      where (k.creator_id = new.sender_id and k.connected_creator_id = new.recipient_id)
         or (k.creator_id = new.recipient_id and k.connected_creator_id = new.sender_id)
    ) then
      update public.connections set status = 'accepted'
      where (creator_id = new.sender_id and connected_creator_id = new.recipient_id)
         or (creator_id = new.recipient_id and connected_creator_id = new.sender_id);
    else
      insert into public.connections (creator_id, connected_creator_id, status)
      values (new.recipient_id, new.sender_id, 'accepted');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_on_dm_reply_connect on public.direct_messages;
create trigger trg_on_dm_reply_connect after insert on public.direct_messages
  for each row execute function public.on_dm_reply_connect();
