-- A VOUCHER MILESTONE PAYS OUT, rather than printing a chip.
--
-- "GBP 25 Tryp.com travel voucher" was free text on the route and nothing else:
-- nobody was told, no payout existed, and the money never appeared in the
-- rewards ledger or on the creator's own page. A milestone voucher is now the
-- same object a challenge prize is - a row in `rewards` - so it is counted,
-- invoiced and chased by every tool that already exists for that.
--
-- See the deployed `milestone_progress`, which mints on reach, revokes a
-- PENDING voucher if the stop stops qualifying, and leaves a distributed one
-- alone: once it is somebody's money a threshold typo does not reverse it.

alter table public.milestones add column if not exists voucher_amount   numeric;
alter table public.milestones add column if not exists voucher_currency text default 'EUR';

alter table public.rewards add column if not exists milestone_id uuid references public.milestones(id) on delete set null;

alter table public.rewards drop constraint if exists rewards_source_check;
alter table public.rewards add constraint rewards_source_check
  check (source in ('challenge', 'referral', 'manual', 'milestone'));

-- One voucher per creator per milestone, forever. The ladder is recomputed on
-- every read, so without this a creator refreshing their route page would mint
-- a payout per refresh.
create unique index if not exists rewards_one_per_milestone
  on public.rewards(creator_id, milestone_id) where milestone_id is not null;
