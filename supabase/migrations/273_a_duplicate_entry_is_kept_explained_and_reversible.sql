-- A DUPLICATE ENTRY IS KEPT, EXPLAINED, AND REVERSIBLE (28 Sep 2026).
--
-- Migration 263 added `submission_drop_resolved_duplicate`: once view-sync
-- resolves a vm.tiktok.com short link to a real video id, any other entry in the
-- challenge carrying that id is DELETED, keeping the earliest.
--
-- It is the right rule and it fired correctly - but three things about HOW it
-- fired turned a correct action into a complaint, and then into a question
-- nobody could answer.
--
-- Natalia had three entries removed this way (two on 26 Sep, one on 28 Sep at
-- 10:43). She saw thirty points become twenty-one and asked what had happened.
-- When Ethan asked whether those really were duplicates, THE ANSWER COULD NOT BE
-- PRODUCED: the rows were hard-deleted, `view_snapshots` cascaded with them, and
-- nothing anywhere recorded what the deleted entries had been or what they
-- collided with. All that survived was an audit line saying an entry was
-- deleted. The evidence needed to check the tool's work was destroyed by the
-- tool itself.
--
-- (The resolver was then checked by hand against all eight of her surviving
-- links: eight distinct video ids, every one matching what was stored, and the
-- sync writes each row from its own resolution. It is very probably right. The
-- point is that "very probably" is the best answer available, and it should not
-- have been.)
--
-- So, three changes:
--
--   1. ARCHIVE BEFORE DELETING, into `submission_duplicates`, exactly as
--      `submission_disqualifications` already does for a disqualification. The
--      row, its views, its captions and what it collided with are all kept, and
--      `reinstate_duplicate` puts it back.
--   2. TELL THE CREATOR. Points appearing and then quietly going away two days
--      later is the whole of why this hurt. They get a notification naming the
--      video and saying it was already entered.
--   3. NEVER ACROSS CREATORS. The old delete matched on
--      (challenge, platform_video_id) with no creator test, so if two creators
--      ever resolved to one id - a collab, a duet, a re-upload, or a resolver
--      fault - one of them silently lost their entry to the other. Within one
--      creator it is tidying up; across two it is taking somebody's work away on
--      a guess. That case now leaves both rows alone and puts an alert on the
--      admin desk instead.
--
-- The insert-time guard (`trg_one_video_one_entry`) is unchanged and still
-- challenge-wide, so submitting a video somebody else has entered is still
-- refused at the door, where it can be explained. This only governs what
-- happens when the collision is discovered LATE, which is the case that cannot
-- be explained at the door.

create table if not exists public.submission_duplicates (
  id                  uuid primary key,
  challenge_id        uuid not null references public.challenges(id) on delete cascade,
  creator_id          uuid references public.profiles(id) on delete set null,
  platform_video_id   text,
  kept_submission_id  uuid,
  snapshot            jsonb not null,
  detected_at         timestamptz not null default now()
);

create index if not exists submission_duplicates_challenge_idx
  on public.submission_duplicates (challenge_id, detected_at desc);

alter table public.submission_duplicates enable row level security;

-- An admin reviews these; a creator can see their own, so "we removed a
-- duplicate" is a claim they can check rather than one they must take on trust.
drop policy if exists "duplicates: admins read" on public.submission_duplicates;
create policy "duplicates: admins read" on public.submission_duplicates
  for select using (public.is_admin() or creator_id = auth.uid());

create or replace function public.submission_drop_resolved_duplicate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_keep    uuid;
  v_owner   uuid;
  v_title   text;
  v_others  int;
  r         record;
