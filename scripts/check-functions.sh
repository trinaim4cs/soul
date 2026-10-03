#!/usr/bin/env bash
# Type-checks every Edge Function with Deno. Uses `deno` from PATH when installed (CI), else
# fetches it through npm (this machine; caches stay on D:). The functions resolve their own
# `npm:` imports, like the hosted runtime, never the app's node_modules (which CI does not
# install for this job).
set -euo pipefail
export DENO_DIR="${DENO_DIR:-D:/soul-dev/deno}"
cd "$(dirname "$0")/.."
if command -v deno >/dev/null 2>&1; then
  deno check --node-modules-dir=none supabase/functions/*/index.ts
else
  npx --yes deno@2 check supabase/functions/*/index.ts
fi
