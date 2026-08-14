-- 097  Editing a message, and reporting one.
--
-- TWO THINGS EVERY CHAT SURFACE WAS MISSING, FROM OPPOSITE ENDS.
--
-- EDITING. A typo in a message is currently permanent: the only repair is to
-- delete it (admins only) or send a correction underneath. Five minutes is the
-- window on purpose. It is long enough to catch the thing you noticed the
-- instant you pressed send, and short enough that nobody can quietly rewrite
-- what they said after it has been read, replied to and reacted to. An `edited`
-- marker is not optional with an editable message: without it the record of a
-- conversation is no longer trustworthy, and the marker is what makes the
-- feature safe to have at all.
--
-- REPORTING. Moderation here is entirely admin-side - delete and mute - and a
-- creator on the receiving end of something has no way to raise it except to
-- DM an admin and hope. So: a creator reports, the report lands in an admin
-- queue with the message attached, and an admin decides.
--
-- WHY THE REPORT CARRIES A COPY OF THE MESSAGE. Two reasons, and the second is
-- the load-bearing one:
--   1. The message can be deleted (by its author's admin, or in the case of a
--      DM by anyone with the delete policy) between the report and the review,
--      and "the thing you reported is gone" is not a review.
--   2. RLS ON `direct_messages` IS PARTICIPANTS-ONLY. An admin is not in
--      somebody else's DM thread and cannot read a word of it - deliberately.
--      So a DM report that stored only an id would be unreviewable. Snapshotting
--      exactly the one message that was reported is also the privacy-correct
--      answer: it exposes the reported line and nothing else in the thread.

-- ---------------------------------------------------------------- editing

alter table public.messages        add column if not exists edited_at timestamptz;
alter table public.direct_messages add column if not exists edited_at timestamptz;

-- WHY AN RPC AND NOT AN UPDATE POLICY.
--
-- A policy would have to be "you may UPDATE your own row", and UPDATE is not
-- column-aware: the same permission that lets somebody fix a typo lets them
-- rewrite `channel`, flip `pinned`, hang an `image_url` off an old message or
-- move a message into #announcements. Pinning all of that down in a WITH CHECK
-- means naming every column the row has today and remembering to name the next
-- one somebody adds. A definer function that touches exactly `body` and
-- `edited_at` cannot have that bug.
create or replace function public.edit_message(p_id uuid, p_body text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.messages;
  v_now timestamptz := now();
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select * into v_row from public.messages where id = p_id;
  if not found then raise exception 'Message not found'; end if;
  if v_row.sender_id <> v_me then
    raise exception 'You can only edit your own messages';
  end if;
  if v_row.deleted then raise exception 'That message has been deleted'; end if;
  -- Muted or suspended: you cannot post, so you cannot edit either. Editing is
  -- posting with extra steps.
  if not public.can_post() then raise exception 'You cannot post right now'; end if;
  if v_row.created_at < v_now - interval '5 minutes' then
    raise exception 'The five minute edit window has passed';
  end if;
  -- A message with no words in it and no attachment is a deletion wearing an
  -- edit's clothes, and deletion is an admin action here.
  if coalesce(btrim(p_body), '') = ''
     and v_row.image_url is null and v_row.video_url is null and v_row.audio_url is null then
    raise exception 'A message cannot be emptied. Ask an admin to delete it.';
  end if;
  update public.messages
     set body = left(coalesce(p_body, ''), 4000), edited_at = v_now
   where id = p_id;
  return v_now;
end;
$$;

create or replace function public.edit_direct_message(p_id uuid, p_body text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.direct_messages;
  v_now timestamptz := now();
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  select * into v_row from public.direct_messages where id = p_id;
  if not found then raise exception 'Message not found'; end if;
  if v_row.sender_id <> v_me then
    raise exception 'You can only edit your own messages';
  end if;
  if not public.can_post() then raise exception 'You cannot post right now'; end if;
  if v_row.created_at < v_now - interval '5 minutes' then
    raise exception 'The five minute edit window has passed';
  end if;
  if coalesce(btrim(p_body), '') = '' and v_row.image_url is null then
    raise exception 'A message cannot be emptied.';
  end if;
  update public.direct_messages
     set body = left(coalesce(p_body, ''), 4000), edited_at = v_now
   where id = p_id;
  return v_now;
end;
$$;

-- REVOKE FROM `anon` BY NAME, NOT JUST FROM PUBLIC.
--
-- Supabase ships an ALTER DEFAULT PRIVILEGES that grants EXECUTE on every new
-- function to anon, authenticated and service_role EXPLICITLY. An explicit
-- grant is not removed by `revoke ... from public`, so a definer function that
-- looks locked down is still callable over PostgREST with the publishable anon
-- key. That is exactly what migration 081 had to fix for
-- recalc_challenge_points; it is the default, so it applies to every function
-- added here too.
revoke all on function public.edit_message(uuid, text) from public, anon;
revoke all on function public.edit_direct_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.edit_direct_message(uuid, text) to authenticated;

-- --------------------------------------------------------------- reporting

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  -- Which chat it came from. 'channel' covers the legacy rooms and every market
  -- room (they are all rows in `messages`); 'dm' covers 1:1 and group DMs.
  kind text not null check (kind in ('channel', 'dm')),
  -- ON DELETE SET NULL, never CASCADE: deleting the offending message must not
  -- delete the record that somebody objected to it.
  message_id uuid references public.messages(id) on delete set null,
  dm_id uuid references public.direct_messages(id) on delete set null,
  -- The copy taken at report time. See the header.
  author_id uuid references public.profiles(id) on delete set null,
  body_snapshot text,
  media_snapshot text,
  -- Where it was said: a channel key, or the conversation id. Enough for an
  -- admin to go and look without being handed the whole thread.
  context text,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'explicit', 'scam', 'other')),
  details text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'actioned', 'dismissed')),
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Exactly one target, matching the kind it claims to be.
  constraint message_reports_target_check check (
    (kind = 'channel' and dm_id is null) or (kind = 'dm' and message_id is null)
  )
);

