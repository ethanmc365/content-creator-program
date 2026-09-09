-- THE BEST VIDEOS THE PROGRAMME HAS EVER MADE, IN ONE PLACE.
--
-- Ethan, 9 Sep 2026: "I want you to build into the admin tool another page
-- called Video Tracker. This is going to track all the best videos from the
-- entire community, filtered by market and by challenge. We want to track the
-- top three videos from every challenge, and also any videos that have got over
-- ten thousand views. You'll pull the views from this - start off by doing it
-- for the UK challenge at least. And we would want the hooks for this: see if
-- you can pull the hook they used and maybe the description, or their accounts.
-- This is what we're going to share with the whole Tryp.com team so they can
-- take inspiration from the viral videos and the ones that performed well, and
-- we can share them with the other markets."
--
-- WHY THIS IS A TABLE AND NOT A VIEW OVER `submissions`.
--
-- Two thirds of what it holds could be derived - "top three of each challenge"
-- and "anything over the threshold" are both one window function away. The
-- third is not, and it is the part that makes the tool worth having:
--
--   * A VIDEO THAT NEVER WENT THROUGH THIS PLATFORM. Forty-nine of the
--     programme's fifty challenges predate it (migrations 197/198), and every
--     market that is not the UK still runs on a spreadsheet. A tool for
--     sharing what worked between markets that can only see the one market
--     already on the platform is a tool for sharing nothing.
--   * WHAT A PERSON NOTICED ABOUT IT. The hook, a note, tags. None of that is
--     computable, all of it is the actual product here - a view count says a
--     video worked and says nothing about why.
--
-- WHAT IT NEVER DOES IS DELETE. A video that drops out of a challenge's top
-- three stops QUALIFYING; it does not stop existing. That is this codebase's
-- own rule, paid for by `milestone_progress`: a bookkeeping pass must not be
-- able to delete the thing it keeps books on. `qualifies` is the flag, the page
-- filters on it, and anything anybody typed survives a resync.
--
-- SECURITY. Admin-only, read and write, and that is the whole of it: this is an
-- internal reference for the Tryp.com team. It carries nothing a creator could
-- not already see about their own post - a public URL, a public view count, a
-- public caption - but it is a curated list of what the programme rates, and
-- that is a judgement rather than a fact.

-- ---------------------------------------------------------------- the table --
create table if not exists public.tracked_videos (
  id uuid primary key default gen_random_uuid(),

  -- THE LINK BACK, WHERE THERE IS ONE. Null for a manually added video from a
  -- market that is not on the platform. `on delete set null` rather than
  -- cascade: deleting a challenge entry must not silently delete the record of
  -- a video the team has been sharing for months.
  submission_id uuid unique references public.submissions(id) on delete set null,
  challenge_id uuid references public.challenges(id) on delete set null,
  -- The pre-platform challenge log (migration 197). A manual row can point at
  -- one of the forty-nine, which is how a Spanish or Romanian video from before
  -- this platform existed gets a challenge name against it.
  history_id uuid references public.challenge_history(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,

  -- WHO POSTED IT. `creator_id` where they are on the platform; the name and
  -- handle are stored FLAT as well, deliberately, because a manual row often
  -- has a handle and no account, and because what the team wants to read is
  -- "who posted this" rather than "which of our rows is this joined to".
  creator_id uuid references public.profiles(id) on delete set null,
  creator_name text,
  creator_handle text,

  platform text,
  video_url text not null,
  platform_video_id text,
  thumbnail_url text,
  posted_at timestamptz,

  -- THE NUMBERS, COPIED RATHER THAN JOINED. A tracked video's view count is a
  -- fact about the moment it was read, and the source row can be deleted,
  -- re-synced or re-judged underneath it. `views_source` is the same four-way
  -- vocabulary `submissions` uses (see migration 110).
  views bigint,
  views_source text,
  views_synced_at timestamptz,

  -- THE POINT OF THE WHOLE PAGE. The hook is the first thing said in the video
  -- or written over it; the caption is what was posted with it. `hook_source`
  -- is what stops a resync overwriting what somebody typed: 'auto' means it was
  -- derived from the caption and may be refreshed, 'manual' means hands off.
  hook text,
  hook_source text not null default 'auto' check (hook_source in ('auto', 'manual')),
  caption text,
  notes text,
  tags text[] not null default '{}',

  -- WHY IT IS HERE. 'podium' = top three of its challenge, 'threshold' = over
  -- the view line, 'manual' = somebody added it. A row can be both podium and
  -- over the line; podium wins, because it is the stronger statement.
  reason text not null default 'manual' check (reason in ('podium', 'threshold', 'manual')),
  rank integer,
  -- STILL TRUE TODAY? Set by the sync. A manual row is always true - nothing
  -- computes whether a hand-picked video still deserves its place.
  qualifies boolean not null default true,
  pinned boolean not null default false,

  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ONE ROW PER VIDEO, AND THE VIDEO'S IDENTITY IS THE PLATFORM'S ID, NOT THE URL
-- SOMEBODY PASTED. The same reel arrives as /reel/<code>, /p/<code>,
-- a share link with a tracking parameter and a vm.tiktok.com redirect; four
-- URLs, one video. Partial, because a row added before its id has been
-- resolved has none yet and several such rows must be allowed to coexist.
create unique index if not exists tracked_videos_platform_video_uniq
  on public.tracked_videos (platform, platform_video_id)
  where platform_video_id is not null;

create index if not exists tracked_videos_views_idx on public.tracked_videos (views desc nulls last);
create index if not exists tracked_videos_challenge_idx on public.tracked_videos (challenge_id);
create index if not exists tracked_videos_community_idx on public.tracked_videos (community_id);

create or replace function public.tracked_videos_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tracked_videos_touch on public.tracked_videos;
create trigger trg_tracked_videos_touch
  before update on public.tracked_videos
  for each row execute function public.tracked_videos_touch();

-- ------------------------------------------------------------------- rls ---
alter table public.tracked_videos enable row level security;

drop policy if exists tracked_videos_read on public.tracked_videos;
create policy tracked_videos_read on public.tracked_videos
  for select to authenticated using (public.is_admin());

-- ANY ADMIN CURATES, INCLUDING A MARKET MANAGER. The whole request is that
-- markets learn from each other's videos, and a Spanish market manager adding a
-- Spanish video is the mechanism by which that happens. Every write is picked
-- up by the audit triggers installed in migration 20260825201009.
drop policy if exists tracked_videos_write on public.tracked_videos;
create policy tracked_videos_write on public.tracked_videos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
