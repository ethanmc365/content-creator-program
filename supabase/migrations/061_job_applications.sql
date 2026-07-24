-- Job applications: creators apply to open roles with a short pitch. The
-- response is STORED (not just fired off as a DM) so admins can review every
-- applicant in one place on the admin jobs page and choose how to reach out
-- (email or DM). Replaces the old "register interest -> auto DM" workflow.

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  pitch text not null,
  status text not null default 'new' check (status in ('new','reviewing','contacted','hired','declined')),
  created_at timestamptz not null default now(),
  unique (job_id, creator_id)
);

alter table public.job_applications enable row level security;

-- A creator applies as themselves, and only while they're an active member.
create policy "job_apps: apply as self" on public.job_applications
  for insert with check (creator_id = (select auth.uid()) and public.can_post());

-- A creator sees their own applications; admins see them all.
create policy "job_apps: read own or admin" on public.job_applications
  for select using (creator_id = (select auth.uid()) or public.is_admin());

-- A creator can withdraw their own; admins can remove any.
create policy "job_apps: withdraw own or admin" on public.job_applications
  for delete using (creator_id = (select auth.uid()) or public.is_admin());

-- Only admins move an application through its pipeline.
create policy "job_apps: admin update" on public.job_applications
  for update using (public.is_admin()) with check (public.is_admin());

create index if not exists job_applications_job_idx on public.job_applications(job_id);
create index if not exists job_applications_creator_idx on public.job_applications(creator_id);

-- Notify every admin when a new application lands (bell + push/email per prefs),
-- reusing the existing admin-only 'application' notification type.
create or replace function public.on_new_job_application()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  a record;
  v_name text;
  v_title text;
begin
  select name into v_name from public.profiles where id = new.creator_id;
  select title into v_title from public.jobs where id = new.job_id;
  for a in select id from public.profiles where is_admin = true and coalesce(is_test, false) = false loop
    perform public.notify_user(
      a.id, 'application', 'New job application',
      coalesce(v_name, 'A creator') || ' applied for "' || coalesce(v_title, 'a role') || '"',
      '/admin/jobs'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_on_new_job_application on public.job_applications;
create trigger trg_on_new_job_application
  after insert on public.job_applications
  for each row execute function public.on_new_job_application();
