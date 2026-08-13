-- 094: reading the thing clears its notification, and groups count as DMs.
--
-- TWO BUGS, ONE CAUSE: the app tracked "have you read this message" and "have
-- you read this notification" in two places and only ever updated one of them
-- by reading.
--
-- 1. NOTIFICATIONS THAT WOULD NOT GO AWAY. A notification was marked read only
--    by CLICKING it in the bell, or by "mark all read". So you could open a DM,
--    read it, reply to it, and the badge sat there insisting you had not. 370
--    unread 'chat' rows and 34 unread 'dm' rows had accumulated that way, which
--    is a bell nobody can use: if the count is always wrong it stops being
--    information.
--
--    Every notification already stores the route it points at, so arriving on
--    that route IS reading it. AppLayout calls this on every navigation.
--    Matched EXACTLY on purpose: being on /messages must not clear a thread you
--    have never opened; only /messages/<id> does that.
create or replace function public.mark_notifications_read_for_path(p text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p is null or p = '' then return 0; end if;
  update public.notifications
  set read = true
  where recipient_id = auth.uid()
    and read = false
    and link = p;
  get diagnostics n = row_count;
  return n;
end; $$;

revoke execute on function public.mark_notifications_read_for_path(text) from public, anon;
grant execute on function public.mark_notifications_read_for_path(text) to authenticated;

-- 2. THE DM BADGE COULD NOT SEE A GROUP. It counted
--    `direct_messages where recipient_id = me and not read`, and a group message
--    has NO recipient - the column is null by construction, enforced by the
--    insert policy (migration 090). So group DMs contributed nothing to the tab
--    badge, ever, and somebody who was only messaged in groups had a
--    permanently silent DM tab. That is the other half of "people have messaged
--    me and I was not notified".
--
--    Unread in a group is a watermark, not a flag, so the two halves are
--    counted differently and added.
create or replace function public.my_dm_unread()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*)::int from public.direct_messages d
      where d.recipient_id = auth.uid() and d.read = false)
    +
    (select coalesce(count(*), 0)::int
       from public.direct_messages d
       join public.conversation_members cm
         on cm.conversation_id = d.conversation_id and cm.profile_id = auth.uid()
      where d.recipient_id is null
        and d.sender_id <> auth.uid()
        and d.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz));
$$;

revoke execute on function public.my_dm_unread() from public, anon;
grant execute on function public.my_dm_unread() to authenticated;
