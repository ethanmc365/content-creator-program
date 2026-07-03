-- 038_dm_gate_admin_exempt.sql
-- Admins (the Tryp.com Team) are exempt from the 1-message DM cap so they can
-- reach any creator. Re-defines the send policy adding `or is_admin()`.
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
      is_admin()
      or exists (
        select 1 from public.connections k where k.status = 'accepted'
          and ((k.creator_id = direct_messages.sender_id and k.connected_creator_id = direct_messages.recipient_id)
            or (k.creator_id = direct_messages.recipient_id and k.connected_creator_id = direct_messages.sender_id))
      )
      or not exists (
        select 1 from public.direct_messages m
        where m.conversation_id = direct_messages.conversation_id and m.sender_id = direct_messages.sender_id
      )
      or exists (
        select 1 from public.direct_messages m
        where m.conversation_id = direct_messages.conversation_id and m.sender_id = direct_messages.recipient_id
      )
    )
  ));
