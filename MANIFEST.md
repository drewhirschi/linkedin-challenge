# LinkedIn Challenge — Project Manifest

## Vision

Companies run LinkedIn posting challenges to boost their team's presence. Today ours runs on a
centralized web scraper that is flaky, breaks on LinkedIn changes, and can't see per-post
analytics that are only visible to the post's author.

**The fix: move the scraping to the edge.** Every participant installs a Chrome extension that
runs inside their own browser, using their own already-logged-in LinkedIn session. The extension
periodically collects *their own* data — follower count, posts, and the full author-only
analytics (impressions, reactions, comments, reposts, profile views) — and syncs it to a central
server. The server scores everyone against competition rules the company configures, and renders
a live leaderboard.

## Actors & Flows

**Company admin**
1. Creates an organization and a competition (time window + scoring parameters).
2. Invites participants (invite links/codes).
3. Watches the leaderboard; can adjust future competition parameters.

**Participant**
1. Receives invite → opens invite link → downloads/installs the Chrome extension.
2. Redeems the invite on the web to create an account (email + password).
3. Signs into the extension with those same credentials; it exchanges them for a device sync
   token, binds their LinkedIn identity, and scrapes and syncs in the background.
4. Participant appears on the leaderboard; can view their own stats anytime.

## Competition configuration (all set per-competition by the admin)

