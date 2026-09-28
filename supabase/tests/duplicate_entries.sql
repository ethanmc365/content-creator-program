-- REHEARSAL: what happens to a duplicate entry (migration 273).
--
-- Run against prod. Everything is rolled back by the raise at the end, which is
-- the pattern the other rehearsals in this directory follow.
--
-- WHAT THIS IS FOR. Migration 263's trigger removed three of Natalia's entries
-- and, when asked whether they had really been duplicates, no answer could be
-- produced: the rows were hard-deleted and their view_snapshots cascaded away.
-- 273 makes the removal keep its evidence, explain itself to the creator, and
-- stop short of ever acting across two creators. Those are exactly the three
-- things this checks, because all three are invisible until something goes
-- wrong and then it is too late to look.
--
--   psql "$DATABASE_URL" -f supabase/tests/duplicate_entries.sql
--
-- Expect: P0001 "REHEARSAL PASSED (rolling back)" with six ok lines.

do $$
declare
  v_comm    uuid;
  v_ch      uuid;
  v_a       uuid;
  v_b       uuid;
  v_first   uuid := gen_random_uuid();
  v_second  uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();
  n         int;
  ok        text := '';
begin
  select id into v_comm from public.communities limit 1;
  select id into v_a from public.profiles where is_test order by created_at limit 1;
  select id into v_b from public.profiles where id <> v_a order by created_at limit 1;

  insert into public.challenges (id, title, description, start_date, end_date, status, community_id, scoring)
  values (gen_random_uuid(), 'REHEARSAL 273', '', now() - interval '2 days', now() + interval '5 days', 'active', v_comm, 'points')
  returning id into v_ch;

  -- TWO ENTRIES, TWO DIFFERENT SHORT LINKS, NO VIDEO ID YET. This is the real
  -- shape of the fault: TikTok mints a new vm.tiktok.com code on every Share, so
  -- one video submitted twice arrives as two links with nothing in common, and
  -- the insert-time guard (which keys on the URL) cannot see through them.
  insert into public.submissions (id, creator_id, challenge_id, platform, video_url, caption, submitted_at)
  values (v_first,  v_a, v_ch, 'TikTok', 'https://vm.tiktok.com/REHEARSALaaa/', 'first',  now() - interval '2 hours'),
         (v_second, v_a, v_ch, 'TikTok', 'https://vm.tiktok.com/REHEARSALbbb/', 'second', now() - interval '1 hour');

  -- view-sync resolves both to the SAME video. Setting it fires the trigger.
  update public.submissions set platform_video_id = '9999999999999999999' where id = v_first;
  update public.submissions set platform_video_id = '9999999999999999999' where id = v_second;

  select count(*) into n from public.submissions where id = v_second;
  if n <> 0 then raise exception 'FAIL: later duplicate still in submissions'; end if;
  ok := ok || E'\n  ok  later duplicate removed';

  -- The EARLIEST stands. Deleting the wrong one of the pair would take the
  -- entry that has been scoring and leave the one nobody has seen.
  select count(*) into n from public.submissions where id = v_first;
  if n <> 1 then raise exception 'FAIL: the original was removed'; end if;
  ok := ok || E'\n  ok  original kept';

  -- THE EVIDENCE SURVIVES. This is the whole point of 273: the row, its views,
  -- its caption and what it collided with are all still here to be reviewed.
  select count(*) into n from public.submission_duplicates
   where id = v_second and kept_submission_id = v_first
     and snapshot->>'caption' = 'second' and platform_video_id = '9999999999999999999';
  if n <> 1 then raise exception 'FAIL: not archived with its snapshot'; end if;
  ok := ok || E'\n  ok  archived with snapshot and kept_submission_id';

  -- AND THE CREATOR IS TOLD. Points appearing and then quietly going away two
  -- days later is the whole of why this hurt the first time.
  select count(*) into n from public.notifications
   where recipient_id = v_a and title = 'We removed a repeated entry';
  if n < 1 then raise exception 'FAIL: creator was not notified'; end if;
  ok := ok || E'\n  ok  creator notified';

  -- REINSTATE CLEARS THE VIDEO ID. Putting the row back with its id still on it
  -- would collide with the kept entry and the trigger would remove it again on
  -- the next sync: a reinstate that silently undoes itself.
  insert into public.submissions
  select * from jsonb_populate_record(null::public.submissions,
    (select snapshot - 'platform_video_id' from public.submission_duplicates where id = v_second));
  delete from public.submission_duplicates where id = v_second;
  select count(*) into n from public.submissions where id = v_second and platform_video_id is null;
  if n <> 1 then raise exception 'FAIL: reinstate did not restore it cleanly'; end if;
  ok := ok || E'\n  ok  reinstate restores it with the video id cleared';
  delete from public.submissions where id = v_second;

  -- ACROSS CREATORS, NOTHING IS REMOVED. The old trigger matched on
  -- (challenge, platform_video_id) with no creator test at all, so a collab, a
  -- duet, a re-upload or a resolver fault would have handed one creator's entry
  -- to another. Both stand now and an admin alert is raised instead.
  insert into public.submissions (id, creator_id, challenge_id, platform, video_url, caption, submitted_at)
  values (v_other, v_b, v_ch, 'TikTok', 'https://vm.tiktok.com/REHEARSALccc/', 'someone else', now());
  update public.submissions set platform_video_id = '9999999999999999999' where id = v_other;
  select count(*) into n from public.submissions where id in (v_first, v_other);
  if n <> 2 then raise exception 'FAIL: a cross-creator collision deleted somebody (n=%)', n; end if;
  ok := ok || E'\n  ok  two creators, one video: nothing removed';

  raise exception E'REHEARSAL PASSED (rolling back):%', ok;
end $$;
