-- Email system rebuild (Jul 27 2026).
--
-- Background: sending the whole community a near-identical run of messages from
-- a shared mailbox got us flagged as bulk mail, and Gmail started blocking the
-- sends outright. Rather than keep fighting a reputation problem we do not have
-- the sending domain to win, email is cut back to the two jobs it is genuinely
-- needed for, both of which are low volume and expected by the recipient:
--
--   1. Password resets  (handled by Supabase Auth over SMTP, not by this app)
--   2. A welcome email  (one per newly accepted creator)
--
-- The welcome email matters because a brand new creator has not enabled push
-- notifications yet, so email is the only channel that can actually reach them.
--
-- Everything else (announcements, challenges, events, connections) is push and
-- the in-app bell only. Those paths are removed from notify-dispatch, so no
-- automatic email can be sent by accident.
--
-- Nothing sends without a human: a welcome email is QUEUED for an admin to read,
-- edit and approve on /admin/email before it goes anywhere.

-- ---------------------------------------------------------------------------
-- 1) The outbox gains a recipient.
--
-- It was built for broadcasts, where one queued row fans out to everyone. A
-- welcome email is one-to-one, so the row has to remember who it is for.
alter table public.email_outbox
  add column if not exists recipient_id uuid references public.profiles(id) on delete cascade,
  add column if not exists recipient_name text;

-- The old "first enqueue wins" index existed because notify_all writes one
-- notification per recipient and we only wanted ONE queued broadcast out of it.
-- That logic is actively wrong for welcome mail: two creators accepted on the
-- same day share a subject line, so the second person would silently lose their
-- email. Split it in two, keyed on whether the row has a recipient.
drop index if exists public.email_outbox_pending_unique;

create unique index if not exists email_outbox_pending_broadcast_unique
  on public.email_outbox (type, subject, cta_path)
  where status = 'pending' and recipient_id is null;

-- One pending welcome per person, so re-approving somebody cannot double up.
create unique index if not exists email_outbox_pending_welcome_unique
  on public.email_outbox (recipient_id)
  where status = 'pending' and recipient_id is not null;

create index if not exists email_outbox_recipient_idx on public.email_outbox(recipient_id);

-- ---------------------------------------------------------------------------
-- 2) The welcome email itself.
--
-- Stored as a template so the wording is edited in one place, and copied into
-- the queue row at approval time (the admin can then add to that copy before
-- sending, without changing the template for everyone after them).
insert into public.email_templates
  (key, label, description, subject, body, cta_label, cta_path, sample_title, sample_body, auto_send)
values (
  'welcome',
  'Welcome email',
  'Queued for review when a creator is accepted into the community.',
  'Welcome to the Tryp.com Content Creator Program, {{name}}',
  'Hi {{name}},' || chr(10) || chr(10) ||
  'Welcome to the Tryp.com Content Creator Program. Your application has been accepted, and you are now part of the community.' || chr(10) || chr(10) ||
  'Here is how to get started:' || chr(10) || chr(10) ||
  '1. Add the app to your home screen. Open the platform on your phone, tap Share, then "Add to Home Screen". It then opens like any other app, full screen.' || chr(10) || chr(10) ||
  '2. Turn on notifications. Go to Settings and enable notifications on your device, so you never miss a new challenge, an event or a message.' || chr(10) || chr(10) ||
  '3. Explore the platform. Have a look around the challenges, the calendar, the library of resources and the community chat.' || chr(10) || chr(10) ||
  '4. Connect with other creators. Browse the creator directory, see who is travelling where, and send a connection request to say hello.' || chr(10) || chr(10) ||
  '5. Take part in the challenges. Every challenge is a chance to win a prize and get your content in front of a bigger audience.' || chr(10) || chr(10) ||
  'We are really glad to have you with us. If anything is unclear, just reply to this email or message the team in the app.' || chr(10) || chr(10) ||
  'The Tryp.com Team',
  'Open the Creator Program',
  '/home',
  'Welcome aboard',
  '',
  false
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Queue a welcome email when a creator is accepted.
--
-- Fires on the same pending -> active transition that already sends the in-app
-- "You're in! Welcome aboard" notification. Admins and the QA test accounts are
-- skipped. {{name}} is resolved here rather than at send time so the reviewing
-- admin reads the real message, not a token.
create or replace function public.on_creator_welcome_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  tpl public.email_templates%rowtype;
  first_name text;
begin
  if new.status = 'active'
     and old.status is distinct from 'active'
     and not coalesce(new.is_admin, false)
     and not coalesce(new.is_test, false)
  then
    select * into tpl from public.email_templates where key = 'welcome';
    if not found then return new; end if;

    first_name := coalesce(nullif(split_part(coalesce(new.name, ''), ' ', 1), ''), 'there');

    -- ON CONFLICT DO NOTHING covers the partial unique index above: if this
    -- person already has a welcome email waiting for review, leave it alone.
    insert into public.email_outbox
      (type, subject, body, cta_label, cta_path, recipient_id, recipient_name)
    values (
      'welcome',
      replace(tpl.subject, '{{name}}', first_name),
      replace(tpl.body, '{{name}}', first_name),
      tpl.cta_label,
      coalesce(nullif(tpl.cta_path, ''), '/home'),
      new.id,
      new.name
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_creator_welcome_email on public.profiles;
create trigger trg_creator_welcome_email
  after update on public.profiles
  for each row execute function public.on_creator_welcome_email();

-- Trigger function, not an API call: keep it off the exposed API.
revoke execute on function public.on_creator_welcome_email() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) The send log.
--
-- This is now the record of every email the platform is responsible for, which
-- after this rebuild is welcome emails and password resets. Password resets are
-- logged by the auth-gate function, which is the only thing that can see them
-- (the mail itself is sent by Supabase Auth, not by us), so the log records the
-- REQUEST rather than a delivery receipt.
alter table public.email_send_log
  add column if not exists recipient_email text;

alter table public.email_send_log drop constraint if exists email_send_log_kind_check;
alter table public.email_send_log add constraint email_send_log_kind_check
  check (kind in ('broadcast', 'notification', 'invoice', 'auth', 'welcome', 'password_reset'));

-- One readable feed for the admin page: newest first, with the creator's name
-- resolved where we have one. security definer + an is_admin() gate, matching
-- the other admin RPCs.
create or replace function public.email_log(p_limit int default 100)
returns table (
  id uuid,
  kind text,
  subject text,
  status text,
  error text,
  created_at timestamptz,
  recipient_email text,
  recipient_name text
)
language sql security definer set search_path = public
as $$
  select l.id, l.kind, l.subject, l.status, l.error, l.created_at,
         l.recipient_email, p.name
  from public.email_send_log l
  left join public.profiles p on p.id = l.recipient_id
  where public.is_admin()
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.email_log(int) from public, anon;
grant execute on function public.email_log(int) to authenticated;
