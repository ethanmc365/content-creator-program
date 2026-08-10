-- 090  GROUP DMs
--
-- A conversation stops being a pair and becomes a room with a door.
--
-- WHY THE 1:1 TABLES ARE EXTENDED RATHER THAN A SECOND SET BUILT
--
-- `conversations` / `direct_messages` / `dm_reactions` already carry every
-- feature a group needs: media in a private bucket with signed URLs, replies,
-- reactions, read state, typing broadcast, the whole mobile overlay. A parallel
-- `group_conversations` table would mean re-implementing all of that and then
-- keeping two implementations in step forever - and the inbox would have to
-- merge two queries into one ordered list on every render.
--
-- So a conversation gains a `kind`. 'direct' is exactly what it is today and is
-- untouched by every line below; 'group' relaxes the two things that assumed a
-- pair, and membership moves into a table where it belongs.
--
-- THE TWO ASSUMPTIONS THAT HAD TO GO
--
-- 1. `conversations.participant_a/b` NOT NULL. A group has no "a" and "b".
--    They are nullable now, and a CHECK keeps a direct conversation honest:
--    it still cannot exist without both of them.
-- 2. `direct_messages.recipient_id` NOT NULL. A group message is addressed to
--    the room, not to a person. It is nullable now, and the policies pin it:
--    a message in a direct conversation MUST name its recipient and a message
--    in a group MUST NOT, so neither shape can be forged into the other.
--
-- Everything else - the DM gate for strangers, the reply-connects-you trigger,
-- the notification - keys off `recipient_id` and is skipped for groups, which
-- is correct: a group is not a cold approach to one person.

-- ---------------------------------------------------------------- 1. shape

alter table public.conversations
  add column if not exists kind text not null default 'direct',
  add column if not exists title text,
  add column if not exists photo_url text,
  add column if not exists accent text,
  add column if not exists emoji text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.conversations drop constraint if exists conversations_kind_chk;
alter table public.conversations
  add constraint conversations_kind_chk check (kind in ('direct', 'group'));

alter table public.conversations alter column participant_a drop not null;
alter table public.conversations alter column participant_b drop not null;

-- A direct conversation is still a pair; a group still has an owner. The shape
-- is enforced here rather than trusted to the client.
alter table public.conversations drop constraint if exists conversations_shape_chk;
alter table public.conversations
  add constraint conversations_shape_chk check (
    (kind = 'direct' and participant_a is not null and participant_b is not null)
    or (kind = 'group' and created_by is not null)
  );

alter table public.direct_messages alter column recipient_id drop not null;

-- ----------------------------------------------------------- 2. membership

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'member')),
  joined_at       timestamptz not null default now(),
  -- Unread in a group cannot be a boolean on the message: one row, many
  -- readers. It is a watermark per member instead, which is also how "N new"
  -- is counted without a second table.
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index if not exists conversation_members_profile_idx
  on public.conversation_members(profile_id);

-- An invite is a row, not a message. "Ethan added you to Lisbon Crew" with no
-- way to say no is not an invitation, and a group you were dropped into is the
-- fastest way to make somebody mute the product.
create table if not exists public.conversation_invites (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations(id) on delete cascade,
  invited_profile_id  uuid not null references public.profiles(id) on delete cascade,
  invited_by          uuid not null references public.profiles(id) on delete cascade,
  status              text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at          timestamptz not null default now(),
  unique (conversation_id, invited_profile_id)
);
create index if not exists conversation_invites_invitee_idx
  on public.conversation_invites(invited_profile_id, status);

alter table public.conversation_members enable row level security;
alter table public.conversation_invites enable row level security;

-- ------------------------------------------------------------- 3. helpers
--
-- SECURITY DEFINER because a policy on `conversation_members` that reads
-- `conversation_members` is infinitely recursive, and a policy that reads
-- another RLS-protected table sees it through that table's own policies, which
-- is how you end up with a rule that is true only for people who already have
-- the access it is deciding.
--
-- Each one answers a question about THE CALLER only - there is no profile
-- parameter to probe with - and each is granted to `authenticated`, never left
-- with Postgres's default EXECUTE-to-PUBLIC (see migration 081).

