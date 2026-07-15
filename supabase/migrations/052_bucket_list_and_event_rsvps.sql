-- Migration 052: profile travel bucket list + event RSVPs.

-- 1. Travel bucket list: countries (optionally with a town) a creator wants to
--    visit. Stored like countries_visited — a jsonb array of { country, city }.
alter table public.profiles
  add column if not exists bucket_list jsonb not null default '[]'::jsonb;

-- 2. Event RSVPs. Admins turn RSVP on per event (never on challenge deadlines);
--    creators respond going / can't, shown as avatars on the event.
alter table public.events
  add column if not exists rsvp_enabled boolean not null default false;

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('going', 'cant')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists idx_event_rsvps_event on public.event_rsvps (event_id);

alter table public.event_rsvps enable row level security;

create policy "event_rsvps: members read"
  on public.event_rsvps for select to authenticated
  using (public.is_member());

create policy "event_rsvps: add own"
  on public.event_rsvps for insert to authenticated
  with check (user_id = auth.uid() and public.can_post());

create policy "event_rsvps: update own"
  on public.event_rsvps for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "event_rsvps: remove own"
  on public.event_rsvps for delete to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.event_rsvps;
