#!/usr/bin/env bash
# Type-checks every Edge Function with Deno. Uses `deno` from PATH when installed (CI), else
# fetches it through npm (this machine; caches stay on D:).
set -euo pipefail
export DENO_DIR="${DENO_DIR:-D:/soul-dev/deno}"
cd "$(dirname "$0")/.."
if command -v deno >/dev/null 2>&1; then
  deno check supabase/functions/*/index.ts
else
  npx --yes deno@2 check supabase/functions/*/index.ts
fi
