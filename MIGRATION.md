# Migration: Topcoat → nextrs

Porting the server from [Topcoat](https://github.com/tokio-rs/topcoat) (server-rendered `view!`
templates) to [nextrs](https://github.com/drewhirschi/nextrs) (Rust/Axum backend, React client
pages, file-based `app/` routing).

**Toasty stays.** The ORM, the models, and the derived-scoring approach are unchanged. What gets
rewritten is the layer above them: routing, rendering, and how a handler gets its `Db`.

Following the [porting guide](https://nextrs-docs.vercel.app/docs/porting): start from the
scaffold, then convert route-by-route, verifying each vertical slice end to end.

## Status — complete

- [x] nextrs skeleton adopted into `server/` via `create-nextrs-app --adopt --here`
- [x] `Cargo.toml` merged; **Topcoat removed** (clean cut, not a strangler — nothing is deployed,
      so running both frameworks side by side would have cost more than it saved)
- [x] `src/main.rs` from `src/main.rs.example`, with Toasty's `Db` as an Axum `Extension` and a
      global `CorsLayer` replacing the per-endpoint `cors.rs`
- [x] Domain layer moved to `src/lib.rs` — required, because `src/bin/dump-openapi.rs` is a second
      crate root that `include!`s the same registry, so shared modules cannot live in `main.rs`
- [x] `scoring.rs` off `&Cx` onto `&mut Db`; `auth.rs` rewritten (own cookie, hash stored, no
      framework session); `models.rs` `db(cx)` → `connect()`
- [x] 12 `route.rs` handlers, 7 pages, 3 `prefetch.rs` seeds, 1 `middleware.rs` guard
- [x] `styles.rs` (a Rust string constant) → `public/style.css`; `ui.rs` components → React
- [x] Verified end to end against a seeded database (below)
- [x] `Competition.config_json` replaced by typed columns — no JSON is stored anywhere
- [x] Login-first access model — everyone signs in; admin is a role, not a separate login
- [ ] Profile pictures — deliberately not started, see MANIFEST.md

## Verified

Booted with `SEED_DEMO=1` and exercised the whole surface:

| Check | Result |
|---|---|
| Public leaderboard `/api/orgs/demo` | 5 ranked standings, scoring config attached |
| Member detail | rank 1, posts bucketed into 3 scoring weeks |
| Unknown org / member | `404` |
| `/api/admin/overview` unauthenticated | `401` |
| Signup → `Set-Cookie` → admin overview | `200`, org and aggregate correct |
| Create invites / competition | `200`; overview reflects both immediately |
| Login wrong / right password | `401` / `200` |
| `/admin` anonymous | `303 → /login`; with session, `200` |
| Leaderboard page HTML | `__nx_seeds__` carries all 5 standings — seeded, no client fetch |
| Full loop: invite → link → sync → board | member appears scored `64.17` |
| Reused invite | `404` |

The scoring math was checked by hand on the last row: 900 impressions x 0.01 + 40 reactions x 1 +
6 comments x 3 + 2 reposts x 5 = 77, normalized by 1000/1200 followers = **64.17**. Matches.

The extension contract is unchanged — `/api/link` and `/api/sync` keep their status codes and body
shapes, so `extension/sync.js` needs no edits. (`LinkResponse` gained `memberId` and `orgSlug`,
which is additive.)

## As built

| URL | Was | Now |
|---|---|---|
| `/` | `src/app.rs:89` `home` | `app/page.tsx` + `app/prefetch.rs` |
| `/orgs/{slug}` | `src/app/orgs/slug.rs:19` | `app/orgs/[slug]/page.tsx` + `prefetch.rs` |
| `/orgs/{slug}/members/{id}` | *(new)* | `app/orgs/[slug]/members/[id]/page.tsx` + `prefetch.rs` |
| `/admin` | `src/app/admin.rs:21` | `app/admin/page.tsx` + `app/admin/middleware.rs` |
| `/login` | `/admin/login` | `app/login/page.tsx` |
| `/signup` | `/admin/signup` | `app/signup/page.tsx` |
| root layout | `src/app.rs:37` `shell` | `app/layout.tsx` |

Auth and admin actions became JSON endpoints the React pages call, rather than form POSTs that
redirect: `/api/auth/{login,signup,logout,me}`, `/api/admin/{overview,competitions,invites}`,
`/api/orgs`, `/api/orgs/{slug}`, `/api/orgs/{slug}/members/{id}`, plus the untouched `/api/link`
and `/api/sync`. Login and signup moved off `/admin/*` so that `app/admin/middleware.rs` can guard
the entire `/admin` subtree without carving out exceptions for its own login page.

## Module-by-module outcome

| File | Outcome |
|---|---|
| `models.rs` | Kept. Models unchanged; `db(cx)` became `connect()`, the handle now an Axum `Extension`. |
| `scoring.rs` | Kept. `&Cx` → `&mut Db`; `WEEK_SECONDS` made public so the detail page can bucket by the same weeks. |
| `util.rs` | Kept as-is. |
| `seed.rs` | Kept as-is — already took `&mut Db`. |
| `auth.rs` | Rewritten. Mints its own session token, stores only the SHA-256, sets an `HttpOnly; SameSite=Lax` cookie. |
| `cors.rs` | Deleted — one `tower-http` `CorsLayer` in `main.rs`. |
| `styles.rs` | Deleted — the CSS now lives in `public/style.css`. |
| `ui.rs` | Deleted — `stat`/`leaderboard_table` are React; `fmt_int`/`fmt_num` are in `client/src/index.ts`. |
| `app.rs`, `app/**` | Deleted, replaced by the `app/` convention tree. |
| *(new)* `dto.rs` | Wire shapes + the reads behind them. Schema names are global in OpenAPI, so they live in one place; the leaderboard, the admin aggregate, and a member's own standing all derive from the same query and can't drift apart. |
| *(new)* `web.rs` | `ApiError` — one `{"error": "..."}` shape for every failure, with `From<toasty::Error>` mapping database faults to 500 without leaking detail. |

## Structured storage (no JSON columns)

`Competition` once held its nine scoring parameters as a `config_json` string. They are now nine
typed columns — `REAL` for the rates, `BIGINT` for the counts, `BOOLEAN` for the normalize flag —
so the rules are queryable (`WHERE per_impression > 0.005 AND normalize_by_followers = 1` is a real
query now) and a malformed value fails to load rather than silently reverting to defaults, which is
what `serde_json::from_str(..).unwrap_or_default()` used to do.

`scoring::ScoringConfig` survives as the API and compute shape, built by `from_competition()`.
`serde_json` is gone from the dependency list. An audit of the rest of the schema found no other
serialized blobs — `text_preview` is prose and the token columns are hashes.

The old `linkedin.db` predates this change and `push_schema()` cannot drop a column, so it was
moved to `server/.backup/linkedin.db.pre-typed-config` and recreated.

## Login-first access model

Nothing is public. `app/middleware.rs` is a root guard that redirects anonymous page loads to
`/login` and answers anonymous API calls with 401, with a small allow-list: the sign-in surfaces
(`/login`, `/join`, `/signup`), `/api/auth/*`, the extension protocol (`/api/link`, `/api/sync`,
which carry bearer tokens rather than cookies), and static assets. `app/admin/middleware.rs`
narrows `/admin` to `is_admin`.

Two things had to change for this to actually work:

- **Login now looks members up by email.** It previously matched a synthetic `admin:<email>`
  LinkedIn URN, which only admins had — participants could never sign in. That also meant the same
  address could register twice, once through `/signup` (`admin:` prefix) and once through `/join`
  (`pending:` prefix), because each checked a different key. `auth::member_by_email` is now the
  single lookup for login and for both uniqueness checks.
- **The extension pairs with the sync token, not the invite code.** Invites are consumed by web
  join, so by the time the extension runs the code is spent. `/api/link` is bearer-authenticated
  and now only binds a LinkedIn identity onto an existing account — it never creates one. The
  extension's `linkInvite` became `linkIdentity`, and the popup asks for the token.

## Gotchas hit during the port

Four things cost real time and aren't in the porting guide:

- **`--adopt` omits `emit_seeds` from `build.rs`.** The scaffold ships no prefetch example, so its
  `build.rs` only calls `emit_registry` and `bundle_pages`. Any `prefetch.rs` then fails with
  `couldn't read .../nextrs_seeds.rs`. Add
  `nextrs::build::emit_seeds("app", "nextrs_seeds.rs")` — see this repo's `build.rs`.
- **Seed eligibility is a *textual* match on the return type.** `emit_seeds` scans for
  `Json<...>` or `Result<Json<...>, E>` in the signature, so a type alias hides it: our
  `ApiResult<Json<Leaderboard>>` produced an empty seeds file and a confusing "cannot find
  function" error. The three seeded GETs spell out `Result<Json<T>, ApiError>` for that reason.
- **Seed companions are named from the URL, not the `operation_id`.** `/api/orgs/{slug}` yields
  `get_api_orgs_by_slug`, and a multi-segment path takes its params as a **tuple**:
  `get_api_orgs_by_slug_members_by_id((slug, id), req.extensions())`.
- **`#[serde(default)]` makes every field optional in the generated TypeScript.** `ScoringConfig`
  came out with all-optional fields, so `cfg.perReaction` was `number | undefined` at every call
  site. The server always serializes them, so the fix is `#[schema(required)]` on each field —
  the schema was lying, not the TypeScript.

Also worth knowing: `npm run gen` cleans `client/src/generated/`, which deletes the `index.ts`
barrel that `cargo build` writes. Run `npm run gen` **then** `cargo build`; the reverse order
leaves `@server/client` exporting nothing and `tsc` reporting every hook as missing.

## Wiring notes (things the scaffold decided for us)

**Dependencies** (as merged — `toasty` kept, `topcoat` gone):

```toml
[[bin]]
name = "linkedin-challenge-server"
path = "src/main.rs"

[[bin]]
name = "index"          # Vercel function entry (api/index.rs)
path = "api/index.rs"

[build-dependencies]
nextrs = { git = "https://github.com/drewhirschi/nextrs.git", rev = "6a3356b", features = ["build", "tsx"] }

[dependencies]
nextrs = { git = "https://github.com/drewhirschi/nextrs.git", rev = "6a3356b", features = ["vercel"] }
axum = "0.8"
dotenvy = "0.15"
tokio = { version = "1", features = ["full"] }
tower = "0.5"
vercel_runtime = { version = "2", features = ["axum"] }
http = "1"
serde = { version = "1", features = ["derive"] }
tower-livereload = "0.9"
utoipa = "5"
```

Pinned to nextrs 0.5.0 (`6a3356b`, the rev that added external JS client publishing). If scaffolding
again with `--nextrs-path` against a local checkout, note it wants the crate directory
`../nextrs/crates/nextrs`, **not** the workspace root.

**First-build order matters.** `client/src/index.ts` re-exports `./generated`, which does not exist
until orval creates it — so a plain `cargo build` on a fresh scaffold fails with
`UNRESOLVED_IMPORT: Could not resolve './generated'`. The `gen` script breaks the cycle by building
with `NEXTRS_SKIP_BUNDLE=1`. Run these in order, once:

```bash
cd client && npm install     # bundler resolves bare imports from client/node_modules
npm run gen                  # dump-openapi (bundle skipped) → orval → client/src/generated
cd .. && cargo build         # now the bundle resolves
```

Verified working against the local nextrs checkout on a throwaway scaffold.

**Dev loop:** `cargo dev` (aliased in the generated `.cargo/config.toml`). Install the runner once
with `cargo install --path ../../nextrs/crates/cargo-nextrs-dev --force`.

**Client package:** `client/` is a real npm package. Every bare import our `.tsx` files use must be
in `client/package.json` — the bundler errors on unresolved ones rather than shipping a broken
bundle, and it names the missing specifiers.

**Typed client:** annotate `route.rs` handlers with `#[nextrs::api]`, then `cd client && npm run gen`
to regenerate React Query hooks from the OpenAPI doc. Don't hand-write API types, and don't edit
`client/src/generated/**`, `client/openapi.json`, or `public/dist/` — all regenerated.

**Server data:** a `prefetch.rs` next to a `page.tsx` seeds the React Query cache server-side, so
pages render with data already in place. It requires a `page.tsx` sibling — next to a Rust page it's
a compile error. Build keys with `nextrs::seed_key` so they match the generated client's query keys.

## The extension uses the generated client

Done. `cargo nextrs client generate` (from `cargo-nextrs`) refreshes the Rust contract, regenerates
the React Query hooks, and publishes a React-free client into `extension/generated/nextrs-client/`
— configured by `server/client/nextrs.client.json`. The extension imports `linkIdentity` and
`pushSync` from it instead of hand-writing `fetch`, so a field rename in `route.rs` surfaces at the
call site rather than at runtime.

Two things made it fit:

- **Per-request auth already works.** Every generated function takes an optional `RequestInit` that
  is spread into the `fetch`, so the bearer sync token goes in per call from `chrome.storage`.
- **Status codes stay reachable.** The client returns `{ data, status, headers }` and does not
  throw on non-2xx, so `sync.js` keeps mapping 401 and 409 to messages a person can act on.

The one gap remains **the base URL is fixed at generation time**. Each install points at a
different server and the popup can change it, so we generate with `"baseUrl": ""` and `api.js`
resolves the resulting root-relative `/api/...` paths against the configured server. The rewrite is
deliberately narrow — only string URLs starting with `/api/` — so the absolute LinkedIn Voyager
URLs in `linkedin.js` pass through untouched. A `setBaseUrl()` on the generated client would remove
the need for the shim entirely.

Verified by running the real generated client against a live server: login, createInvites,
joinWithInvite, linkIdentity, pushSync, plus the 401 and 409 paths — 13 checks, all passing.

## Signing into the extension

The popup takes the challenge account's email and password rather than a pasted sync token.
`POST /api/auth/device` verifies the credentials and returns a freshly issued token; the extension
stores the token and never the password. Issuing rotates `api_token_hash`, so linking a browser
un-links any previous one — the single-device model the popup's "Unlink this device" already
implied.

This also closed a hole: `/signup` discards the token secret it generates, so before this the admin
who created an org had no way to sync their own data without redeeming an invite under a second
email address. 15 checks cover it, including founder → signup → sign in → link → sync.

Two bugs fell out of trying it for real:

- **`await import()` in the service worker.** `background.js` dynamically imported `linkedin.js`
  and `storage.js` inside the message handler; MV3 forbids dynamic import on
  `ServiceWorkerGlobalScope`. Both modules were already imported statically at the top, so the fix
  was to name the extra bindings there and delete the dynamic calls.
- **The server could only ever start once per database.** `connect()` called `push_schema()`
  unconditionally, and Toasty issues plain `CREATE TABLE` — no create-if-missing, and the only
  alternative (`reset_db()`) drops everything. A second start against the same file died with
  "table competitions already exists". `connect()` now probes for an existing table and pushes only
  when the database is empty.
