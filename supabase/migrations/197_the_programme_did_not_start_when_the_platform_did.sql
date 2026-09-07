-- THE PROGRAMME DID NOT START WHEN THE PLATFORM DID.
--
-- Ethan, 7 Sep 2026: "I'm going to upload a CSV which I downloaded from the
-- previous tracker we had in Excel. From that you should be able to see all the
-- data from the previous challenges - quite a lot of data. I want you to
-- properly build this into analytics so it correctly shows the past results and
-- history. Also we'll need the ability under challenges for the past ones to
-- edit the results, especially the ones that have been imported and any that
-- are currently ongoing... For example the Spanish community is currently
-- running a challenge, but obviously we're starting a new platform - let's
-- still finish that challenge. So build that functionality in as well for any
-- challenges run externally, so it can keep all the analytics in one place."
--
-- Forty-nine challenges, five markets, January to September 2026: €9,235 of
-- prizes, 19,652,470 views, 347 creator-entries and 2,609 posts. Every one of
-- them was run on a spreadsheet before this platform existed, and the analytics
-- page currently believes the programme began in July with one UK challenge.
--
-- WHY THIS IS NOT A `challenges` ROW WITH FAKE `submissions` UNDER IT.
--
-- That was the obvious approach and it is the wrong one. A challenge on this
-- platform is not a record of a contest, it is a LIVE MACHINE: `results` is a
-- cache rebuilt from submissions, `rebuild_challenge_results` ranks them,
-- `award_challenge_prizes` reads the ranking and raises real invoices against
-- real payees, the view-sync cron re-reads every submission's link forever, and
-- the leaderboard, the podium and the prize engine all key off rows that would
-- have to be invented. Inventing 2,609 submissions with no creator, no link and
-- no owner would put fabricated entries in front of the invoice path and
-- fabricated people on a leaderboard.
--
-- So the history is what it actually is: AGGREGATES, recorded once, that no
-- engine reads and no cron touches. Analytics unions them with the live figures
-- and everything else in the product carries on not knowing they exist.
--
-- ONLY THE NUMBERS THAT WERE MEASURED ARE STORED. The sheet also carries CPM,
-- cost per post, cost per creator, posts per creator, views per post and views
-- per creator - all six of which are arithmetic on four columns. Storing a
-- derived number is storing a second opinion that can disagree with the first;
-- `challenge_history_metrics` below computes them, so the platform and the
-- spreadsheet can never drift.
--
-- `challenge_id` IS THE ANTI-DOUBLE-COUNT. The UK challenge that ran 20 Jul to
-- 20 Aug is in the sheet AND on the platform (39 entries, 76,633 views) -
-- Ethan's team tracked it in both places while the platform was being built.
-- Linked rows are metadata: analytics reads the LIVE numbers for them and
-- ignores the sheet's, so the same contest is never counted twice.

create table if not exists public.challenge_history (
  id            uuid primary key default gen_random_uuid(),

  -- WHERE. `community_id` when the market exists here; `country_code` always,
  -- so a challenge from a market that has not been created yet is still
  -- importable and can be attached later.
  community_id  uuid references public.communities(id) on delete set null,
  country_code  text not null,

  -- WHICH. `ref` is the spreadsheet's own key ("ES-12", "UK-4"), unique, so a
  -- re-import updates rather than duplicates. This is the whole of the import's
  -- idempotency and it is why the sheet can be uploaded again after a
  -- correction without anybody having to clean up first.
  ref           text unique,
  title         text,
  seq           int,

  starts_at     date,
  ends_at       date,
  cadence       text,     -- monthly | express
  cohort        text,     -- General | UGC | VIP
  prize_type    text,
  content_type  text,
  objective     text,
  status        text not null default 'done'
                  check (status in ('planned', 'running', 'done')),

  -- THE MONEY IS EUROS AND SAYS SO. Every figure in the sheet is already in
  -- euros - including the UK ones, which were converted when they were logged -
  -- so this is one currency by construction rather than by hope. See §"Money"
  -- in the platform notes: a total is converted, a per-row amount is not.
  prize_total   numeric(10, 2),
  prize_currency text not null default 'EUR',
  winners       int,

  -- WHAT HAPPENED. All three are NULLABLE and null means "not measured", never
  -- zero: eleven of the forty-nine rows are marked Done with no views logged,
  -- and reporting those as zero-view challenges would drag every average in the
  -- programme down with a number nobody ever recorded.
  total_views   bigint,
  creators      int,
  posts         int,

  notes         text,

  -- The live challenge this is the same contest as, where there is one.
  challenge_id  uuid references public.challenges(id) on delete set null,

  source        text not null default 'import',   -- import | manual
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null
);

create index if not exists challenge_history_market_idx on public.challenge_history (community_id);
create index if not exists challenge_history_dates_idx  on public.challenge_history (starts_at, ends_at);

-- THE DERIVED METRICS, IN ONE PLACE, COMPUTED.
--
-- `nullif(...,0)` throughout: a challenge with no posts has no cost per post,
-- and the answer to that is "we do not know", not "infinity" and not "zero".
-- Division by a null returns null, which is exactly the right answer and is
-- what the UI already knows how to draw as a dash.
create or replace view public.challenge_history_metrics as
select
  h.*,
  case when h.total_views > 0 then round((h.prize_total / (h.total_views / 1000.0))::numeric, 2) end as cpm,
  round(h.prize_total / nullif(h.posts, 0), 2)          as cost_per_post,
  round(h.prize_total / nullif(h.creators, 0), 2)       as cost_per_creator,
  round((h.posts::numeric / nullif(h.creators, 0)), 1)  as posts_per_creator,
  (h.total_views / nullif(h.posts, 0))                  as views_per_post,
  (h.total_views / nullif(h.creators, 0))               as views_per_creator,
  greatest(1, (h.ends_at - h.starts_at))                as days
from public.challenge_history h;

alter table public.challenge_history enable row level security;

-- ADMINS ONLY, ALL FOUR VERBS. This is programme accounting: it names prize
-- budgets per market and is exactly the sort of thing that should not be
-- readable by the creators competing for them. `is_admin()` is the same guard
-- the rewards ledger uses.
drop policy if exists "challenge_history: admins read"  on public.challenge_history;
drop policy if exists "challenge_history: admins write" on public.challenge_history;
create policy "challenge_history: admins read" on public.challenge_history
  for select using (public.is_admin());
create policy "challenge_history: admins write" on public.challenge_history
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.challenge_history_metrics to authenticated;

-- `updated_at` maintained by ONE owner, per the derived-column rule: two
-- bookkeepers on one column do not double-check each other, they deadlock.
create or replace function public.touch_challenge_history()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists challenge_history_touch on public.challenge_history;
create trigger challenge_history_touch
  before update on public.challenge_history
  for each row execute function public.touch_challenge_history();
