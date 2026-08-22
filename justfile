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

# Run the web/API server with the empty local account at http://localhost:3312.
dev:
    cd server && DATABASE_URL=turso:linkedin.db SEED_LOCAL=1 cargo dev

# Create the empty local account without starting the server.
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
    node --check extension/storage.js
    node --check extension/sync.js
    bash -n extension/build.sh
    git diff --check
