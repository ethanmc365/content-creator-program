-- 035_connection_requests.sql
-- Turn one-way instant "connections" into a LinkedIn-style request flow:
-- a request is pending until the recipient accepts. Both sides get notified.

-- 1. status column (pending -> accepted). Existing rows were instant connects,
--    so treat them as already accepted.
alter table public.connections add column if not exists status text not null default 'pending';
update public.connections set status = 'accepted';
alter table public.connections drop constraint if exists connections_status_check;
alter table public.connections add constraint connections_status_check check (status in ('pending', 'accepted'));

-- 2. De-dupe any reciprocal/duplicate pairs, then forbid more than one row per
--    pair in EITHER direction (so A->B and B->A can't both exist).
delete from public.connections a using public.connections b
where a.ctid < b.ctid
  and least(a.creator_id, a.connected_creator_id) = least(b.creator_id, b.connected_creator_id)
  and greatest(a.creator_id, a.connected_creator_id) = greatest(b.creator_id, b.connected_creator_id);
create unique index if not exists connections_pair_uidx
  on public.connections (least(creator_id, connected_creator_id), greatest(creator_id, connected_creator_id));

-- 3. Policies: the recipient can accept (update their incoming row); either
--    party can remove (cancel a request, decline, or disconnect).
drop policy if exists "connections: respond" on public.connections;
create policy "connections: respond" on public.connections
  for update using ((connected_creator_id = (select auth.uid())))
  with check ((connected_creator_id = (select auth.uid())));

drop policy if exists "connections: disconnect own" on public.connections;
drop policy if exists "connections: remove either side" on public.connections;
create policy "connections: remove either side" on public.connections
  for delete using (((creator_id = (select auth.uid())) or (connected_creator_id = (select auth.uid()))));

-- 4. Notify the recipient on a new request, and the requester on acceptance.
create or replace function public.on_connection_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare requester_name text;
begin
  if new.status = 'pending' then
    select name into requester_name from public.profiles where id = new.creator_id;
    perform notify_user(
      new.connected_creator_id, 'connection',
      coalesce(requester_name, 'Someone') || ' wants to connect',
      'Tap to view their profile and accept.',
      '/profile/' || new.creator_id::text);
  end if;
  return new;
end $$;
drop trigger if exists trg_on_connection_request on public.connections;
create trigger trg_on_connection_request after insert on public.connections
  for each row execute function public.on_connection_request();

create or replace function public.on_connection_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
declare accepter_name text;
begin
  if new.status = 'accepted' and old.status = 'pending' then
    select name into accepter_name from public.profiles where id = new.connected_creator_id;
    perform notify_user(
      new.creator_id, 'connection',
      coalesce(accepter_name, 'Someone') || ' accepted your request',
      'You are now connected.',
      '/profile/' || new.connected_creator_id::text);
  end if;
  return new;
end $$;
drop trigger if exists trg_on_connection_accepted on public.connections;
create trigger trg_on_connection_accepted after update on public.connections
  for each row execute function public.on_connection_accepted();
