-- ============================================================================
-- 028 - scheduled announcements & challenges
--   * challenges.publish_at: a cron flips a draft live at that time (the
--     on_challenge_live trigger then notifies creators).
--   * scheduled_announcements: a cron posts them into #announcements at the
--     scheduled time (the on_announcement trigger notifies everyone).
--   Both crons run every 5 minutes.
-- ============================================================================
set check_function_bodies = off;

-- === Scheduled challenge publishing ===
alter table public.challenges add column if not exists publish_at timestamptz;

create or replace function public.publish_scheduled_challenges()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.challenges
  set status = 'active'
  where status = 'draft' and publish_at is not null and publish_at <= now();
end; $$;
revoke execute on function public.publish_scheduled_challenges() from public, anon, authenticated;

-- === Scheduled announcements ===
create table if not exists public.scheduled_announcements (
  id            uuid primary key default gen_random_uuid(),
  body          text not null,
  scheduled_for timestamptz not null,
  created_by    uuid references public.profiles (id) on delete set null,
  posted_at     timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.scheduled_announcements enable row level security;
drop policy if exists "scheduled announcements: admins only" on public.scheduled_announcements;
create policy "scheduled announcements: admins only" on public.scheduled_announcements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.post_scheduled_announcements()
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in select * from public.scheduled_announcements where posted_at is null and scheduled_for <= now() loop
    insert into public.messages (channel, sender_id, body) values ('announcements', a.created_by, a.body);
    update public.scheduled_announcements set posted_at = now() where id = a.id;
  end loop;
end; $$;
revoke execute on function public.post_scheduled_announcements() from public, anon, authenticated;

-- Run both every 5 minutes (idempotent).
do $$ begin perform cron.unschedule('publish-scheduled-challenges'); exception when others then null; end $$;
select cron.schedule('publish-scheduled-challenges', '*/5 * * * *', $$select public.publish_scheduled_challenges()$$);
do $$ begin perform cron.unschedule('post-scheduled-announcements'); exception when others then null; end $$;
select cron.schedule('post-scheduled-announcements', '*/5 * * * *', $$select public.post_scheduled_announcements()$$);
