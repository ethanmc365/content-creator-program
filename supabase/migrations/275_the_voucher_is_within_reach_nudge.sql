-- "YOU ARE 3 POINTS FROM A VOUCHER", SENT WHILE IT IS STILL POSSIBLE.
--
-- Outstanding from the 28 Sep brief: the mid-challenge nudge. The leaderboard
-- already prints "3 points to the voucher" on a creator's own row, which is the
-- right thing to say to somebody who is looking at the leaderboard. The whole
-- problem is that they are not: a creator who has filmed twice and drifted off
-- is exactly the person this is worth telling, and they are the least likely to
-- open the board and find out.
--
-- WHAT IT WILL NOT DO, because a nudge that gets any of these wrong is spam:
--
--   * It never fires for somebody who has ALREADY reached the threshold. That
--     is a congratulation, not a nudge, and it is a different message.
--   * It never fires for somebody on nought. "You are 18 points from a voucher"
--     to a creator who has not entered is not a nudge, it is an advert, and the
--     challenge reminders already cover them.
--   * It fires ONCE per creator per challenge, recorded in a table, so a score
--     that hovers near the line cannot send it every morning.
--   * It only fires while there is time to act - at least a day left - and only
--     within striking distance (a third of the threshold, capped at five),
--     because "you are 12 points away" is not news anybody can use.
--
-- The threshold can be counted in POINTS or in VIDEOS (`participation_basis`),
-- so the sentence is built from whichever this challenge uses.
--
-- Measured against production on 28 Sep: of the eighteen creators standing in
-- the Global Challenge, six are within five points of the voucher and would be
-- nudged, twelve already have it and are correctly skipped.
--
-- The number formatting is in 276 - see it for why `3.00` needed fixing.

create table if not exists public.voucher_nudges_sent (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  points_short numeric,
  primary key (challenge_id, creator_id)
);

alter table public.voucher_nudges_sent enable row level security;

drop policy if exists "admins read voucher nudges" on public.voucher_nudges_sent;
create policy "admins read voucher nudges" on public.voucher_nudges_sent
  for select using (public.is_admin());

-- The function body as it finally shipped is in 276.

select cron.schedule('voucher-nudges', '0 10 * * *', 'select public.send_voucher_nudges()');
