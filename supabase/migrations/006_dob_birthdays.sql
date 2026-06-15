-- ============================================================================
-- 006 — date of birth + automatic birthday cards
-- ============================================================================
set check_function_bodies = off;

-- Creators enter a date of birth; we show only the derived age on profiles.
alter table public.profiles add column if not exists dob date;

-- A chat message can be an auto birthday card for a creator.
alter table public.messages add column if not exists birthday_for uuid references public.profiles (id) on delete cascade;

-- Allow an empty body when the message is a poll / game / birthday card.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (
    char_length(body) <= 4000
    and (body <> '' or image_url is not null or poll_id is not null
         or game_event_id is not null or birthday_for is not null)
  );

-- Post a birthday card into #general for every active creator whose birthday
-- is today (deduped so it only posts once per creator per day).
create or replace function public.post_birthday_cards()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  admin_id uuid;
  c record;
begin
  select id into admin_id from public.profiles where is_admin order by created_at limit 1;
  if admin_id is null then return; end if;

  for c in (
    select id from public.profiles
    where dob is not null and status = 'active'
      and to_char(dob, 'MM-DD') = to_char(current_date, 'MM-DD')
  ) loop
    if not exists (
      select 1 from public.messages m
      where m.birthday_for = c.id and m.created_at::date = current_date
    ) then
      insert into public.messages (channel, sender_id, body, birthday_for)
      values ('general', admin_id, '', c.id);
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Schedule it daily (07:00 UTC) via pg_cron. Safe if pg_cron is available.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.unschedule('daily-birthday-cards')
  where exists (select 1 from cron.job where jobname = 'daily-birthday-cards');
select cron.schedule('daily-birthday-cards', '0 7 * * *', $cron$ select public.post_birthday_cards(); $cron$);
