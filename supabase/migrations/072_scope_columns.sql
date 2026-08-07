-- 072: add the scope column to every table that belongs to a community.
--
-- ADDITIVE ONLY. Every column is nullable with no default and no trigger, so the
-- live app neither reads nor writes any of it. Backfill happens in phase 2.
--
-- WHAT DELIBERATELY DOES NOT GET A SCOPE, and this is the most important part of
-- the whole design: nothing social is chapter-scoped. connections, conversations,
-- direct_messages, dm_reactions, collab_posts, collab_interests, creator_photos,
-- game_scores, game_events, notifications, creator_private, push_subscriptions,
-- resource_bookmarks, channel_reads, job_applications, poll_votes, reactions,
-- event_rsvps and the event_poll family are all either owner-scoped or child rows
-- whose parent already carries the tenant. Their existing RLS policies survive this
-- project untouched.
--
-- Two of these columns are DENORMALISED on purpose:
--   submissions.community_id duplicates its challenge's
--   messages.community_id   duplicates its channel's
-- Normally that is a smell. Here it is correct, because the alternative is a join
-- inside an RLS predicate and RLS predicates run per row. Phase 2 adds triggers
-- that copy from the parent and raise on a mismatch, so the duplication cannot
-- drift.
--
-- Reversible: drop each column listed below, and messages.channel_id.

do $$
declare
  t text;
  scoped text[] := array[
    'challenges',
    'submissions',
    'results',
    'rewards',
    'messages',
    'events',
    'polls',
    'resources',
    'jobs',
    'scheduled_announcements',
    'email_campaigns',
    'invoices',
    'referrals',
    'application_decisions',
    'creator_admin_notes',
    'admin_notes',
    'feedback'
  ];
begin
  foreach t in array scoped loop
    execute format(
      'alter table public.%I add column if not exists community_id uuid
         references public.communities(id) on delete restrict', t);
    -- Indexed because every read policy filters on it.
    execute format(
      'create index if not exists %I on public.%I (community_id)',
      t || '_community_idx', t);
  end loop;
end $$;

-- Chat needs the channel foreign key as well as the scope. `messages.channel` (the
-- text key) stays exactly as it is: both columns live side by side through the
-- dual-write window so the old shell and the new shell can read the same rows.
alter table public.messages
  add column if not exists channel_id uuid references public.channels(id) on delete cascade;

create index if not exists messages_channel_id_idx
  on public.messages (channel_id, created_at desc);

-- Read tracking follows the channel it tracks.
alter table public.channel_reads
  add column if not exists channel_id uuid references public.channels(id) on delete cascade;

create index if not exists channel_reads_channel_id_idx
  on public.channel_reads (channel_id);

comment on column public.messages.community_id is
  'Denormalised from channels.community_id for RLS speed. Kept in sync by trigger; '
  'never write it directly.';
comment on column public.submissions.community_id is
  'Denormalised from challenges.community_id for RLS speed. Kept in sync by trigger; '
  'never write it directly.';
