# Challenge Sync — Chrome extension

Runs in a participant's own browser and privately syncs their LinkedIn stats to the challenge
server. It reads **only the signed-in user's own** data (follower count, their posts, and the
author-only analytics like impressions) and uploads it to your company's server. It never reads or
transmits the LinkedIn password, and never posts, likes, or messages on the user's behalf.

## Install (unpacked, for development)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the extension, make sure you're logged into LinkedIn, and click the icon.
5. Sign in with your **challenge account** — the same email and password you use on the website
   (create it at `/signup` for a new org, or `/join` with an invite code). Optionally set a custom
   server URL under **Advanced** (defaults to `http://localhost:3000`).

## How it works

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: `storage`, `alarms`, `cookies` + host access to `linkedin.com`. |
| `background.js` | Service worker. Schedules scrapes via `chrome.alarms`, runs the scrape→upload cycle, answers popup messages. |
| `linkedin.js` | The one fragile module: all LinkedIn/Voyager API calls + parsing. A LinkedIn change is a one-file fix. |
| `sync.js` | Talks to our server through the generated client; maps status codes to human messages. |
| `api.js` | Re-exports the generated client and points its root-relative URLs at the configured server. |
| `generated/nextrs-client/` | **Generated — do not edit.** Typed fetch client produced from the Rust routes by `cargo nextrs client generate` (config: `server/client/nextrs.client.json`). |
| `storage.js` | `chrome.storage.local` wrapper for config + status. No LinkedIn credentials stored. |
| `config.js` | Tunables: default server URL, sync cadence, jitter, request delay. |
| `popup.*` | The linking + status UI. |

Auth model: the popup takes the user's challenge-account email and password, exchanges them at
`/api/auth/device` for a sync token, and stores only that token — the password is never persisted.
Every later request carries the token as a bearer header. Signing in rotates the token, so linking
a browser un-links any previous one.

For LinkedIn itself no credentials are involved at all: the worker runs in the user's browser, so
LinkedIn cookies attach automatically to same-origin requests. The only header we set is
`csrf-token` (derived from the `JSESSIONID` cookie).
See `../docs/linkedin-scraping.md` for the endpoint research and `../docs/sync-protocol.md` for the
server contract.

## The server client is generated

`generated/nextrs-client/client.js` comes from the server's Rust route definitions via OpenAPI, so
request and response shapes cannot drift: rename a field in `route.rs`, regenerate, and the call
site here fails to type-check instead of breaking silently at runtime. Regenerate from the server
directory with `cargo nextrs client generate`.

It is generated with an empty base URL, because each install points at a different server
(localhost in dev, the company deployment in production, changeable from the popup) and the base
URL would otherwise be frozen at generation time. `api.js` therefore resolves the client's
root-relative `/api/...` paths against the configured server. Absolute URLs pass through untouched,
so the LinkedIn Voyager calls in `linkedin.js` are unaffected.

## Cadence & etiquette

Scrapes run about every 6 hours with random jitter, sequentially, with a short delay between
requests. On repeated `401` it stops and asks the user to re-open LinkedIn rather than hammering.

## Known-fragile bits

LinkedIn's internal API is undocumented and changes. Endpoints in `linkedin.js` are best-effort:
each collector degrades to `null` rather than throwing, so a broken endpoint reduces data quality
without breaking sync. The author-only analytics GraphQL `queryId` rotates and is discovered at
runtime; if discovery fails, impressions come back `null` until fixed.
