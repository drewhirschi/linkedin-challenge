# LinkedIn Challenge — server

A full-stack Rust app built on [nextrs](https://github.com/drewhirschi/nextrs) — an Axum backend
serving Next.js-style file routes with React client pages — with
[Toasty](https://github.com/tokio-rs/toasty) as the ORM, backed by **libsql** (Toasty's `turso`
driver) so the eventual move to hosted Turso is a connection-string change.

Ported from Topcoat; see [MIGRATION.md](../MIGRATION.md) for what moved where and the gotchas.

## Run

```sh
cargo install cargo-nextrs-dev      # one-time, the `cargo dev` watcher
cd client && npm install && cd ..   # one-time, the bundler resolves imports from here
SEED_DEMO=1 cargo dev               # http://127.0.0.1:3000, with a populated "Demo Corp" leaderboard
```

Or without the watcher: `SEED_DEMO=1 cargo run`.

Everything requires a session, so start at `/login`. The demo seed creates accounts you can use
(password `demopassword` for all of them):

- `admin@demo.test` — admin: sees the dashboard as well as the leaderboard
- `ada@demo.test`, `ben@demo.test`, `carmen@demo.test`, `dev@demo.test`, `erin@demo.test` —
  participants

Reachable signed out: `/login`, `/join` (redeem an invite code), `/signup` (create an org).

### Environment

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `turso:linkedin.db` | libsql connection. Local file now; a hosted Turso URL later. |
| `SEED_DEMO` | _(unset)_ | If set, seeds a demo org + competition + participants on first run. |
| `PORT` | `3000` | Bind port; falls back to the next free port up to +20. |

The schema is created on first run only: Toasty's `push_schema()` issues plain `CREATE TABLE` with
no create-if-missing, so `connect()` probes for an existing table and pushes only when the database
is empty. It still does not *migrate* — after changing a model, delete `linkedin.db*` (or point
`DATABASE_URL` at a fresh file) to recreate.

### Changing an API route

`route.rs` handlers annotated with `#[nextrs::api]` are the source of the OpenAPI document, which
generates both clients: the React Query hooks the pages use, and the plain-JS client the Chrome
extension imports. After changing a handler's path, params, body, or response:

```sh
cargo install cargo-nextrs          # one-time
cargo nextrs client generate        # refreshes the contract, both clients, and publishes to the extension
cargo build                          # rewrites client/src/generated/index.ts that generation cleaned
```

`client/nextrs.client.json` points the external client at
`extension/generated/nextrs-client/`. Run generation BEFORE `cargo build`: generation cleans
`client/src/generated/`, and the Rust build is what writes the `index.ts` barrel back, so the
other order leaves `@server/client` exporting nothing.

Nothing under `client/src/generated/`, `client/openapi.json`, `public/dist/`, or
`extension/generated/` is hand-written — all of it is regenerated.

### Moving to Turso later

Toasty's `turso` driver *is* the libsql driver. Today the URL is a local file (`turso:linkedin.db`).
For hosted Turso, build the driver with a remote URL + auth token and use `Db::builder().build(driver)`
instead of `.connect(url)` — see `db-libsql-turso` notes. Nothing else changes.

## Layout

```
src/                  domain layer — a lib crate, because src/bin/dump-openapi.rs is a second
                      crate root that shares the generated route registry
  lib.rs              module list
  models.rs           Toasty models (Org, Member, Invite, Competition, Post, PostSnapshot,
                      ProfileSnapshot, AdminSession) + connect()
  scoring.rs          ScoringConfig + compute_standings (derived, weekly buckets, top-N/week,
                      follower normalization, profile points) + active_competition
  dto.rs              wire shapes + the reads behind them (leaderboard, member detail, aggregate)
  web.rs              ApiError — one JSON error shape for every route
  auth.rs             Argon2 passwords, session cookie, email lookup, bearer token (extension)
  util.rs             unix time, ISO/date parsing, invite codes, bearer tokens, a small SHA-256
  seed.rs             optional demo data
  main.rs             Db setup, CORS layer, router assembly, graceful shutdown

app/                  the router — every directory is a URL segment
  middleware.rs       root guard: signed out sees only the sign-in surfaces
  layout.tsx          root chrome, stays mounted across soft navigation
  page.tsx            / landing            (+ prefetch.rs)
  login/ join/ signup/  sign in, redeem an invite, create an org
  orgs/[slug]/        leaderboard + scoring explanation          (+ prefetch.rs)
    members/[id]/     a participant's posts by week              (+ prefetch.rs)
  admin/              dashboard; middleware.rs narrows it to is_admin
  api/                link, sync, auth/*, orgs/*, admin/*

client/               generated typed client (npm package, imported as @server/client)
public/style.css      the stylesheet
```

## How auth works

**Everyone signs in; nothing is public.** Participants and admins are both `Member` rows with an
email and an Argon2 password hash, looked up by email at login. `is_admin` is a role on top, and
the only thing it unlocks is `/admin`.

- **Sessions.** The server mints a random token, stores only its SHA-256 on an `AdminSession` row,
  and returns it as an `HttpOnly; SameSite=Lax` cookie. `app/middleware.rs` guards every route
  except the sign-in surfaces, the auth API, the extension protocol, and static assets — a
  presence check on the cookie, since each handler verifies the session properly anyway.
  `app/admin/middleware.rs` additionally requires `is_admin` (one database lookup).
- **Getting in.** `/signup` creates an org and its first admin; `/join` redeems an invite code into
  a participant account.
- **The extension** posts the same email and password to `/api/auth/device` and gets a sync token
  back, storing only the token. Issuing rotates it, so one browser is linked at a time. `/api/link`
  then binds a LinkedIn identity to that account and `/api/sync` ingests snapshots, both
  bearer-authenticated. A permissive `CorsLayer` lets a `chrome-extension://` origin call them —
  safe precisely because they use bearer auth rather than the session cookie.
