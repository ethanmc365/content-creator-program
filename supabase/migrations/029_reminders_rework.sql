-- ============================================================================
-- 029 - rework challenge deadline reminders
--   * Remind everyone who opted in, even if they've already submitted (we WANT
--     creators posting multiple videos).
--   * Lead times are now 14/7/5/3 days (added 14, removed 1).
-- ============================================================================
set check_function_bodies = off;

alter table public.profiles alter column challenge_reminder_days set default '{7,3}';
-- Drop the now-removed 1-day option from anyone who had it.
update public.profiles set challenge_reminder_days = array_remove(challenge_reminder_days, 1)
where 1 = any(challenge_reminder_days);

create or replace function public.send_challenge_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare c record; d int;
begin
  for c in select id, title, end_date from public.challenges where status = 'active' and end_date > now() loop
    foreach d in array array[14,7,5,3] loop
      if (c.end_date::date - current_date) = d then
        with recips as (
          select p.id as creator_id
          from public.profiles p
          where p.status = 'active' and not p.is_admin and p.deletion_requested_at is null
            and d = any(p.challenge_reminder_days)
            and not exists (select 1 from public.challenge_reminders_sent r where r.challenge_id = c.id and r.creator_id = p.id and r.days_before = d)
        ), notified as (
          insert into public.notifications (recipient_id, type, title, body, link)
          select creator_id, 'deadline',
                 d || ' days left ⏳',
                 '"' || c.title || '" closes in ' || d || ' days — get your entries in before the deadline.',
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
