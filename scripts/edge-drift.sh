#!/usr/bin/env bash
#
# Does what is DEPLOYED match what is in this repo? Downloads every live edge
# function and diffs it against supabase/functions/. Read-only.
#
# Edge functions are deployed by hand (`supabase functions deploy`), not by CI,
# so the two can drift. On 13 Oct 2026 they had: the live `upload` carried a
# file-type allow-list and size cap the repo did not, and the repo's `auth-gate`
# had an email check that was never deployed. Run this before deploying, and
# after any session that touched supabase/functions.
#
#   SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/edge-drift.sh
#   PROJECT_REF=<ref> ./scripts/edge-drift.sh
#
# Exit status 0 = no drift, 1 = drift (the diff is printed).
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-heuhqqoxyggawuckxocp}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SUPABASE="$(command -v supabase || find "$HOME/.npm/_npx" -type f -path '*@supabase/cli-*/bin/supabase' 2>/dev/null | head -1)"
[ -x "${SUPABASE:-}" ] || { echo "Supabase CLI not found (npx supabase --version installs it)." >&2; exit 2; }

code() { grep -vE '^[[:space:]]*(//|\*|/\*)' "$1" | grep -vE '^[[:space:]]*$'; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

LIVE=$("$SUPABASE" functions list --project-ref "$PROJECT_REF" --output json | python3 -c 'import json,sys; print(" ".join(f["slug"] for f in json.load(sys.stdin)))')
drift=0
for fn in $LIVE; do
  rm -rf supabase
  "$SUPABASE" functions download "$fn" --project-ref "$PROJECT_REF" --use-api >/dev/null 2>&1 || { echo "!! could not download $fn"; drift=1; continue; }
  if [ ! -d "$REPO/supabase/functions/$fn" ]; then
    echo "!! $fn is deployed but has no folder in the repo"; drift=1; continue
  fi
  # Each download carries the _shared files it imports; compare those too.
  # CODE ONLY: whole-line comments and blank lines are dropped first, so a
  # reworded comment is not reported as drift.
  for f in $(cd supabase/functions && find . -name '*.ts' | sed 's|^\./||'); do
    code "supabase/functions/$f" > live.txt
    code "$REPO/supabase/functions/$f" > repo.txt 2>/dev/null || : > repo.txt
    if ! diff -q -w live.txt repo.txt >/dev/null; then
      echo "== $fn: $f differs in code (< live, > repo)"
      diff -w live.txt repo.txt | head -40 || true
      drift=1
    fi
  done
done
for dir in "$REPO"/supabase/functions/*/; do
  name="$(basename "$dir")"
  [ "$name" = "_shared" ] && continue
  case " $LIVE " in *" $name "*) ;; *) echo "!! $name is in the repo but not deployed"; drift=1 ;; esac
done
[ "$drift" = 0 ] && echo "No drift: every deployed function matches the repo."
exit "$drift"