create or replace function public.in_conversation(p_conv uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conv and m.profile_id = auth.uid()
  ) or exists (
    select 1 from public.conversations c
    where c.id = p_conv
      and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
  );
$$;

create or replace function public.owns_conversation(p_conv uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conv and c.kind = 'group' and c.created_by = auth.uid()
  );
$$;

create or replace function public.has_pending_invite(p_conv uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.conversation_invites i
    where i.conversation_id = p_conv
      and i.invited_profile_id = auth.uid()
      and i.status = 'pending'
  );
$$;

create or replace function public.is_group_conversation(p_conv uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select kind = 'group' from public.conversations where id = p_conv), false);
$$;

revoke execute on function public.in_conversation(uuid) from public;
revoke execute on function public.owns_conversation(uuid) from public;
revoke execute on function public.has_pending_invite(uuid) from public;
revoke execute on function public.is_group_conversation(uuid) from public;
grant execute on function public.in_conversation(uuid) to authenticated;
grant execute on function public.owns_conversation(uuid) to authenticated;
grant execute on function public.has_pending_invite(uuid) to authenticated;
grant execute on function public.is_group_conversation(uuid) to authenticated;

-- --------------------------------------------------------- 4. the founder
--
-- Whoever makes a group is in it, as its owner, in the same statement. Leaving
-- that to a second client insert means a failure between the two produces a
-- group with nobody in it that nobody can see or delete.

