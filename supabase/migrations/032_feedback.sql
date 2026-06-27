-- ============================================================================
-- 032 - creator feedback (bug reports & feature suggestions)
--   Creators submit from the avatar dropdown; admins triage at /admin/feedback.
--   RLS: a creator may file feedback and see their own; admins see/manage all.
-- ============================================================================
set check_function_bodies = off;

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.profiles (id) on delete cascade,
  type        text not null default 'bug' check (type in ('bug', 'feature')),
  message     text not null,
  page        text,                                   -- where they were when filing
  status      text not null default 'new'
              check (status in ('new', 'planned', 'in_progress', 'done', 'declined')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "feedback: insert own" on public.feedback;
create policy "feedback: insert own" on public.feedback for insert to authenticated
  with check (creator_id = auth.uid());

drop policy if exists "feedback: read own or admin" on public.feedback;
create policy "feedback: read own or admin" on public.feedback for select to authenticated
  using (creator_id = auth.uid() or public.is_admin());

drop policy if exists "feedback: admin update" on public.feedback;
create policy "feedback: admin update" on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "feedback: admin delete" on public.feedback;
create policy "feedback: admin delete" on public.feedback for delete to authenticated
  using (public.is_admin());

-- Allow the new 'feedback' notification type.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'challenge', 'announcement', 'results', 'reward', 'deadline',
    'connection', 'dm', 'event', 'application', 'chat',
    'submission', 'deletion', 'referral', 'new_member', 'inactive', 'feedback'
  ));

-- New feedback → notify every admin (in-app; push/email follow their prefs).
create or replace function public.on_new_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, title, body, link)
  select p.id, 'feedback',
         case when new.type = 'feature' then 'New feature suggestion' else 'New bug report' end,
         coalesce((select nullif(name, '') from public.profiles where id = new.creator_id), 'A creator')
           || ': ' || left(new.message, 90),
         '/admin/feedback'
  from public.profiles p
  where p.is_admin and p.id <> new.creator_id;
  return new;
end; $$;
drop trigger if exists trg_on_new_feedback on public.feedback;
create trigger trg_on_new_feedback after insert on public.feedback
  for each row execute function public.on_new_feedback();
revoke execute on function public.on_new_feedback() from public, anon, authenticated;
