#!/usr/bin/env bash
#
# MAKE THE REPOSITORY ABLE TO REBUILD THE DATABASE AGAIN.
#
# WHY THIS EXISTS
#
# `supabase/migrations/` is not a complete description of production. Migrations
# have repeatedly been applied through the Supabase MCP / Management API without
# a file being written beside them, and the drift has been measured twice:
#
#   26 Aug 2026  19 migrations in production with no file here.
#   19 Sep 2026  37 FUNCTIONS exist in `public` with no `create function` for
#                them anywhere in this folder. They are listed in README.md.
#
# Some of those 37 are not small: `purge_old_audit_log` deletes the audit trail,
# `move_creator_market` moves a creator between markets, `views_leaderboard`
# feeds CPM, `award_bonus` and `withdraw_bonus` move points that become money.
# If this project ever had to be restored from git, they would simply be absent
# and nothing in the repo would say what they used to do.
#
# WHY IT IS A SCRIPT AND NOT A HAND-WRITTEN MIGRATION
#
# README.md opens with the rule this repo paid for: NEVER RETYPE THE BODY OF A
# LIVE FUNCTION. A migration was once hand-retyped from memory, three things came
# out wrong, and awarding a cash prize to a creator who had given us their bank
# details failed outright for a day. Copying 989 lines of live function bodies
# through a chat window to "back-fill" them would be the same bet at 37x the
# size. This reads the bytes off the server instead.
#
# USAGE
#
#   supabase login                 # once; opens a browser, stores a token
#   ./scripts/dump-db-schema.sh    # writes supabase/schema.sql
#
# Or without logging in, if you would rather paste a token than keep one:
#
#   SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/dump-db-schema.sh
#
# Commit the result. Re-run it after any schema change so it stays honest.

set -euo pipefail

PROJECT_REF="${PROJECT_REF:-heuhqqoxyggawuckxocp}"
OUT="${OUT:-supabase/schema.sql}"

# The CLI is a standalone Go binary. Node is NOT required to run it - which
# matters here because node lives in ~/.local/node/bin and is NOT on the global
# PATH, so a bare `npx supabase` fails with "env: node: No such file or
# directory" and reads like a missing install. Prefer whatever is on PATH, then
# fall back to the binary npx already cached. (`./dev.sh` fixes the PATH for
# everything else.)
if command -v supabase >/dev/null 2>&1; then
  SUPABASE=supabase
else
  SUPABASE="$(find "$HOME/.npm/_npx" -type f -path '*@supabase/cli-*/bin/supabase' 2>/dev/null | head -1)"
fi

if [ -z "${SUPABASE:-}" ] || [ ! -x "$SUPABASE" ]; then
  echo "error: the Supabase CLI was not found." >&2
  echo "       Install it with:  brew install supabase/tap/supabase" >&2
  exit 1
fi

echo "CLI:     $SUPABASE ($("$SUPABASE" --version))"
echo "project: $PROJECT_REF"

if ! "$SUPABASE" projects list >/dev/null 2>&1; then
  echo "error: not signed in. Run 'supabase login', or set SUPABASE_ACCESS_TOKEN." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
"$SUPABASE" link --project-ref "$PROJECT_REF" >/dev/null
"$SUPABASE" db dump --linked --schema public -f "$OUT"

echo
echo "wrote $OUT ($(wc -l < "$OUT" | tr -d ' ') lines)"
echo "Every function in public is now described in this repository. Commit it."
