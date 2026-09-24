-- 257: WHEN A CONNECTION WAS MADE, NOT WHEN IT WAS ASKED FOR (24 Sep 2026)
--
-- Ethan: "I feel like the connections tab isn't updated correctly with the
-- connections with new creators." It was reading the right rows and dating them
-- wrong: `created_at` is the moment the REQUEST was sent, so a connection a new
-- creator accepted this morning, from a request sent a fortnight ago, sorted two
-- weeks down "Recent connections" and said "2 weeks ago". Nothing recorded when
-- a request was accepted.
--
-- accepted_at is stamped by a BEFORE trigger whenever a row becomes 'accepted'
-- (insert or update), and cleared if it ever stops being accepted. History is
-- backfilled with created_at: the best we know, and never later than the truth.

alter table public.connections add column if not exists accepted_at timestamptz;

update public.connections set accepted_at = created_at
 where status = 'accepted' and accepted_at is null;

create or replace function public.connections_stamp_accepted()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'accepted' then
    if tg_op = 'INSERT' or old.status is distinct from 'accepted' or new.accepted_at is null then
      new.accepted_at := coalesce(case when tg_op = 'UPDATE' and old.status = 'accepted' then old.accepted_at end, now());
    end if;
  else
    new.accepted_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_connections_stamp_accepted on public.connections;
create trigger trg_connections_stamp_accepted
  before insert or update of status on public.connections
  for each row execute function public.connections_stamp_accepted();

create index if not exists connections_accepted_at_idx on public.connections (accepted_at desc) where status = 'accepted';
