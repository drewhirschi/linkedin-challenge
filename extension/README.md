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

Automatic scrapes run twice a day with random jitter, sequentially, with a short delay between
requests. A floor in code enforces that independently of the alarm, because Chrome can fire alarms
early after a wake-from-sleep or a worker restart.

**Manual "Sync now" bypasses the floor.** The limit exists to keep *unattended background* traffic
polite; a person pressing a button is deliberate and self-limiting, so refusing them serves nobody.
The popup shows when the next automatic sync is due either way.

On repeated `401` it stops and asks the user to re-open LinkedIn rather than hammering.

## What the sync actually reads

One request to `profileUpdatesV2` returns the posts *and* their engagement. In LinkedIn's
normalized envelope `SocialActivityCounts` is its own entity in `included` — it is not nested
inside `SocialDetail`, which holds only a reference plus `totalShares`. Reactions, comments,
reposts and **impressions** (`numLikes` / `numComments` / `numShares` / `numImpressions`) all come
from there, matched to a post by the activity id embedded in its entity URN.

Post timestamps are decoded from the activity URN itself: LinkedIn ids are snowflake-like, so
`id >> 22` is the millisecond epoch. No response field, no extra request.

Follower count is currently unavailable — the `networkinfo` endpoint answers `410 Gone`. The
**Copy diagnostics** button probes replacement endpoints and reports which respond.

## Known-fragile bits

LinkedIn's internal API is undocumented and changes. Endpoints in `linkedin.js` are best-effort:
each collector degrades to `null` rather than throwing, so a broken endpoint reduces data quality
without breaking sync. The author-only analytics GraphQL `queryId` rotates and is discovered at
runtime; if discovery fails, impressions come back `null` until fixed.
