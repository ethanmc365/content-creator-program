-- 043_chat_mentions.sql
-- @mentions in community chat: when a message contains "@<member name>", notify
-- that member. Derived from the body server-side (not client-supplied) so it
-- can't be spoofed to spam arbitrary people.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'challenge','announcement','results','reward','deadline','connection','dm','event',
  'application','chat','submission','deletion','referral','new_member','inactive','feedback','collab','mention'
]));

create or replace function public.on_message_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender_name text; ch text; rec record;
begin
  if new.body is null or new.body = '' or coalesce(new.deleted, false) or position('@' in new.body) = 0 then
    return new;
  end if;
  select name into sender_name from public.profiles where id = new.sender_id;
  ch := coalesce(new.channel, 'general');
  for rec in
    select p.id from public.profiles p
    where p.id <> new.sender_id
      and p.status in ('active', 'muted')
      and not coalesce(p.is_test, false)
      and length(coalesce(p.name, '')) > 1
      and position('@' || p.name in new.body) > 0
  loop
    perform notify_user(rec.id, 'mention',
      coalesce(sender_name, 'Someone') || ' mentioned you in #' || ch,
      left(new.body, 140),
      '/chat/' || ch);
  end loop;
  return new;
end $$;
revoke all on function public.on_message_mention() from public, anon, authenticated;

drop trigger if exists trg_on_message_mention on public.messages;
create trigger trg_on_message_mention after insert on public.messages
  for each row execute function public.on_message_mention();
