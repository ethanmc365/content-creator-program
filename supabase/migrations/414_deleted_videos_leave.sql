-- 414: AN ENTRY WHOSE VIDEO HAS BEEN DELETED LEAVES THE CHALLENGE BY ITSELF (14 Oct 2026).
--
-- Ethan: "any video that was actually deleted should just be removed. You don't need me to say this." The sync already
-- marks such entries `views_sync_error = 'removed'` (TikTok/Instagram answered that the post is gone or private), and
-- they sat on the boards with their last view count. Now:
--   * `removed_seen_at` stamps the first sync that saw it gone (cleared if it comes back);
--   * a second sync at least 20 hours later that still sees it gone archives the entry into
--     `submission_disqualifications` (the same record early posts use, snapshot kept) and deletes it, which re-scores
--     the board through the existing delete triggers, and tells the creator why.
-- Two reads a day apart, so one bad answer from a platform can never remove a live video.
-- The eight entries already marked removed on 14 Oct were checked by hand (TikTok's own oEmbed refuses every one while
-- answering for a live video) and leave now.

alter table submissions add column if not exists removed_seen_at timestamptz;

create or replace function submission_removed_seen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.views_sync_error = 'removed' then
    new.removed_seen_at := coalesce(old.removed_seen_at, now());
  else
    new.removed_seen_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_submission_removed_seen on submissions;
create trigger trg_submission_removed_seen
  before update of views_sync_error, views_synced_at on submissions
  for each row execute function submission_removed_seen();

create or replace function submission_leave_if_gone(p_id uuid, p_notify boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s submissions%rowtype;
  v_title text;
  v_reason text := 'The video for this entry is no longer online (it was deleted or made private), so the entry was removed. Post it again, or a new video, to take part.';
begin
  select * into s from submissions where id = p_id;
  if not found then return false; end if;
  select title into v_title from challenges where id = s.challenge_id;
  begin
    insert into submission_disqualifications (id, challenge_id, creator_id, snapshot, reason, disqualified_by)
    values (s.id, s.challenge_id, s.creator_id, to_jsonb(s), v_reason, null)
    on conflict (id) do update set snapshot = excluded.snapshot, reason = excluded.reason,
      disqualified_by = null, disqualified_at = now();
    delete from submissions where id = s.id;
  exception when others then
    raise warning 'could not remove gone entry %: %', s.id, sqlerrm;
    return false;
  end;
  if not p_notify then return true; end if;
  begin
    perform notify_user(s.creator_id, 'submission',
      'An entry was removed from ' || coalesce(v_title, 'the challenge'), v_reason, '/challenges/' || s.challenge_id);
  exception when others then
    raise warning 'could not notify % about gone entry %: %', s.creator_id, s.id, sqlerrm;
  end;
  return true;
end $$;

create or replace function submission_remove_when_gone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.views_sync_error = 'removed' and new.removed_seen_at is not null
     and new.removed_seen_at < now() - interval '20 hours' then
    perform submission_leave_if_gone(new.id);
  end if;
  return new;
end $$;

drop trigger if exists trg_submission_zz_remove_when_gone on submissions;
create trigger trg_submission_zz_remove_when_gone
  after update of views_sync_error, views_synced_at on submissions
  for each row when (new.views_sync_error = 'removed')
  execute function submission_remove_when_gone();

-- Internal only.
insert into owner_only_rpcs (proname, why) values ('submission_leave_if_gone', 'removes an entry; called by the sync trigger only') on conflict do nothing;
select lock_down_definer_functions();

-- The eight verified on 14 Oct: one message per creator rather than one per entry.
do $$
declare r record;
begin
  for r in select creator_id, challenge_id, count(*) n from submissions where views_sync_error = 'removed' group by 1, 2 loop
    perform submission_leave_if_gone(s.id, false) from submissions s
     where s.creator_id = r.creator_id and s.challenge_id = r.challenge_id and s.views_sync_error = 'removed';
    perform notify_user(r.creator_id, 'submission',
      'Entries removed from ' || coalesce((select title from challenges where id = r.challenge_id), 'the challenge'),
      case when r.n = 1 then 'One of your videos is no longer online (deleted or made private), so its entry was removed.'
           else r.n || ' of your videos are no longer online (deleted or made private), so their entries were removed.' end,
      '/challenges/' || r.challenge_id);
  end loop;
end $$;
