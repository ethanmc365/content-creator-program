-- YOU CAN DELETE WHAT YOU SAID.
--
-- `messages` has exactly one UPDATE policy and it is `is_admin()`, and no DELETE
-- policy at all. So a creator who posted the wrong photo into a room of forty
-- five people had no way to take it back: the edit window is five minutes and
-- edit_message explicitly refuses to empty a message ("Ask an admin to delete
-- it"). Asking an admin to unsend your own typo is not a feature.
--
-- WHY AN RPC AND NOT A POLICY. Two reasons, and both are house rules here.
-- UPDATE is not column-aware, so an "update own message" policy would let a
-- creator rewrite `channel`, `pinned` or `created_at` as easily as `deleted` -
-- which is how a message moves itself into announcements. And a hard DELETE
-- would take the reactions, the replies pointing at it and the report attached
-- to it with it, which is exactly what a moderator needs to still be able to
-- read. So: soft delete, one column, through a function that checks who is
-- asking.
--
-- The existing media-cleanup trigger already fires on a moderation soft-delete
-- (migration 058), so the photo behind a deleted message is removed from
-- storage by the same path as before. Nothing new to wire up.
create or replace function public.delete_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.messages;
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;

  select * into v_row from public.messages where id = p_id;
  if not found then raise exception 'Message not found'; end if;

  -- Already gone is not an error. Two taps on a slow connection, or a delete
  -- racing the realtime update, should not put a red banner in front of
  -- somebody for getting what they asked for.
  if v_row.deleted then return; end if;

  -- Your own, or an admin moderating. Deliberately NO time limit on your own:
  -- the five minute window on editing exists so history cannot be quietly
  -- rewritten under a reply, and deleting does not rewrite anything - it
  -- removes it and leaves the gap.
  if v_row.sender_id <> v_me and not public.is_admin() then
    raise exception 'You can only delete your own messages';
  end if;

  -- Deleting the pinned message must also unpin it, or the room keeps a pinned
  -- banner pointing at something nobody can read.
  update public.messages
     set deleted = true,
         pinned = false
   where id = p_id;
end;
$$;

-- Definer functions are granted to PUBLIC by default AND to anon by name
-- through Supabase's ALTER DEFAULT PRIVILEGES. It takes both revokes; a safe
-- one reads back as postgres/authenticated/service_role only.
revoke all on function public.delete_message(uuid) from public;
revoke all on function public.delete_message(uuid) from anon;
grant execute on function public.delete_message(uuid) to authenticated;

notify pgrst, 'reload schema';