- Time window (e.g. "next 3 months"), scored in weekly buckets.
- **Max posts graded per week** (e.g. 3 — extra posts don't score).
- **Per-post engagement points:** per reaction, per comment, per repost, per send, per save, per
  impression. A "send" is a private share — higher intent than a public repost, so it defaults to
  the same weight.
- **Only other people's comments score.** We record each comment with its author, so a member
  replying to their own thread earns nothing.
- **Normalization:** engagement points are normalized by the participant's follower count, so a
  5k-follower account and a 500-follower account compete fairly (configurable baseline).
- **Profile-level points:** per follower gained, per profile view during the window.

## Access model

**Everyone signs in.** There is no separate "admin login" and nothing is public: a visitor with no
session sees only the sign-in surfaces. `is_admin` is a role on a `Member`, not a different kind of
account, and the only thing it unlocks is the admin dashboard.

- **Participants** get credentials by redeeming their invite code on the web (`/join`).
- **Admins** are created by `/signup` (first admin of a new org) or by an invite with the admin role.
- **The extension** signs in with the same email and password and exchanges them for a bearer sync
  token (`/api/auth/device`); it stores the token, never the password. It is the one caller that
  does not use the session cookie, because it acts on the member's behalf from another origin.

## Layout

| URL | Who | What |
|---|---|---|
| `/` | any signed-in member | the competitions you've entered, and your rank in each |
| `/orgs/{slug}` | members | the org's competitions, running and finished |
| `/orgs/{slug}/c/{id}` | members | **the leaderboard** for one competition, with its rules |
| `/orgs/{slug}/c/{id}/members/{id}` | members | an entrant's posts inside that competition's window |
| `/orgs/{slug}/admin` | admins of that org | set up competitions, invites, aggregate progress |
| `/auth/login`, `/auth/join`, `/auth/signup` | anyone | the only pages reachable signed out |

**Competitions are joined, not inherited.** A `CompetitionEntry` records a member's place in one
competition, so an org can run several at once, a leaderboard ranks that competition's entrants,
and someone can sit one out. Entry is automatic in practice — redeeming an invite enters you in the
org's live competitions, and creating a competition enters the org's existing participants — but it
is a real row, so it can be revoked.

There is no system-wide admin. Administration is org-scoped: the role lives on a membership, so an
admin of one org has no access to another.

## UI screens

**Admin**

1. **Create & configure a challenge** — name, time window, and every scoring parameter from the
   configuration section above.
2. **Invite users** — generate and manage invite codes; see who has redeemed and who hasn't.
3. **Progress / aggregate view** — the whole org at a glance: totals and trends across all
   participants, not just the ranked list.
4. **Individual user stats** — per-participant page with their posts split out (see below).

**Everyone**

5. **Leaderboard** — the ranked standings.
6. **How the challenge is configured** — a plain-language explanation of the scoring rules in
   effect, so participants understand how points are earned rather than guessing.
7. **Personal standing** — where *I* place, my own stats, my own posts.

Screens 4 and 7 render the same post breakdown; the difference is who may view it.

## Participant detail page

Clicking a person on the leaderboard opens their detail page — a drill-down from "what's their
score" to "what did they actually post." Their profile picture heads the page, as it does their
leaderboard row.

- Lists that participant's posts with the date of each one, grouped by the week they fall into
  (the same weekly buckets the scoring uses, so the grouping matches how points were earned).
- Each post shows the full set of stats we've collected for it — impressions, reactions,
  comments, reposts — presented the way LinkedIn shows post analytics to the author.
- Stats shown are the latest snapshot for that post; the underlying `PostSnapshot` history stays
  append-only.

## Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────┐
│  Chrome Extension (MV3)    │  HTTPS │  Server — nextrs (Rust)      │
│  • runs in user's browser  │ ─────▶ │  • invite + token issuance   │
│  • uses user's own session │  sync  │  • ingest API (/api/sync)    │
│  • alarms: scrape every N h│        │  • scoring engine            │
│  • popup: link, status,    │        │  • React leaderboard + admin │
│    sync-now                │        │  • SQLite via Toasty ORM     │
└────────────────────────────┘        └──────────────────────────────┘
```

- **Server:** [nextrs](https://github.com/drewhirschi/nextrs) — a Rust/Axum framework
  with Next.js-style file-based routing under `app/`, React client pages (`page.tsx`) bundled by an
  embedded rolldown, and server data seeded into the React Query cache via `prefetch.rs`. The ORM
  stays Toasty. Originally built on [Topcoat](https://github.com/tokio-rs/topcoat) (server-rendered
  `view!` templates); see **MIGRATION.md** for what moved where and the gotchas.
- **Extension:** Manifest V3, no build step (plain JS). Background service worker with
  `chrome.alarms` for periodic scrapes. Talks to LinkedIn's internal (Voyager) JSON API using the
  session cookies already in the user's browser — far more robust than DOM scraping, and it can
  fall back to DOM scraping on analytics pages if needed.

## Privacy & security stance (important correction to the original pitch)

The extension **never collects LinkedIn credentials**. It doesn't need to: it runs in the user's
browser where LinkedIn cookies already live, so it reads the user's *identity and analytics*, not
their password. Session cookies never leave the browser. The only secret stored is the sync token
for **our** server. Each participant only ever uploads their own data, with consent given by
installing and linking the extension. Scrape cadence is low (a few times/day) and read-only.

Risks accepted: LinkedIn's Voyager API is unofficial and can change; automated access sits in a
gray zone of LinkedIn's ToS even for one's own data — mitigated by low frequency, own-data-only,
and in-browser execution.

## Data model (server)

- `Org` — company. `User` — person (LinkedIn URN, name, profile URL). `Membership` (role:
  admin | participant).
- `Invite` — code, org, role, expiry, redeemed_by.
- `SyncToken` — bearer token per linked extension install.
- `Competition` — org, name, start/end, and every scoring parameter as its own typed column.
  **No JSON columns anywhere in the schema:** all data is structured, so the rules are queryable
  and aggregatable in SQL, and a bad value fails to load instead of silently falling back to
  defaults.
- **Profile pictures** — the extension captures each participant's LinkedIn profile photo so the
  leaderboard and detail pages can show faces instead of initials. LinkedIn's media URLs are signed
  and expire, so storing the URL alone means broken images within days: the extension uploads the
  image bytes and we serve it ourselves (blob or object storage, with the content hash so a repeat
  sync of an unchanged photo is a no-op). `Member` gains an avatar field; the current
  `profile_url` is the link to their LinkedIn page, not their picture.
- `Post` — author, LinkedIn URN, permalink, created_at, text preview.
- `PostSnapshot` — post, captured_at, and the per-post analytics: impressions (plus the
  in-network / out-of-network split), reactions, comments, reposts, sends, saves, and the
  downstream effects LinkedIn attributes to the post — profile viewers gained and followers gained.
  Every metric is optional: a sync that couldn't read one stores nothing rather than a misleading
  zero.
- `PostComment` — one row per comment we've read: comment URN, commenter URN and name, and whether
  the commenter is the post's own author. Upserted by URN, because a comment is a fact that
  happened once rather than a reading that changes. LinkedIn's own comment *total* stays on the
  snapshot; these rows are what we actually saw, and scoring uses them.
- `ProfileSnapshot` — user, captured_at, follower_count, profile_views.
- Scores are **derived**, computed from snapshots at read time (latest snapshot per post inside
  the window, weekly buckets, top-N posts/week) — no stale denormalized score tables.

## Milestones

1. **M1 — Server core:** server app, schema, invites, token exchange, `/api/sync` ingest.
2. **M2 — Extension:** link flow, Voyager scraping (profile, posts, analytics), periodic sync.
3. **M3 — Scoring + leaderboard:** scoring engine, leaderboard UI, participant detail pages.
4. **M4 — Admin:** competition CRUD, invite management, org settings.
5. **M5 — Hardening:** DOM-scrape fallback, scrape jitter, error reporting, packaging/deploy.

## Repo layout

```
server/     Topcoat app (Rust)
extension/  Chrome extension (MV3, plain JS)
.reference/ cloned topcoat repo (git-ignored, for learning the framework)
docs/       research notes (LinkedIn API surface, scraping notes) and the deployment and
            extension-distribution guides
```
