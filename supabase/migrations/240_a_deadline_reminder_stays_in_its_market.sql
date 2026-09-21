-- A DEADLINE REMINDER GOES TO THE CHALLENGE'S OWN MARKET (21 Sep 2026).
--
-- Found while checking that deadline reminders are on for everyone before the
-- Global Challenge. They are (the column defaults to {7,3} and 118 of 119
-- active creators have it), but the job that sends them had two faults:
--
--   * IT IGNORED THE MARKET. Every active creator was reminded about every live
--     challenge, so the Portugal challenge opening on 1 Oct would have told all
--     119 creators "closes in 3 days" about a contest 105 of them cannot enter.
--     Recipients are now the challenge market's active members; a challenge
--     with no market is everyone, as before.
--   * THE WORDING broke two house rules: an em dash in the body and an emoji in
--     the title. Plain words now.
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
    foreach d in array array[14,7,5,3] loop
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
                 d || ' days left',
                 '"' || c.title || '" closes in ' || d || ' days. Get your entries in before the deadline.',
                 '/challenges/' || c.id
          from recips returning 1
        )
        insert into public.challenge_reminders_sent (challenge_id, creator_id, days_before)
        select c.id, creator_id, d from recips;
      end if;
    end loop;
  end loop;
end; $function$;

-- AND THE PUSH EVERY CREATOR GETS WHEN A CHALLENGE GOES LIVE had an em dash in
-- it - the first thing the whole community will read about the Global
-- Challenge. Same for a job opening.
create or replace function public.on_challenge_live()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.community_id is not null then
      perform public.notify_community(
        new.community_id, null, 'challenge', 'New challenge: ' || new.title,
        'A new challenge is live. Check the brief and get creating!',
        '/challenges/' || new.id
      );
    else
      perform public.notify_all(
        null, 'challenge', 'New challenge: ' || new.title,
        'A new challenge is live. Check the brief and get creating!',
        '/challenges/' || new.id
      );
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.on_job_opened()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.notify_all(
      null, 'challenge', 'We''re hiring: ' || new.title,
      coalesce(nullif(new.location, ''), 'New role') || '. See the Jobs board.',
      '/jobs'
    );
  end if;
  return new;
end;
$function$;
