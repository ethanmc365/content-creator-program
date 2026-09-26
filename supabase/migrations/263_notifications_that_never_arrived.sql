-- NOTIFICATIONS THAT NEVER ARRIVED, AND A VIDEO ENTERED TWICE (26 Sep 2026)
--
-- Ethan: "I remember we have the daily puzzle reminders (a streak reminder),
-- but I haven't been getting these notifications at all." An audit of every
-- path that writes a notification found four that could not work:
--
-- 1. The puzzle reminders skipped every ADMIN (`not p.is_admin`). The owner
--    plays the puzzles every day and could never be reminded. Admins are
--    people who play too; the test accounts are still left out.
-- 2. Settings offers a "1 day before" deadline reminder and the client writes
--    it, but the nightly job only ever looked at 14, 7, 5 and 3 days out.
-- 3. Deciding a market join request notified the creator with type
--    'community', which is not in notifications_type_check. The insert failed,
--    and because it runs inside decide_join_request the WHOLE decision rolled
--    back: accepting or declining a request raised an error every time.
-- 4. Settings has had a "Results" switch since launch and nothing ever wrote a
--    'results' row. Publishing a challenge's winners now tells everybody who
--    entered, pointing at the challenge, where their recap is waiting.
--
-- 5 (not a notification). A TikTok SHARE link (vm.tiktok.com/XXXX) is
--    different every time somebody shares, so the insert guard that stops one
--    video being entered twice could not see that two short links were the
--    same video until view-sync resolved them. Four pairs got through on the
--    Global Challenge. Once the id is known, the later entry now goes.

-- 3 -------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type = any (array[
  'challenge','announcement','results','reward','deadline','connection','dm','event',
  'application','chat','submission','deletion','referral','new_member','inactive',
  'feedback','collab','mention','daily_streak','daily_reminder','board_answer','report',
  'event_reminder','event_rating','reaction','community'
]));

-- 1 -------------------------------------------------------------------------
create or replace function public.send_daily_puzzle_reminders(kind text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_today   int := ((now() at time zone 'Europe/London')::date - date '1970-01-01');
  v_type    text;
  v_title   text;
  v_body    text;
begin
  if kind = 'streak' then
    v_type  := 'daily_streak';
    v_title := 'Keep your streak alive 🔥';
    v_body  := 'You have a daily puzzle streak going. Play today''s puzzle before midnight to keep it.';
  elsif kind = 'reminder' then
    v_type  := 'daily_reminder';
    v_title := 'Today''s puzzles are live 🧩';
    v_body  := 'Guess the Country and land the plane in Flight Path. Can you keep a perfect run going?';
  else
    return;
  end if;

  insert into public.notifications (recipient_id, type, title, body, link)
  select p.id, v_type, v_title, v_body, '/game'
  from public.profiles p
  where p.status = 'active'
    and coalesce(p.is_test, false) = false
    and p.deletion_requested_at is null
    and (
      (kind = 'streak'   and coalesce((p.notif_prefs ->> 'daily_streak')::boolean, true)  = true)
      or
      (kind = 'reminder' and coalesce((p.notif_prefs ->> 'daily_reminder')::boolean, false) = true)
    )
    and not exists (
      select 1 from public.game_scores g
      where g.player_id = p.id and g.event_id is null
        and g.mode in ('zip','pinpoint') and g.day_key = v_today
    )
    and (
      kind <> 'streak'
      or exists (
        select 1 from public.game_scores g
        where g.player_id = p.id and g.event_id is null
          and g.mode in ('zip','pinpoint') and g.day_key = v_today - 1
      )
    )
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = p.id and n.type = v_type
        and n.created_at > now() - interval '20 hours'
    );
end;
$function$;

-- 2 -------------------------------------------------------------------------
create or replace function public.send_challenge_reminders()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c record; d int;
begin
  for c in select id, title, end_date, community_id from public.challenges
            where status = 'active' and end_date > now() loop
    foreach d in array array[14,7,5,3,1] loop
      if (c.end_date::date - current_date) = d then
        with recips as (
          select p.id as creator_id
          from public.profiles p
          where p.status = 'active' and not p.is_admin and p.deletion_requested_at is null
            and d = any(p.challenge_reminder_days)
            and (c.community_id is null or exists (
                  select 1 from public.community_members m
                   where m.community_id = c.community_id and m.profile_id = p.id and m.status = 'active'))
            and not exists (select 1 from public.challenge_reminders_sent r
                             where r.challenge_id = c.id and r.creator_id = p.id and r.days_before = d)
        ), notified as (
          insert into public.notifications (recipient_id, type, title, body, link)
          select creator_id, 'deadline',
                 case when d = 1 then 'Last day tomorrow' else d || ' days left' end,
                 '"' || c.title || '" closes in ' || d || (case when d = 1 then ' day' else ' days' end) || '. Get your entries in before the deadline.',
                 '/challenges/' || c.id
          from recips returning 1
        )
        insert into public.challenge_reminders_sent (challenge_id, creator_id, days_before)
        select c.id, creator_id, d from recips;
      end if;
    end loop;
  end loop;
end; $function$;

-- 4 -------------------------------------------------------------------------
create or replace function public.on_winners_published()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.winners_published_at is not null
     and (tg_op = 'INSERT' or old.winners_published_at is distinct from new.winners_published_at) then
    perform public.award_challenge_prizes_internal(new.id, false);

    -- ONLY THE FIRST PUBLICATION ANNOUNCES ITSELF. Re-publishing after a
    -- correction must not buzz every entrant a second time. And a bookkeeping
    -- side effect never aborts the thing it is announcing.
    if tg_op = 'INSERT' or old.winners_published_at is null then
      begin
        insert into public.notifications (recipient_id, type, title, body, link)
        select distinct s.creator_id, 'results',
               'Results are in: ' || new.title,
               'The final leaderboard is published. See where you finished, and open your recap.',
               '/challenges/' || new.id
          from public.submissions s
          join public.profiles p on p.id = s.creator_id
         where s.challenge_id = new.id
           and p.status in ('active', 'muted')
           and not coalesce(p.is_test, false);
      exception when others then
        raise warning 'results notification failed for %: %', new.id, sqlerrm;
      end;
    end if;
  end if;
  return new;
end $function$;

-- 5 -------------------------------------------------------------------------
create or replace function public.submission_drop_resolved_duplicate()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_keep uuid;
begin
  if new.platform_video_id is null or new.platform_video_id = '' then return new; end if;

  -- The FIRST entry of a video is the one that stands; every later copy goes.
  select s.id into v_keep
    from public.submissions s
   where s.challenge_id = new.challenge_id
     and s.platform_video_id = new.platform_video_id
   order by s.submitted_at, s.id
   limit 1;

  delete from public.submissions s
   where s.challenge_id = new.challenge_id
     and s.platform_video_id = new.platform_video_id
     and s.id <> v_keep;
  return new;
end $function$;

revoke all on function public.submission_drop_resolved_duplicate() from public, anon, authenticated;

drop trigger if exists trg_drop_resolved_duplicate on public.submissions;
create trigger trg_drop_resolved_duplicate
  after update of platform_video_id on public.submissions
  for each row
  when (new.platform_video_id is not null and old.platform_video_id is distinct from new.platform_video_id)
  execute function public.submission_drop_resolved_duplicate();

-- The pairs already in the table.
delete from public.submissions s
 using public.submissions k
 where k.challenge_id = s.challenge_id
   and k.platform_video_id = s.platform_video_id
   and s.platform_video_id is not null
   and (k.submitted_at, k.id) < (s.submitted_at, s.id);
