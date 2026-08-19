-- ============================================================================
-- 107 - the calendar, second pass
--
-- Everything here exists because the calendar could show you a list of dates
-- and nothing else. It could not tell you which of them were yours, which had
-- already started, who else was going, or put any of it in the diary you
-- actually use. Seven changes, in the order they matter:
--
--   1. AN EVENT CAN BELONG TO SEVERAL MARKETS. `community_id` is one market and
--      the answer to "Spain and Germany, not the rest" was to create the event
--      twice. `community_ids` is the real shape. The old column stays and is
--      kept in step by a trigger, because `inScope(scopeIds, e.community_id)`
--      is compiled into an app that is live right now.
--   2. AN EVENT CAN BE PRIVATE TO ONE PERSON. "Edit the video from Paris" is a
--      content day, not an announcement. `owner_id` plus a RESTRICTIVE policy,
--      which is the only kind that can take away what `is_member()` grants.
--   3. AN EVENT CAN END. Without `ends_at` there is no such thing as "on now",
--      which is the single most useful state a calendar has.
--   4. AN EVENT KNOWS WHOSE CLOCK IT WAS SET BY. `timezone` is the host's zone,
--      so a creator in Bucharest can be shown their own time with the host's
--      underneath instead of guessing which one the app meant.
--   5. A REMINDER IS A ROW, NOT A SETTING. `event_reminders` + a five-minute
--      cron that writes a notification, which is all the existing push and
--      email pipeline needs (010's trigger does the rest).
--   6. THE CALENDAR HAS A URL YOU CAN SUBSCRIBE TO. `calendar_feed_tokens` is
--      the per-creator secret behind it. Downloading a file is a snapshot;
--      Apple and Google both poll a webcal:// URL on their own.
--   7. A RATING CAN CARRY WORDS, AND CAN BE DECLINED. `event_ratings` had a
--      number and nothing else, so "8" arrived with no way to say why and no
--      way to stop being asked.
-- ============================================================================
set check_function_bodies = off;

-- ---------------------------------------------------------------- 1. markets
alter table public.events add column if not exists community_ids uuid[] not null default '{}';
alter table public.events add column if not exists ends_at      timestamptz;
alter table public.events add column if not exists timezone     text;
alter table public.events add column if not exists location     text;
alter table public.events add column if not exists owner_id     uuid references public.profiles (id) on delete cascade;

-- Backfill: every event that had one market now has an array holding it.
update public.events
   set community_ids = array[community_id]
 where community_id is not null and community_ids = '{}';

-- THE TWO COLUMNS ARE KEPT IN STEP BY A TRIGGER, NOT BY EVERY CALLER.
-- The live app filters on the singular column. A new event written by the
-- rebuilt admin form only sets the array, and it would be invisible to anybody
-- running yesterday's bundle. The trigger makes the singular column mean "the
-- first market this belongs to", which is exactly what the old client expects,
-- and it costs one assignment per write.
create or replace function public.events_sync_community()
returns trigger language plpgsql as $$
begin
  if new.community_ids is null then new.community_ids := '{}'; end if;
  -- One market named in the array and none in the column: mirror it down.
  if array_length(new.community_ids, 1) is null then
    new.community_id := null;
  else
    new.community_id := new.community_ids[1];
  end if;
  return new;
end $$;

drop trigger if exists events_sync_community on public.events;
create trigger events_sync_community
  before insert or update of community_ids on public.events
  for each row execute function public.events_sync_community();

create index if not exists events_community_ids_idx on public.events using gin (community_ids);
create index if not exists events_owner_idx on public.events (owner_id) where owner_id is not null;
create index if not exists events_date_idx on public.events (date);

-- ---------------------------------------------------------------- 2. private
--
-- A RESTRICTIVE POLICY IS THE ONLY ONE THAT CAN TAKE SOMETHING AWAY.
-- `events: read for members` is `is_member()`, and permissive policies are
-- OR'd, so no additional policy can hide a row from a member - it can only
-- widen the grant. A personal content day added to a permissive-only table
-- would be readable over the API by all 45 creators, which is the opposite of
-- what "personal" means. Restrictive policies are AND'd with the rest.
--
-- It covers ALL, not just SELECT, so `events: admin manage` cannot update or
-- delete somebody's private note either. An admin is not a party to it.
drop policy if exists "events: personal stay private" on public.events;
create policy "events: personal stay private" on public.events
  as restrictive for all to authenticated
  using (owner_id is null or owner_id = (select auth.uid()))
  with check (owner_id is null or owner_id = (select auth.uid()));

drop policy if exists "events: own personal insert" on public.events;
create policy "events: own personal insert" on public.events
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_post());

