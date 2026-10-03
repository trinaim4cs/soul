#!/usr/bin/env bash
# Type-checks every Edge Function with Deno (fetched through npm; caches stay on D:).
set -euo pipefail
export DENO_DIR="${DENO_DIR:-D:/soul-dev/deno}"
cd "$(dirname "$0")/.."
npx --yes deno@2 check supabase/functions/*/index.ts