begin
  if new.platform_video_id is null or new.platform_video_id = '' then return new; end if;

  -- The FIRST entry of a video is the one that stands; every later copy goes.
  select s.id, s.creator_id into v_keep, v_owner
    from public.submissions s
   where s.challenge_id = new.challenge_id
     and s.platform_video_id = new.platform_video_id
   order by s.submitted_at, s.id
   limit 1;

  if v_keep is null then return new; end if;

  -- TWO CREATORS, ONE VIDEO: leave it alone and ask a person. Deleting here
  -- would hand one creator's entry to another on the strength of a string
  -- match, and the cases that produce it (a collab, a duet, a re-upload, a
  -- resolver fault) are exactly the ones that need judgement.
  select count(*) into v_others
    from public.submissions s
   where s.challenge_id = new.challenge_id
     and s.platform_video_id = new.platform_video_id
     and s.creator_id is distinct from v_owner;

  if v_others > 0 then
    begin
      perform public.report_system_error(
        'submissions',
        'duplicate_across_creators:' || new.challenge_id || ':' || new.platform_video_id,
        'Two creators have entered the same video',
        'Video ' || new.platform_video_id || ' is entered by more than one creator in this '
          || 'challenge. Nothing has been removed. Open the entries and decide which stands.',
        '/admin/challenges/' || new.challenge_id || '/results');
    exception when others then
      raise warning 'could not report duplicate across creators for %: %', new.platform_video_id, sqlerrm;
    end;
    return new;
  end if;

  select title into v_title from public.challenges where id = new.challenge_id;

  for r in
    select * from public.submissions s
     where s.challenge_id = new.challenge_id
       and s.platform_video_id = new.platform_video_id
       and s.id <> v_keep
       and s.creator_id is not distinct from v_owner
  loop
    -- KEPT BEFORE IT IS REMOVED. `on conflict do nothing` because the id is the
    -- submission's own: re-detecting the same duplicate must not fail the sync.
    insert into public.submission_duplicates
      (id, challenge_id, creator_id, platform_video_id, kept_submission_id, snapshot)
    values (r.id, r.challenge_id, r.creator_id, r.platform_video_id, v_keep, to_jsonb(r))
    on conflict (id) do nothing;

    -- SAY SO. Wrapped, because a notification that cannot be written must not
    -- roll back a sync - but `submission` is an existing type, deliberately, so
    -- this does not depend on the type check having been widened. A new type
    -- that is not in `notifications_type_check` fails EVERY insert, and that has
    -- already cost this project a silent outage once.
    begin
      insert into public.notifications (recipient_id, type, title, body, link)
      values (
        r.creator_id,
        'submission',
        'We removed a repeated entry',
        'One of your videos was entered twice in ' || coalesce(v_title, 'a challenge')
          || '. TikTok makes a new share link every time you press Share, so the two links '
          || 'looked different but pointed at the same video. Your original entry is still '
          || 'in and still scoring - only the repeat was removed.',
        '/challenges/' || r.challenge_id);
    exception when others then
      raise warning 'could not notify % about duplicate %: %', r.creator_id, r.id, sqlerrm;
    end;
  end loop;

  delete from public.submissions s
   where s.challenge_id = new.challenge_id
     and s.platform_video_id = new.platform_video_id
     and s.id <> v_keep
     and s.creator_id is not distinct from v_owner;

  return new;
end;
$$;

-- Put one back. Same shape as `reinstate_submission`, and the same guards: an
-- admin only, never the sandbox demo account.
create or replace function public.reinstate_duplicate(p_submission uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare d public.submission_duplicates%rowtype;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_sandbox) then
    raise exception 'SANDBOX_READ_ONLY: this demo account cannot reinstate entries.';
  end if;
  select * into d from public.submission_duplicates where id = p_submission for update;
  if not found then raise exception 'No removed duplicate with that id.'; end if;

  -- The row goes back as it was, EXCEPT its video id, which is cleared. Putting
  -- it back with the id still on it would collide with the entry that was kept
  -- and the trigger would remove it again on the next sync - a reinstate that
  -- silently undoes itself. Cleared, it is re-resolved on the next sweep, and if
  -- it really is a duplicate it will be caught again and archived again, which
  -- is the honest outcome.
  insert into public.submissions
  select * from jsonb_populate_record(null::public.submissions, d.snapshot - 'platform_video_id');

  delete from public.submission_duplicates where id = d.id;
end;
$$;

revoke all on function public.reinstate_duplicate(uuid) from public;
grant execute on function public.reinstate_duplicate(uuid) to authenticated;
