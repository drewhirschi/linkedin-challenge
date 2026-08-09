# LinkedIn Challenge

A better system for running company LinkedIn posting competitions. Instead of a central web scraper
(flaky, and blind to author-only analytics), each participant installs a **Chrome extension** that
runs in their own browser and privately syncs *their own* LinkedIn stats — follower count, posts,
and the author-only post analytics (impressions, reactions, comments, reposts, profile views) — to a
central server. The server scores everyone by the rules the company configures and renders a live
leaderboard.

See **[MANIFEST.md](MANIFEST.md)** for the full vision, actors, and architecture.

## Status

| Piece | State |
|---|---|
| **Server** (`server/`) | ✅ Compiles & runs. Admin signup/login, invites, competition config, bearer-auth ingest API, follower-normalized scoring, live leaderboard. Verified end-to-end. |
| **Extension** (`extension/`) | ✅ Complete MV3 extension: invite linking, periodic background sync, popup UI. LinkedIn/Voyager collectors are best-effort and **not yet verified against live LinkedIn** (see caveat). |
| **Scoring** | ✅ Weekly buckets, top-N posts/week, follower normalization, profile points — verified numerically. |

## Quick start

### Server

```sh
cd server
cargo install topcoat-cli          # one-time (Topcoat dev server)
SEED_DEMO=1 topcoat dev            # or: SEED_DEMO=1 cargo run
```

- `http://127.0.0.1:3000/orgs/demo` — a populated demo leaderboard (with `SEED_DEMO=1`)
- `http://127.0.0.1:3000/admin/signup` — create your own org + competition + invites

### Extension

1. `chrome://extensions` → enable Developer mode → **Load unpacked** → pick `extension/`.
2. Log into LinkedIn, open the extension, paste an invite code from the admin dashboard.
   (Set the server URL under **Advanced** if not `localhost:3000`.)

## How it fits together

```
Chrome extension (each participant's browser)          Server (Topcoat / Rust)
  reads own LinkedIn data via Voyager API      POST    /api/link   redeem invite → sync token
  every ~6h, using the browser's own session  ───────► /api/sync   bearer-auth JSON ingest
  never sees the password                                ├─ Toasty ORM → libsql (→ Turso later)
                                                          ├─ scoring.rs (derived at read time)
  Admin (browser)                                        └─ /orgs/{slug} live leaderboard
    /admin  signup · competitions · invites
```

The full protocol is in **[docs/sync-protocol.md](docs/sync-protocol.md)**; the LinkedIn API
research is in **[docs/linkedin-scraping.md](docs/linkedin-scraping.md)**; a distilled Topcoat/Toasty
build reference is in **[docs/topcoat-cheatsheet.md](docs/topcoat-cheatsheet.md)**.

## Tech choices

- **Server:** [Topcoat](https://github.com/tokio-rs/topcoat) 0.5 (Tokio's server-rendered Rust
  framework) — chosen deliberately to trial it. Server-rendered `view!` templates, cookie sessions,
  module routing, no JS build step.
- **ORM/DB:** [Toasty](https://github.com/tokio-rs/toasty) 0.7 with its **libsql** (`turso`) driver.
  Local `turso:linkedin.db` file now; moving to hosted Turso is a connection-string change.
- **Extension:** Manifest V3, plain JS (no build step). Uses LinkedIn's internal Voyager JSON API
  from the user's own logged-in session.

## Privacy stance (a correction to the original pitch)

The extension **does not collect LinkedIn credentials** and doesn't need to: it runs in the user's
browser where LinkedIn's session cookies already live, so it reads the user's own identity and
analytics without ever touching their password. Session cookies never leave the browser. The only
secret sent to our server is a per-install sync token. Each participant uploads only their own data,
by consent (installing + linking). Scrape cadence is low (a few times/day), read-only, own-data-only.

## Caveat: LinkedIn endpoints are unverified

LinkedIn's Voyager API is undocumented and changes often. The collectors in
`extension/linkedin.js` encode the best-known endpoints and degrade to `null` rather than breaking,
but they have **not been run against a live LinkedIn session** in this build. The auth/analytics
`queryId` rotates and is discovered at runtime. Expect to verify and adjust `linkedin.js` against
the live site. Everything server-side (link, sync, scoring, leaderboard, admin) is verified working.

## Repo layout

```
server/      Topcoat + Toasty app (the whole backend + web UI)
extension/   Chrome MV3 extension
docs/        sync protocol, LinkedIn research, Topcoat build cheat-sheet
MANIFEST.md  vision, actors, architecture, data model, milestones
```
