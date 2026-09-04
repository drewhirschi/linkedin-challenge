#!/bin/bash
# Prebuilt Vercel deploy: build on YOUR machine, upload only artifacts.
# Cloud builds recompile the whole Rust dependency tree from scratch on a
# small builder (~6-10 minutes, plus per-account queue time); this flow
# deploys in seconds. Git-push auto-builds are disabled in vercel.json
# ("git": {"deploymentEnabled": false}) — this script IS the deploy path.
#
#   scripts/deploy-prebuilt.sh             # production
#   scripts/deploy-prebuilt.sh --preview   # preview deploy
#
# One-time setup:
#   npm i -g vercel && vercel login && vercel link
#   cargo install cargo-zigbuild     # cross-compiles for Lambda's glibc
#   pip install ziglang              # zig toolchain (or install zig any way)
#
# Full guide: https://nextrs-docs.vercel.app/docs/deploy-prebuilt
set -euo pipefail
cd "$(dirname "$0")/.."

[ "${1:-}" = "--preview" ] && FLAGS=() || FLAGS=(--prod)

if command -v vercel >/dev/null 2>&1; then
  VERCEL=(vercel)
elif npx --no-install vercel --version >/dev/null 2>&1; then
  VERCEL=(npx --no-install vercel)
else
  echo "ERROR: Vercel CLI is not installed in this project or on PATH." >&2
  exit 1
fi

# The native release build bundles the React pages, which import the generated API client. Refresh
# that contract only when its Rust sources changed. Vercel then performs two distinct release
# outputs: the native build creates browser assets while Node dependencies are resolvable, and the
# Linux cross-build creates the Lambda binary. A clean checkout has no ignored generated client,
# so its first deploy refreshes once; normal deploys reuse the client produced by `cargo dev`.
CONTRACT=.nextrs/openapi.json
GENERATED=.nextrs/client/src/generated/fetch/index.ts
if [ ! -f "$CONTRACT" ] || [ ! -f "$GENERATED" ] || \
   find app/api src -type f -name '*.rs' -newer "$CONTRACT" -print -quit | grep -q .; then
  echo "API contract changed; regenerating the client"
  npm run client:release
else
  echo "API contract is current; reusing the generated client"
fi
npm run typecheck

"${VERCEL[@]}" pull --yes --environment=production > /dev/null

# Migrate BEFORE uploading: every migration is additive, so the running build tolerates the new
# schema, and a failing migration aborts here instead of crashing every cold start. Preview deploys
# share the production database, so they migrate it too. Uses the direct (unpooled) connection —
# DDL through the connection pooler is unreliable.
PROD_ENV=.vercel/.env.production.local
if [ ! -f "$PROD_ENV" ]; then
  echo "ERROR: vercel pull did not produce $PROD_ENV" >&2
  exit 1
fi
MIGRATE_URL=$(set -a; . "$PROD_ENV"; set +a; printf '%s' "${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}")
if [ -z "$MIGRATE_URL" ]; then
  echo "ERROR: no DATABASE_URL_UNPOOLED or DATABASE_URL in $PROD_ENV" >&2
  exit 1
fi
echo "migrating the production database"
DATABASE_URL="$MIGRATE_URL" cargo run --quiet --release --bin migrate

"${VERCEL[@]}" build "${FLAGS[@]}"

# Refuse to ship if the Rust function silently failed to build (the classic
# missing-cargo-zigbuild failure: everything green, no binary in the output).
if ! find .vercel/output/functions -name '*.func' -type d 2>/dev/null | grep -q .; then
  echo "ERROR: no function in .vercel/output — is cargo-zigbuild installed and zig reachable?" >&2
  exit 1
fi

"${VERCEL[@]}" deploy --prebuilt "${FLAGS[@]}"