create index if not exists message_reports_status_idx on public.message_reports (status, created_at desc);
create index if not exists message_reports_reporter_idx on public.message_reports (reporter_id);
-- One report per person per message. Reporting something twice is not twice as
-- bad, and a queue with the same message in it four times is a queue nobody
-- trusts. Partial indexes because the unused column is null on each kind.
create unique index if not exists message_reports_once_channel
  on public.message_reports (reporter_id, message_id) where message_id is not null;
create unique index if not exists message_reports_once_dm
  on public.message_reports (reporter_id, dm_id) where dm_id is not null;

alter table public.message_reports enable row level security;

-- No INSERT policy anywhere: the only way in is `report_message`, which is a
-- definer function. That is what guarantees the snapshot is taken and that you
-- can only report a message you were actually able to see.
create policy "reports: reporter and admins read"
  on public.message_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());

create policy "reports: admins update"
  on public.message_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "reports: admins delete"
  on public.message_reports for delete to authenticated
  using (public.is_admin());

-- The bell needs to be allowed to say this word.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'challenge','announcement','results','reward','deadline','connection','dm','event',
    'application','chat','submission','deletion','referral','new_member','inactive',
    'feedback','collab','mention','daily_streak','daily_reminder','board_answer','report'
  ])
);

create or replace function public.report_message(
  p_kind text,
  p_target uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_author uuid;
  v_body text;
  v_media text;
  v_context text;
  v_reporter uuid := auth.uid();
begin
  if v_reporter is null then raise exception 'Not signed in'; end if;
  if p_kind not in ('channel', 'dm') then raise exception 'Unknown kind'; end if;

  if p_kind = 'channel' then
    -- CAN THE REPORTER SEE IT? Mirrors `messages: read for members`. Without
    -- this check a definer function is a way to read any message id you can
    -- guess, straight back out through the snapshot on your own report.
    if not public.is_member() then raise exception 'Not allowed'; end if;
    select m.sender_id, m.body, coalesce(m.image_url, m.video_url, m.audio_url), m.channel
      into v_author, v_body, v_media, v_context
      from public.messages m where m.id = p_target and m.deleted = false;
    if not found then raise exception 'Message not found'; end if;
  else
    if not public.in_conversation(
      (select d.conversation_id from public.direct_messages d where d.id = p_target)
    ) then
      raise exception 'Not allowed';
    end if;
    select d.sender_id, d.body, d.image_url, d.conversation_id::text
      into v_author, v_body, v_media, v_context
      from public.direct_messages d where d.id = p_target;
    if not found then raise exception 'Message not found'; end if;
  end if;

  if v_author = v_reporter then
    raise exception 'You cannot report your own message';
  end if;

  insert into public.message_reports (
    reporter_id, kind, message_id, dm_id, author_id, body_snapshot, media_snapshot,
    context, reason, details
  ) values (
    v_reporter, p_kind,
    case when p_kind = 'channel' then p_target end,
    case when p_kind = 'dm' then p_target end,
    v_author, left(coalesce(v_body, ''), 4000), v_media,
    v_context, p_reason, left(nullif(btrim(coalesce(p_details, '')), ''), 1000)
  )
  -- Reporting the same message twice is a no-op rather than an error: the
  -- second press is somebody making sure it went through, not a new complaint.
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.notifications (recipient_id, type, title, body, link)
    select p.id, 'report', 'A message was reported',
           'Somebody reported a message for review.', '/admin/reports'
      from public.profiles p
     where p.is_admin = true and p.is_test = false;
  end if;

  return v_id;
end;
$$;

revoke all on function public.report_message(text, uuid, text, text) from public, anon;
grant execute on function public.report_message(text, uuid, text, text) to authenticated;

-- The admin side. An UPDATE policy already lets an admin set these directly;
-- this exists so the status, the reviewer and the timestamp can never drift
-- apart, which is exactly what happens when three fields are set by hand.
create or replace function public.decide_message_report(
  p_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_status not in ('new', 'reviewing', 'actioned', 'dismissed') then
    raise exception 'Unknown status';
  end if;
  update public.message_reports
     set status = p_status,
         admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note),
         reviewed_by = case when p_status in ('actioned', 'dismissed') then auth.uid() else reviewed_by end,
         reviewed_at = case when p_status in ('actioned', 'dismissed') then now() else reviewed_at end
   where id = p_id;
end;
$$;

revoke all on function public.decide_message_report(uuid, text, text) from public, anon;
grant execute on function public.decide_message_report(uuid, text, text) to authenticated;
