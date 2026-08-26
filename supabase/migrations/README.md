# Migrations

## THE RULE, and the bug that bought it

**Never retype the body of a live function. Read it first.**

```sql
select pg_get_functiondef('public.on_reward_draft_invoice'::regproc);
```

On 25 Aug 2026 a migration needed to change ONE thing about
`on_reward_draft_invoice` — the stage its invoice starts at. It was hand-applied
through the Management API and the whole function body was retyped from memory.
Three things came out wrong, and the worst of them referenced a column that does
not exist (`creator_private.pay_account_name`; it is `pay_name`). A `record`
field is resolved at RUN time, so it compiled, deployed, and then raised on every
execution. The trigger is `AFTER INSERT` on `rewards`, so the exception aborted
the insert: **awarding a cash prize to a creator who had given us their bank
details failed outright, and "publish the winners" failed with it.** It went
unnoticed for a day because the only prizes that still worked were the ones for
creators we could not pay. See `131_a_prize_raises_an_invoice_that_can_be_paid.sql`.

A corollary, applied in 131: **a bookkeeping side-effect must never be able to
abort the thing it is bookkeeping.** Wrap it and notify somebody instead.

## THE REPO IS BEHIND THE DATABASE

As of 26 Aug 2026, **19 migrations exist in production and not in this folder.**
They were applied through the Supabase MCP / Management API without a file being
written. Numbering here jumps 114 → 126 and the gap is real, not cosmetic.

```
20260825134839  admin_panel_layout_per_admin
20260825142931  participation_vouchers_are_counted_not_typed
20260825170717  leaderboard_rebuilds_itself_from_the_entries
20260825170912  removing_an_entry_removes_it_from_the_board
20260825171009  leaderboard_reconciler
20260825171632  schedule_a_message_in_any_room
20260825172756  cpm_from_real_money_cash_and_vouchers_apart
20260825173357  invoices_one_per_prize_seen_when_raised_closed_when_sent
20260825195716  markets_can_be_deleted_led_by_several_and_asked_to_join
20260825200552  delete_market_ignores_its_own_leads
20260825200954  audit_everything_by_watching_the_tables
20260825201631  membership_role_is_creator_not_member
20260825201655  the_view_as_creator_sandbox_is_everywhere_and_silent
20260825202019  the_sandbox_cannot_dm_either
20260825203043  notes_are_private_until_shared
20260825203343  resources_can_carry_links
20260825204817  bonus_points_are_awarded_to_an_entry
20260826081139  milestone_progress_qualifies_its_columns
```

Consequences, in order of how much they should worry you:

1. **This folder cannot rebuild the database.** A restore from these files alone
   would produce a schema roughly a week behind production.
2. **A file here may not be what is running.** `114_award_challenge_prizes.sql`
   still contains the ORIGINAL, correct `on_reward_draft_invoice`; production
   ran a different and broken one for a day. Anybody reading 114 to find out
   what the trigger does would have been reading fiction. That is exactly how
   the retype happened.

They are all recoverable — Supabase keeps the SQL:

```sql
select version, name, array_to_string(statements, E';\n') as sql
from supabase_migrations.schema_migrations
where version > '20260825132250' order by version;
```

**Back-fill them.** Until that is done, treat `pg_get_functiondef` as the source
of truth for anything defined after 114, not this folder.

## Applying one

Either the Supabase MCP `apply_migration`, or
`POST https://api.supabase.com/v1/projects/{ref}/database/query` with an account
PAT. Whichever you use, **write the file here in the same change**.
