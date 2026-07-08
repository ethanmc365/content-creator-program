-- ============================================================================
-- 046 - admin-pinned messages + @everyone mention
-- ============================================================================
set check_function_bodies = off;

-- Pin: admins can pin one message per channel (a partial index tracks the pin).
-- Only admins can flip it (the existing "messages: admin moderate" UPDATE policy
-- already gates all updates to is_admin()).
alter table public.messages add column if not exists pinned boolean not null default false;
create index if not exists idx_messages_pinned on public.messages (channel) where pinned;

-- @everyone: when an ADMIN posts a message containing "@everyone", notify every
-- active member (server-derived so it can't be spoofed by non-admins). Mirrors
-- on_message_mention; the per-name mention trigger never matches "everyone".
create or replace function public.on_message_everyone()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender_name text; ch text; is_adm boolean; rec record;
begin
  if new.body is null or coalesce(new.deleted, false) then return new; end if;
  if position('@everyone' in lower(new.body)) = 0 then return new; end if;
  select is_admin, name into is_adm, sender_name from public.profiles where id = new.sender_id;
  if not coalesce(is_adm, false) then return new; end if;
  ch := coalesce(new.channel, 'general');
  for rec in
    select p.id from public.profiles p
    where p.id <> new.sender_id
      and p.status in ('active', 'muted')
      and not coalesce(p.is_test, false)
  loop
    perform notify_user(rec.id, 'mention',
      coalesce(sender_name, 'The team') || ' mentioned @everyone in #' || ch,
      left(new.body, 140),
      '/chat/' || ch);
  end loop;
  return new;
end $$;
revoke all on function public.on_message_everyone() from public, anon, authenticated;

drop trigger if exists trg_on_message_everyone on public.messages;
create trigger trg_on_message_everyone after insert on public.messages
  for each row execute function public.on_message_everyone();
