-- LEAVING A GROUP YOU STARTED DID NOT REMOVE IT FROM YOUR INBOX.
--
-- Ethan, 7 Sep 2026: "I deleted the group test DM, but it's showing up again on
-- desktop even though I deleted it on my phone. Everything should be synced and
-- connected - if I delete something there, it should update here too."
--
-- Both devices were telling the truth. The phone did remove him from the group;
-- the desktop then read the group back, because of one clause in the read
-- policy:
--
--   conversations: participants read
--     participant_a = auth.uid() or participant_b = auth.uid()
--     or created_by = auth.uid()          <-- this one
--     or in_conversation(id)
--
-- `created_by` has to be there, and that is the whole trap. Creating a group is
-- two writes - insert the conversation, then join it - and PostgREST's
-- `.insert().select('id')` reads the row back through the SELECT policy before
-- the membership exists. Without the `created_by` clause a group cannot be
-- created at all. With it, the person who created a group can always read it,
-- membership or not - so "leave" removed the membership and left the row
-- perfectly visible to the one person most likely to be testing the feature.
--
-- The answer is not to loosen the policy, which is load-bearing. It is that
-- LEAVING A GROUP YOU OWN HAS TO HAND THE GROUP ON. That is also just correct
-- behaviour with nothing to do with this bug: a group whose owner has left
-- needs somebody who can rename it, invite people and end it, and there was no
-- path to that at all before now.
--
--   * the owner leaves      -> the longest-standing remaining member becomes
--                              the owner, and is promoted to the owner role
--   * the last member leaves -> the conversation is deleted outright, because a
--                              group with nobody in it is not a group
--   * anybody else leaves    -> their membership row goes, as before
--   * a direct conversation  -> deleted, which is what "delete this
--                              conversation" has always meant for a pair
--
-- ONE CALL, SERVER SIDE, so the three writes cannot half-happen: doing this from
-- the client meant an update and a delete with a network between them, and an
-- interrupted leave would strand a group with an owner who is not in it.
--
-- The GUARD is on this function and the arithmetic is unguarded underneath it -
-- the `_internal` twin pattern from migration 185 - because `auth.uid()` is
-- null under pg_cron and a definer function that trusts it silently does
-- nothing there. There is no cron caller today; the shape is the point.

create or replace function public.leave_conversation_internal(
  p_conversation uuid,
  p_profile      uuid
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_kind    text;
  v_owner   uuid;
  v_heir    uuid;
  v_left    int;
begin
  select kind, created_by into v_kind, v_owner
  from public.conversations where id = p_conversation;

  if v_kind is null then return 'gone'; end if;

  -- A pair has no membership table. Deleting it is what both people mean by
  -- "delete this conversation", and it is what the RLS policy already allowed.
  if v_kind <> 'group' then
    delete from public.conversations where id = p_conversation;
    return 'deleted';
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation and profile_id = p_profile;

  select count(*) into v_left
  from public.conversation_members where conversation_id = p_conversation;

  if v_left = 0 then
    -- Nobody is left. Invites to a group that no longer exists cascade off the
    -- conversation, so there is nothing else to tidy.
    delete from public.conversations where id = p_conversation;
    return 'deleted';
  end if;

  if v_owner = p_profile then
    select profile_id into v_heir
    from public.conversation_members
    where conversation_id = p_conversation
    order by joined_at asc, profile_id asc
    limit 1;

    update public.conversations set created_by = v_heir where id = p_conversation;
    update public.conversation_members set role = 'owner'
    where conversation_id = p_conversation and profile_id = v_heir;
    return 'handed on';
  end if;

  return 'left';
end;
$$;

revoke all on function public.leave_conversation_internal(uuid, uuid) from public, anon, authenticated;

create or replace function public.leave_conversation(p_conversation uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'You need to be signed in.' using errcode = '42501';
  end if;

  -- You may only leave something you are actually in. `in_conversation` covers
  -- group membership; the two participant columns cover a pair; `created_by`
  -- covers the owner of a group they have somehow already left.
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation
      and (c.participant_a = v_me or c.participant_b = v_me
           or c.created_by = v_me or public.in_conversation(c.id))
  ) then
    raise exception 'That conversation is not yours to leave.' using errcode = '42501';
  end if;

  return public.leave_conversation_internal(p_conversation, v_me);
end;
$$;

grant execute on function public.leave_conversation(uuid) to authenticated;
