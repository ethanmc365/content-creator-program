-- ============================================================================
-- 003 — v2 features
-- ============================================================================
-- Adds: creator home location (city/country), travel photo gallery, jobs
-- board, referrals, announcement polls, event meeting links + custom types,
-- and an email-campaign log. Safe to run once on top of 001 + 002.

set check_function_bodies = off;

-- ----------------------------------------------------------------------------
-- 1. profiles — home location + referral wiring
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists city text default '';
alter table public.profiles add column if not exists country text default '';
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles (id) on delete set null;

-- Give every existing profile a short, shareable referral code.
-- Use the END of the id (the unique node segment) so codes never collide.
update public.profiles
set referral_code = upper(right(replace(id::text, '-', ''), 8))
where referral_code is null;

create unique index if not exists idx_profiles_referral_code on public.profiles (referral_code);

-- New signups get a referral code automatically, and we capture who referred
-- them (passed as ?ref=CODE → stored in auth metadata by the signup form).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ref_code text;
  v_referrer uuid;
begin
  v_ref_code := new.raw_user_meta_data ->> 'ref';
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = upper(v_ref_code);
  end if;

  insert into public.profiles (id, name, referral_code, referred_by)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    upper(right(replace(new.id::text, '-', ''), 8)),
    v_referrer
  );
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. creator_photos — travel gallery (up to 20 per creator, enforced in UI)
-- ----------------------------------------------------------------------------
create table if not exists public.creator_photos (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  photo_url text not null,
  caption text default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_creator_photos_creator on public.creator_photos (creator_id, sort_order);

alter table public.creator_photos enable row level security;

create policy "creator_photos: read for signed-in users"
  on public.creator_photos for select to authenticated using (true);

create policy "creator_photos: manage own"
  on public.creator_photos for all to authenticated
  using (creator_id = auth.uid()) with check (creator_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. jobs — roles the team is hiring for
-- ----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  location text default '',
  job_type text not null default 'Permanent',   -- Permanent / Contract / Freelance / etc.
  apply_url text,                                -- external form, or null to apply via DM
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

create policy "jobs: read open or admin"
  on public.jobs for select to authenticated
  using (status = 'open' or public.is_admin());

create policy "jobs: admin manage"
  on public.jobs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Notify everyone when a job is opened.
create or replace function public.on_job_opened()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.notify_all(
      null, 'challenge', 'We''re hiring: ' || new.title,
      coalesce(nullif(new.location, ''), 'New role') || ' — see the Jobs board.',
      '/jobs'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_job_opened on public.jobs;
create trigger trg_on_job_opened
  after insert or update on public.jobs
  for each row execute function public.on_job_opened();

-- ----------------------------------------------------------------------------
-- 4. referrals — creators recommending new creators
-- ----------------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references public.profiles (id) on delete set null,
  referred_name text not null,
  referred_contact text default '',              -- email or social handle
  note text default '',
  status text not null default 'new' check (status in ('new', 'contacted', 'joined', 'declined')),
  created_at timestamptz not null default now()
);

alter table public.referrals enable row level security;

-- Creators can log a referral and see their own; admins manage everything.
create policy "referrals: read own or admin"
  on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or public.is_admin());

create policy "referrals: create own"
  on public.referrals for insert to authenticated
  with check (referrer_id = auth.uid());

create policy "referrals: admin manage"
  on public.referrals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. polls — admin-created polls that live inside an announcement message
-- ----------------------------------------------------------------------------
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  created_by uuid references public.profiles (id) on delete set null,
  closes_at timestamptz,                          -- null = open until closed manually
  closed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null references public.poll_options (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id)                       -- one vote per person per poll
);

-- A group message can carry a poll (rendered inline in the chat).
alter table public.messages add column if not exists poll_id uuid references public.polls (id) on delete set null;

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

create policy "polls: read for signed-in users" on public.polls for select to authenticated using (true);
create policy "polls: admin manage" on public.polls for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "poll_options: read for signed-in users" on public.poll_options for select to authenticated using (true);
create policy "poll_options: admin manage" on public.poll_options for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "poll_votes: read for signed-in users" on public.poll_votes for select to authenticated using (true);
create policy "poll_votes: vote as yourself"
  on public.poll_votes for insert to authenticated
  with check (voter_id = auth.uid() and public.can_post());
create policy "poll_votes: change own vote"
  on public.poll_votes for delete to authenticated using (voter_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. events — meeting links + free-form types
-- ----------------------------------------------------------------------------
alter table public.events add column if not exists meeting_url text;
-- Drop the fixed-type constraint so admins can add custom event types.
alter table public.events drop constraint if exists events_type_check;

-- ----------------------------------------------------------------------------
-- 7. email_campaigns — log of bulk emails sent to creators
-- ----------------------------------------------------------------------------
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  recipient_count int not null default 0,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.email_campaigns enable row level security;

create policy "email_campaigns: admin only"
  on public.email_campaigns for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. Realtime + storage
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.poll_votes;
alter publication supabase_realtime add table public.polls;

-- Public bucket for travel-gallery photos (per-user folder, like avatars).
insert into storage.buckets (id, name, public) values ('gallery', 'gallery', true)
on conflict (id) do nothing;

create policy "gallery: user uploads own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gallery: user updates own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "gallery: user deletes own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);
