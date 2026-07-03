-- 039_fix_dm_gate_recursion.sql
-- The DM send policy (037/038) queried direct_messages from within a
-- direct_messages policy -> "infinite recursion detected in policy". Move the
-- gating logic into a SECURITY DEFINER function so its internal reads bypass
-- RLS (no recursion), and have the policy just call it.

create or replace function public.dm_send_allowed(p_conv uuid, p_sender uuid, p_recipient uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select
    is_admin()
    or exists (
      select 1 from public.connections k where k.status = 'accepted'
        and ((k.creator_id = p_sender and k.connected_creator_id = p_recipient)
          or (k.creator_id = p_recipient and k.connected_creator_id = p_sender))
    )
    or not exists (
      select 1 from public.direct_messages m
      where m.conversation_id = p_conv and m.sender_id = p_sender
    )
    or exists (
      select 1 from public.direct_messages m
      where m.conversation_id = p_conv and m.sender_id = p_recipient
    );
$$;
revoke all on function public.dm_send_allowed(uuid, uuid, uuid) from public, anon;
grant execute on function public.dm_send_allowed(uuid, uuid, uuid) to authenticated;

drop policy if exists "dms: send as yourself" on public.direct_messages;
create policy "dms: send as yourself" on public.direct_messages
  for insert with check ((
    (sender_id = (select auth.uid())) and can_post()
    and exists (
      select 1 from public.conversations c
      where c.id = direct_messages.conversation_id
        and (c.participant_a = (select auth.uid()) or c.participant_b = (select auth.uid()))
    )
    and public.dm_send_allowed(direct_messages.conversation_id, direct_messages.sender_id, direct_messages.recipient_id)
  ));