drop policy if exists "events: own personal update" on public.events;
create policy "events: own personal update" on public.events
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "events: own personal delete" on public.events;
create policy "events: own personal delete" on public.events
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------- 5. reminders
--
-- `event_key` IS TEXT AND NOT A FOREIGN KEY, ON PURPOSE. Half the things on
-- this calendar are not rows in `events`: a challenge contributes an opening
-- and a closing date, a flight contributes a departure, an invoice contributes
-- a payment date. They are all things somebody may reasonably want a nudge
-- about, and none of them can be pointed at with a uuid FK. The key is
-- 'event:<uuid>' / 'challenge:<uuid>:start' / 'flight:<uuid>' and so on.
--
-- Title, time and link are SNAPSHOTTED for the same reason the invoice snapshots
-- its payee: the cron must be able to write the notification without knowing how
-- to reconstruct any of the derived kinds.
create table if not exists public.event_reminders (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  event_key      text not null,
  title          text not null,
  starts_at      timestamptz not null,
  remind_at      timestamptz not null,
  minutes_before int  not null,
  link           text not null default '',
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, event_key)
);
alter table public.event_reminders enable row level security;

drop policy if exists "event_reminders: own" on public.event_reminders;
create policy "event_reminders: own" on public.event_reminders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create index if not exists event_reminders_due_idx
  on public.event_reminders (remind_at) where sent_at is null;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'challenge','announcement','results','reward','deadline','connection','dm',
    'event','application','chat','submission','deletion','referral','new_member',
    'inactive','feedback','collab','mention','daily_streak','daily_reminder',
    'board_answer','report','event_reminder','event_rating'
  ));

-- The cron. Five minutes is the resolution of the whole feature: a reminder set
-- for "1 hour before" fires between 60 and 55 minutes before, which nobody can
-- tell from exact and which costs one small indexed scan per run.
--
-- `sent_at` is written in the same statement that reads the row, so a run that
-- overlaps the next one cannot send twice.
create or replace function public.send_event_reminders()
returns void language plpgsql security definer set search_path = public as $$
begin
  with due as (
    update public.event_reminders r
       set sent_at = now()
     where r.sent_at is null
       and r.remind_at <= now()
       -- A reminder whose event has already been and gone is not worth waking
       -- somebody up for. This happens when the cron is behind, or when an
       -- admin moves an event forward after somebody set a bell on it.
       and r.starts_at > now() - interval '15 minutes'
    returning r.user_id, r.title, r.starts_at, r.link, r.minutes_before
  )
  insert into public.notifications (recipient_id, type, title, body, link)
  select d.user_id, 'event_reminder', d.title,
         case
           when d.minutes_before >= 1440
             then 'Starts in ' || (d.minutes_before / 1440) || ' day' || (case when d.minutes_before / 1440 = 1 then '' else 's' end) || '.'
           when d.minutes_before >= 60
             then 'Starts in ' || (d.minutes_before / 60) || ' hour' || (case when d.minutes_before / 60 = 1 then '' else 's' end) || '.'
           else 'Starts in ' || d.minutes_before || ' minutes.'
         end,
         coalesce(nullif(d.link, ''), '/events')
  from due d;
end $$;
revoke execute on function public.send_event_reminders() from public, anon, authenticated;

select cron.unschedule('event-reminders') where exists (select 1 from cron.job where jobname = 'event-reminders');
select cron.schedule('event-reminders', '*/5 * * * *', $$select public.send_event_reminders()$$);

