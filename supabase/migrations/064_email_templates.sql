-- Editable copy for the automatic emails the platform sends.
-- Default is pass-through ({{title}}/{{body}} from the notification row), so
-- behaviour is unchanged until an admin enables and customises a template.
create table if not exists public.email_templates (
  key text primary key,
  label text not null,
  description text not null,
  subject text not null default '{{title}}',
  body text not null default '{{body}}',
  cta_label text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.email_templates enable row level security;

create policy "email_templates: admin read" on public.email_templates
  for select using (public.is_admin());
create policy "email_templates: admin write" on public.email_templates
  for update using (public.is_admin()) with check (public.is_admin());

insert into public.email_templates (key, label, description, cta_label) values
  ('announcement', 'Announcement', 'Sent when the team posts in the announcements channel.', 'Read it in the app'),
  ('challenge', 'New challenge is live', 'Sent when a challenge opens for entries.', 'View the brief'),
  ('event', 'Event', 'Sent for Q&As, content sessions and calendar milestones.', 'See the event'),
  ('application', 'Welcome / application', 'Sent when a creator is approved, or nudged to finish their profile.', 'Open Tryp.com')
on conflict (key) do nothing;

-- Sample data + a fixed in-app path per template, so the admin preview shows the
-- actual email a creator receives rather than raw {{placeholders}}.
alter table public.email_templates
  add column if not exists sample_title text,
  add column if not exists sample_body text,
  add column if not exists cta_path text not null default '/home';