create or replace function public.on_group_conversation()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.kind = 'group' and new.created_by is not null then
    insert into public.conversation_members (conversation_id, profile_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_on_group_conversation on public.conversations;
create trigger trg_on_group_conversation
  after insert on public.conversations
  for each row execute function public.on_group_conversation();

-- A member can rename a group and change its look. A member cannot turn a
-- group into a direct conversation, hand it a new owner, or move it under
-- somebody else - those are the columns the whole policy set is built on.
create or replace function public.protect_conversation_shape()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.kind is distinct from old.kind
     or new.created_by is distinct from old.created_by
     or new.participant_a is distinct from old.participant_a
     or new.participant_b is distinct from old.participant_b then
    if not public.is_admin() then
      raise exception 'A conversation''s participants and kind cannot be changed.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_conversation_shape on public.conversations;
create trigger trg_protect_conversation_shape
  before update on public.conversations
  for each row execute function public.protect_conversation_shape();

-- -------------------------------------------------------- 5. the triggers
--
-- Both of these read `new.recipient_id` and both are nonsense for a group.
-- `on_dm_reply_connect` would try to connect somebody to nobody;
-- `on_new_dm` would notify a null recipient, which the notifications table
-- rejects, and the message insert would fail with it.

create or replace function public.on_dm_reply_connect()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  -- A group message is not a cold approach to one person, so it neither needs
  -- nor implies a connection.
  if new.recipient_id is null then
    return new;
  end if;
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

create or replace function public.on_new_dm()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_name  text;
  v_title text;
  r       record;
begin
  select name into v_name from public.profiles where id = new.sender_id;

  if new.recipient_id is null then
    -- A group: everybody in the room except whoever just spoke. The same
    -- one-unread-per-conversation rule as a DM, so a lively group is one
    -- notification rather than forty.
    select coalesce(title, 'a group') into v_title
      from public.conversations where id = new.conversation_id;
    for r in
      select m.profile_id from public.conversation_members m
      where m.conversation_id = new.conversation_id
        and m.profile_id <> new.sender_id
    loop
      if not exists (
        select 1 from public.notifications n
        where n.recipient_id = r.profile_id
          and n.type = 'dm' and not n.read
          and n.link = '/messages/' || new.conversation_id
      ) then
        perform public.notify_user(
          r.profile_id, 'dm', 'New message in ' || v_title,
          coalesce(v_name, 'Someone') || ' posted in ' || v_title || '.',
          '/messages/' || new.conversation_id
        );
      end if;
    end loop;
    return new;
  end if;

  if not exists (
    select 1 from public.notifications n
    where n.recipient_id = new.recipient_id
      and n.type = 'dm' and not n.read
      and n.link = '/messages/' || new.conversation_id
  ) then
    perform public.notify_user(
      new.recipient_id, 'dm', 'New message',
      coalesce(v_name, 'Someone') || ' sent you a message.',
      '/messages/' || new.conversation_id
    );
  end if;
  return new;
end $$;

-- An invite is worth a notification; being ignored is what kills a group.
create or replace function public.on_conversation_invite()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_name  text;
  v_title text;
begin
  if new.status <> 'pending' then return new; end if;
  select name into v_name from public.profiles where id = new.invited_by;
  select coalesce(title, 'a group') into v_title
    from public.conversations where id = new.conversation_id;
  perform public.notify_user(
    new.invited_profile_id, 'dm', 'Group invite',
    coalesce(v_name, 'Someone') || ' invited you to ' || v_title || '.',
    '/messages'
  );
  return new;
end $$;

drop trigger if exists trg_on_conversation_invite on public.conversation_invites;
create trigger trg_on_conversation_invite
  after insert on public.conversation_invites
  for each row execute function public.on_conversation_invite();

-- --------------------------------------------------------- 6. the policies

-- `created_by` is in the READ policy for a reason that is not obvious.
--
-- `insert ... returning id` re-checks the SELECT policy against the new row,
-- and at that instant the founder is NOT yet a member: the trigger that adds
-- them is AFTER INSERT, and `in_conversation()` is STABLE so it reads a
-- snapshot the new row is not in. Without this clause, "make a group and give
-- me its id" fails with a row-level security error even though the insert
-- itself was allowed. Verified in a rolled-back transaction against the real
-- policies before this shipped.
drop policy if exists "conversations: participants read" on public.conversations;
create policy "conversations: participants read" on public.conversations
  for select using (
    participant_a = (select auth.uid())
    or participant_b = (select auth.uid())
    or created_by = (select auth.uid())
    or public.in_conversation(id)
  );

drop policy if exists "conversations: start as yourself" on public.conversations;
create policy "conversations: start as yourself" on public.conversations
  for insert with check (
    can_post() and (
      (kind = 'direct' and (participant_a = (select auth.uid()) or participant_b = (select auth.uid())))
      or (kind = 'group' and created_by = (select auth.uid()))
    )
  );

drop policy if exists "conversations: participants update" on public.conversations;
create policy "conversations: participants update" on public.conversations
  for update using (
    participant_a = (select auth.uid())
    or participant_b = (select auth.uid())
    or created_by = (select auth.uid())
    or public.in_conversation(id)
  );

-- Leaving a group is deleting your membership row. Deleting the GROUP is the
-- owner's call and nobody else's - otherwise any member could end the
-- conversation for everybody, which is a very different button from "leave".
drop policy if exists "conversations: participants delete" on public.conversations;
create policy "conversations: participants delete" on public.conversations
  for delete using (
    (kind = 'direct' and (participant_a = (select auth.uid()) or participant_b = (select auth.uid())))
    or (kind = 'group' and (created_by = (select auth.uid()) or is_admin()))
  );

-- `profile_id = auth.uid()` for the same RETURNING reason as above: joining a
-- group and reading the row back is one statement, and `in_conversation` cannot
-- see the row that statement is creating.
drop policy if exists "conversation_members: read" on public.conversation_members;
create policy "conversation_members: read" on public.conversation_members
  for select using (
    profile_id = (select auth.uid()) or public.in_conversation(conversation_id)
  );

-- You join yourself, and only with an invite in hand. The owner clause is for
-- the founding row the trigger writes; it runs as definer and so bypasses this,
-- but a policy that only makes sense alongside a trigger is a policy that
-- breaks the day the trigger is edited.
drop policy if exists "conversation_members: join" on public.conversation_members;
create policy "conversation_members: join" on public.conversation_members
  for insert with check (
    can_post() and profile_id = (select auth.uid())
    and (public.has_pending_invite(conversation_id) or public.owns_conversation(conversation_id))
  );

drop policy if exists "conversation_members: mark read" on public.conversation_members;
create policy "conversation_members: mark read" on public.conversation_members
  for update using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "conversation_members: leave or remove" on public.conversation_members;
create policy "conversation_members: leave or remove" on public.conversation_members
  for delete using (
    profile_id = (select auth.uid())
    or public.owns_conversation(conversation_id)
    or is_admin()
  );

drop policy if exists "conversation_invites: read" on public.conversation_invites;
create policy "conversation_invites: read" on public.conversation_invites
  for select using (
    invited_profile_id = (select auth.uid()) or public.in_conversation(conversation_id)
  );

-- Any member can invite. A group where only the founder can add people stops
-- growing the moment the founder gets busy, and the whole point of it is that
-- it is a room rather than a broadcast.
drop policy if exists "conversation_invites: members invite" on public.conversation_invites;
create policy "conversation_invites: members invite" on public.conversation_invites
  for insert with check (
    can_post() and invited_by = (select auth.uid()) and public.in_conversation(conversation_id)
  );

drop policy if exists "conversation_invites: answer" on public.conversation_invites;
create policy "conversation_invites: answer" on public.conversation_invites
  for update using (
    invited_profile_id = (select auth.uid()) or public.owns_conversation(conversation_id)
  );

drop policy if exists "conversation_invites: withdraw" on public.conversation_invites;
create policy "conversation_invites: withdraw" on public.conversation_invites
  for delete using (
    invited_profile_id = (select auth.uid())
    or invited_by = (select auth.uid())
    or public.owns_conversation(conversation_id)
  );

drop policy if exists "dms: participants read" on public.direct_messages;
create policy "dms: participants read" on public.direct_messages
  for select using (
    sender_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or public.in_conversation(conversation_id)
  );

-- The recipient column is what tells a direct message from a group one, so it
-- is pinned to the conversation's kind here. Without this a group member could
-- write a row with a recipient and slip a message into somebody's 1:1 unread
-- count, or address a DM to nobody and dodge the stranger gate entirely.
drop policy if exists "dms: send as yourself" on public.direct_messages;
create policy "dms: send as yourself" on public.direct_messages
  for insert with check (
    sender_id = (select auth.uid())
    and can_post()
    and public.in_conversation(conversation_id)
    and (
      case when public.is_group_conversation(conversation_id)
        then recipient_id is null
        else recipient_id is not null
             and dm_send_allowed(conversation_id, sender_id, recipient_id)
      end
    )
  );

drop policy if exists "dm_reactions: participants read" on public.dm_reactions;
create policy "dm_reactions: participants read" on public.dm_reactions
  for select using (
    exists (
      select 1 from public.direct_messages m
      where m.id = dm_reactions.message_id
        and (m.sender_id = (select auth.uid())
             or m.recipient_id = (select auth.uid())
             or public.in_conversation(m.conversation_id))
    )
  );

drop policy if exists "dm_reactions: add own" on public.dm_reactions;
create policy "dm_reactions: add own" on public.dm_reactions
  for insert with check (
    creator_id = (select auth.uid()) and can_post()
    and exists (
      select 1 from public.direct_messages m
      where m.id = dm_reactions.message_id
        and (m.sender_id = (select auth.uid())
             or m.recipient_id = (select auth.uid())
             or public.in_conversation(m.conversation_id))
    )
  );

-- ------------------------------------------------------------ 7. realtime

alter publication supabase_realtime add table public.conversation_members;
alter publication supabase_realtime add table public.conversation_invites;
