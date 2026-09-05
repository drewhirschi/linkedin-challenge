set shell := ["bash", "-euo", "pipefail", "-c"]

localhost := "http://localhost:3312"

# Show the available project commands.
default:
    @just --list

# Check that the local development tools are installed.
doctor:
    @command -v cargo >/dev/null || { echo "missing: cargo" >&2; exit 1; }
    @command -v nextrs >/dev/null || { echo "missing: cargo-nextrs (install with: cargo install cargo-nextrs)" >&2; exit 1; }
    @command -v node >/dev/null || { echo "missing: node" >&2; exit 1; }
    @command -v npm >/dev/null || { echo "missing: npm" >&2; exit 1; }
    @command -v python3 >/dev/null || { echo "missing: python3" >&2; exit 1; }
    @command -v zip >/dev/null || { echo "missing: zip" >&2; exit 1; }
    @echo "development tools are ready"

# Run the web/API server with the local account and idempotent Q3 World Cup seed.
dev:
    cd server && DATABASE_URL=turso:linkedin.db cargo dev

# Release only: a debug build would seed the local test account into production and apply
# migrations on startup. Run `just migrate-prod` first if the schema changed.
# Run a release build locally against the PRODUCTION database (credentials from server/.env.local).
run-prod:
    cd server && test -f .env.local || { echo "missing server/.env.local (run: vercel env pull .env.local)" >&2; exit 1; }
    cd server && cargo build --release --bin linkedin-challenge-server
    cd server && set -a && . ./.env.local && set +a && DATABASE_URL="$DATABASE_URL_UNPOOLED" PORT=3312 ./target/release/linkedin-challenge-server

# Apply the schema and additive migrations to the local database. Idempotent.
migrate:
    cd server && DATABASE_URL=turso:linkedin.db cargo run --quiet --bin migrate

# Migrate the PRODUCTION database (creds from server/.env.local); `just deploy` runs this first.
migrate-prod:
    cd server && test -f .env.local || { echo "missing server/.env.local (run: vercel env pull .env.local)" >&2; exit 1; }
    cd server && set -a && . ./.env.local && set +a && DATABASE_URL="$DATABASE_URL_UNPOOLED" cargo run --quiet --release --bin migrate

# Ensure the local account and Q3 World Cup challenge exist without resetting synced data.
seed-local:
    cd server && DATABASE_URL=turso:linkedin.db cargo run --bin seed-local

# Build the stable unpacked Chrome extension directory for the local server.
extension-dev:
    cd extension && ./build.sh {{localhost}} --dir
    @echo "Load or reload extension/dist/unpacked in chrome://extensions"

# Build a Chrome Web Store zip for an explicit HTTPS server origin.
extension-release server_url:
    [[ "{{server_url}}" == https://* ]] || { echo "release URL must use https" >&2; exit 1; }
    cd extension && ./build.sh "{{server_url}}"

# Run the fast checks not already guaranteed by Vercel's release cross-build.
deploy-check:
    node --check extension/api.js
    node --check extension/background.js
    node --check extension/config.js
    node --check extension/linkedin.js
    node --check extension/popup.js
    node --check extension/diagnostics.js
    node --check extension/storage.js
    node --check extension/sync.js
    bash -n extension/build.sh
    git diff --check

# Build, verify, and deploy the server to the linked Vercel production project.
deploy: deploy-check
    cd server && ./scripts/deploy-prebuilt.sh

# Build, verify, and deploy an unaliased Vercel preview.
deploy-preview: deploy-check
    cd server && ./scripts/deploy-prebuilt.sh --preview

# Compile and check the server and extension without requiring a live browser session.
check:
    cd server && npm run client:ensure
    cd server && cargo build
    cd server && npm run typecheck
    cd server && cargo test
    node --check extension/api.js
    node --check extension/background.js
    node --check extension/config.js
    node --check extension/linkedin.js
    node --check extension/popup.js
    node --check extension/diagnostics.js
    node --check extension/storage.js
    node --check extension/sync.js
    bash -n extension/build.sh
    server/scripts/test-auth-e2e.sh
    node scripts/test-extension-e2e.mjs
    git diff --check

# Drive the extension's LinkedIn collectors in headless Chromium on the signed-in dev profile
# (.chromium-dev-profile) and assert the follower count, posts, and comments come back right.
# Set EXPECTED_FOLLOWERS=<n> to also assert the count within 15%.
test-extension-e2e: extension-dev
    node scripts/test-extension-e2e.mjs

# Exercise password auth against a real server and isolated temporary database.
test-auth-e2e:
    server/scripts/test-auth-e2e.sh

# On a clean, pushed commit: run all checks and post the required GitHub commit status.
signoff:
    scripts/local-check-signoff.sh
