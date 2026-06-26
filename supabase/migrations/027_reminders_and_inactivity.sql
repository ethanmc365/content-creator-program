-- ============================================================================
-- 027 - configurable challenge deadline reminders + inactive-creator alerts
--   * Creators pick which lead times they want (7/5/3/1 days) in settings; a
--     daily cron sends each non-submitter a reminder on the right day, deduped.
--     (The old send_deadline_reminders was never even scheduled - dead code.)
--   * Daily cron alerts admins when an active creator hasn't signed in for 30+
--     days, once per inactivity episode.
-- ============================================================================
set check_function_bodies = off;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'challenge','announcement','results','reward','deadline','connection','dm',
    'event','application','chat','submission','deletion','referral','new_member','inactive'
  ));

-- === Challenge deadline reminders (per-creator lead times) ===
alter table public.profiles add column if not exists challenge_reminder_days int[] not null default '{3,1}';

create table if not exists public.challenge_reminders_sent (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  creator_id   uuid not null references public.profiles (id) on delete cascade,
  days_before  int  not null,
  sent_at      timestamptz not null default now(),
  primary key (challenge_id, creator_id, days_before)
);
alter table public.challenge_reminders_sent enable row level security; -- no policies: service-role/owner only

create or replace function public.send_challenge_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare c record; d int;
begin
  for c in select id, title, end_date from public.challenges where status = 'active' and end_date > now() loop
    foreach d in array array[7,5,3,1] loop
      if (c.end_date::date - current_date) = d then
        with recips as (
          select p.id as creator_id
          from public.profiles p
          where p.status = 'active' and not p.is_admin and p.deletion_requested_at is null
            and d = any(p.challenge_reminder_days)
            and not exists (select 1 from public.submissions s where s.challenge_id = c.id and s.creator_id = p.id)
            and not exists (select 1 from public.challenge_reminders_sent r where r.challenge_id = c.id and r.creator_id = p.id and r.days_before = d)
        ), notified as (
          insert into public.notifications (recipient_id, type, title, body, link)
          select creator_id, 'deadline',
                 d || ' day' || (case when d = 1 then '' else 's' end) || ' left ⏳',
                 '"' || c.title || '" closes in ' || d || ' day' || (case when d = 1 then '' else 's' end)
                   || ' — submit your link before the deadline.',
                 '/challenges/' || c.id
          from recips returning 1
        )
        insert into public.challenge_reminders_sent (challenge_id, creator_id, days_before)
        select c.id, creator_id, d from recips;
      end if;
    end loop;
  end loop;
end; $$;
revoke execute on function public.send_challenge_reminders() from public, anon, authenticated;

-- === Inactive-creator admin alerts (30+ days, once per episode) ===
alter table public.profiles add column if not exists inactive_alerted_at timestamptz;

create or replace function public.notify_inactive_creators()
returns void language plpgsql security definer set search_path = public as $$
begin
  with inactive as (
    select p.id, p.name
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.status = 'active' and not p.is_admin and p.deletion_requested_at is null
      and u.last_sign_in_at is not null
      and u.last_sign_in_at < now() - interval '30 days'
      and (p.inactive_alerted_at is null or p.inactive_alerted_at < u.last_sign_in_at)
  )
  insert into public.notifications (recipient_id, type, title, body, link)
  select a.id, 'inactive', 'Creator inactive',
         i.name || ' has not logged in for over 30 days.', '/profile/' || i.id
  from inactive i cross join public.profiles a where a.is_admin;

  update public.profiles p set inactive_alerted_at = now()
  from auth.users u
  where u.id = p.id and p.status = 'active' and not p.is_admin and p.deletion_requested_at is null
    and u.last_sign_in_at is not null and u.last_sign_in_at < now() - interval '30 days'
    and (p.inactive_alerted_at is null or p.inactive_alerted_at < u.last_sign_in_at);
end; $$;
revoke execute on function public.notify_inactive_creators() from public, anon, authenticated;

-- Schedule both daily (idempotent).
do $$ begin perform cron.unschedule('challenge-reminders'); exception when others then null; end $$;
select cron.schedule('challenge-reminders', '0 9 * * *', $$select public.send_challenge_reminders()$$);
do $$ begin perform cron.unschedule('inactive-creator-alerts'); exception when others then null; end $$;
select cron.schedule('inactive-creator-alerts', '0 8 * * *', $$select public.notify_inactive_creators()$$);