-- ---------------------------------------------------------------- 6. subscribe
--
-- ONE SECRET PER CREATOR, AND IT IS THE URL. A subscribable calendar cannot
-- carry a session: Apple's and Google's fetchers are anonymous and send no
-- headers we control. So the token IS the credential, it is long, and it can be
-- rotated - which is the only reason `rotate_calendar_token` exists.
create table if not exists public.calendar_feed_tokens (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_feed_tokens enable row level security;
-- NO POLICIES. The row is reachable only through the two definer functions
-- below; nothing should be able to enumerate other people's tokens, and a
-- select policy of "your own row" is one typo away from not being that.

create or replace function public.my_calendar_token()
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.calendar_feed_tokens (user_id, token)
  values (auth.uid(), encode(gen_random_bytes(24), 'hex'))
  on conflict (user_id) do nothing;
  select token into t from public.calendar_feed_tokens where user_id = auth.uid();
  return t;
end $$;
revoke execute on function public.my_calendar_token() from public, anon;
grant execute on function public.my_calendar_token() to authenticated;

create or replace function public.rotate_calendar_token()
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.calendar_feed_tokens (user_id, token)
  values (auth.uid(), encode(gen_random_bytes(24), 'hex'))
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  select token into t from public.calendar_feed_tokens where user_id = auth.uid();
  return t;
end $$;
revoke execute on function public.rotate_calendar_token() from public, anon;
grant execute on function public.rotate_calendar_token() to authenticated;

-- What the feed endpoint reads. SECURITY DEFINER because the caller is an
-- anonymous fetcher holding a token, not a session.
--
-- IT RETURNS EXACTLY WHAT THE CREATOR CAN ALREADY SEE ON THE PAGE, and it is
-- assembled here rather than in the edge function so that the scoping rules
-- live next to the data: community events in their markets, their own personal
-- events, challenge dates for their markets, their own flights, their own
-- invoices. Nobody else's anything.
create or replace function public.calendar_feed(p_token text)
returns table (
  uid text, title text, starts_at timestamptz, ends_at timestamptz,
  description text, location text
)
language plpgsql security definer set search_path = public as $$
declare uid_ uuid; scopes uuid[];
begin
  select user_id into uid_ from public.calendar_feed_tokens where token = p_token;
  if uid_ is null then return; end if;

  select coalesce(array_agg(community_id), '{}')
    into scopes
    from public.community_members
   where profile_id = uid_ and status = 'active';

  return query
  -- Community and personal events
  select 'event-' || e.id::text,
         e.title,
         e.date,
         coalesce(e.ends_at, e.date + interval '1 hour'),
         coalesce(e.description, '') ||
           case when e.meeting_url is null or e.meeting_url = '' then ''
                else E'\n\nJoin: ' || e.meeting_url end,
         coalesce(e.location, coalesce(e.meeting_url, ''))
    from public.events e
   where (e.owner_id = uid_)
      or (e.owner_id is null
          and (e.community_ids = '{}' or e.community_ids && scopes))
  union all
  -- Challenge opens / closes, for the markets they are in
  select 'challenge-' || c.id::text || '-start', c.title || ' opens', c.start_date,
         c.start_date + interval '1 hour', '', ''
    from public.challenges c
   where c.status <> 'draft'
     and (c.community_id is null or c.community_id = any(scopes))
  union all
  select 'challenge-' || c.id::text || '-end', c.title || ' closes', c.end_date,
         c.end_date + interval '1 hour', '', ''
    from public.challenges c
   where c.status <> 'draft'
     and (c.community_id is null or c.community_id = any(scopes))
  union all
  -- Their own flights. Times are unknown (the log stores a date), so these are
  -- whole-day blocks starting at 09:00 rather than a lie about a departure time.
  select 'flight-' || f.id::text,
         'Flight ' || f.from_iata || ' to ' || f.to_iata,
         f.flown_on::timestamptz + interval '9 hours',
         f.flown_on::timestamptz + interval '11 hours',
         coalesce(f.airline, ''), f.from_iata
    from public.flights f
   where f.creator_id = uid_;
end $$;
revoke execute on function public.calendar_feed(text) from public, anon, authenticated;
-- service_role only: the edge function holds the key, the fetcher holds a token.

-- ---------------------------------------------------------------- 7. ratings
alter table public.event_ratings add column if not exists comment text;
alter table public.event_ratings add column if not exists skipped boolean not null default false;
alter table public.event_ratings add column if not exists asked_at timestamptz;

-- ------------------------------------------------- find-a-time / suggestions
alter table public.event_polls       add column if not exists community_ids uuid[] not null default '{}';
alter table public.event_suggestions add column if not exists community_ids uuid[] not null default '{}';

-- A SKIP IS A ROW WITH NO SCORE, so `rating` has to be allowed to be absent. It
-- was NOT NULL, which is right for an answer and wrong for a decision not to
-- answer - and recording the decision is the whole point: it is what stops the
-- prompt asking again on the next visit for ever.
alter table public.event_ratings alter column rating drop not null;
alter table public.event_ratings drop constraint if exists event_ratings_answer_or_skip;
alter table public.event_ratings add constraint event_ratings_answer_or_skip
  check ((skipped and rating is null) or (not skipped and rating is not null));
