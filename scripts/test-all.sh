#!/usr/bin/env bash
# Every automated check SOUL has, in order (Phase 16, TESTING.md). The last three steps need the
# local Supabase stack (`npm run db:start`); `npm run test:all -- --no-db` skips them.
set -euo pipefail
cd "$(dirname "$0")/.."

step() {
  local name="$1"
  shift
  echo
  echo "== ${name}"
  "$@"
}

step "Types" npm run --silent typecheck
step "Lint" npm run --silent lint
step "Format" npm run --silent format:check
step "No invisible characters in source" npm run --silent text:check
step "Unit tests" npx jest --silent
step "Edge Functions (Deno type check)" npm run --silent functions:check
if [ "${1:-}" != "--no-db" ]; then
  step "Database (pgTAP)" npm run --silent db:test
  step "Server over HTTP (db:verify)" npm run --silent db:verify
  step "Cross-account attacks (security:attack)" npm run --silent security:attack
fi
echo
echo "All checks passed."
