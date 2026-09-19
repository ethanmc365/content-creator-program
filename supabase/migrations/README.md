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

**Re-measured 19 Sep 2026, by listing every function in `public` and asking this
folder whether it defines it. THIRTY-SEVEN DO NOT EXIST HERE AT ALL:**

```
admin_decline_application      log_application_approved      reward_follows_invoice
admin_delete_challenge         market_gets_its_rooms         same_flight
admin_find_user_id_by_email    mint_referral_reward          sandbox_cannot_speak
audit                          move_creator_market           sandbox_follows_new_market
audit_change                   on_event_poll_created         seed_challenge_point_rules
award_bonus                    on_event_suggestion           set_entry_feedback
challenge_voucher_counts       public_live_challenge         set_market_leads
day_key_month                  purge_old_audit_log           set_market_retired
decide_join_request            reconcile_stale_leaderboards  touch_last_seen
delete_market                  reopen_invoice                views_leaderboard
fx_convert                     resnapshot_invoice            withdraw_bonus
game_mode_leaderboard          results_follow_deleted_entry
increment_referral_click
invoice_terms
```

36 of the 37 are SECURITY DEFINER and 11 are trigger functions. 989 lines,
33 kB. They are here because migrations kept being applied through the Supabase
MCP / Management API without a file being written beside them; numbering in this
folder jumps 114 → 126 and the gap is real, not cosmetic.

Some of them are load-bearing, which is the reason this matters rather than
being tidiness: `purge_old_audit_log` DELETES THE AUDIT TRAIL, `move_creator_market`
moves a creator between markets, `views_leaderboard` feeds CPM, `award_bonus`
and `withdraw_bonus` move the points that become prize money, and
`increment_referral_click` and `public_live_challenge` are two of the five
functions deliberately exposed to anon.

Note what a missing definition does to a comment. `131_a_leaderboard_of_views_not_points.sql`
says "see the deployed `views_leaderboard(p_community uuid)`" — the file is
pointing at something that exists only on the server. Follow that instruction
and you are reading production, not the repo.

Consequences, in order of how much they should worry you:

1. **This folder cannot rebuild the database.** A restore from these files alone
   would come up 37 functions short, silently — tables and policies would build,
   and the first call to any of them would fail at run time.
2. **A file here may not be what is running.** `114_award_challenge_prizes.sql`
   still contains the ORIGINAL, correct `on_reward_draft_invoice`; production
   ran a different and broken one for a day. Anybody reading 114 to find out
   what the trigger does would have been reading fiction. That is exactly how
   the retype at the top of this file happened.

### Fixing it — and NOT by hand

Everything is recoverable. VERIFIED 19 Sep 2026: `supabase_migrations.schema_migrations`
holds **250 rows, every one of them with its SQL**, back to 27 Jun 2026.

```sql
select version, name, array_to_string(statements, E';\n') as sql
from supabase_migrations.schema_migrations order by version;
```

**Do not back-fill by copying function bodies through a chat window.** That is
the bet described at the top of this file, taken 37 times. Read the bytes off
the server instead:

```bash
supabase login            # once
./scripts/dump-db-schema.sh
```

which writes `supabase/schema.sql` — the complete current `public` schema,
byte-exact, no retyping — and should be committed and re-run after any schema
change. Until that exists, treat `pg_get_functiondef` as the source of truth for
anything defined after 114, not this folder.

## Applying one

Either the Supabase MCP `apply_migration`, or
`POST https://api.supabase.com/v1/projects/{ref}/database/query` with an account
PAT. Whichever you use, **write the file here in the same change**.
