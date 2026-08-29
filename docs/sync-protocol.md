# Sync protocol — extension ⇄ server

The contract both the extension and the server implement. JSON over HTTPS. All timestamps ISO-8601
UTC. Follower-only/author-only metrics may be `null` when unavailable.

## 1. Link (redeem invite, get sync token)

The extension first reads the member's own LinkedIn identity, then redeems the invite. This binds
the install to a real `User` at link time.

```
POST /api/link
Content-Type: application/json

{
  "inviteCode": "AB12-CD34",
  "member": {
    "memberUrn": "urn:li:fsd_profile:ACoAAB...",   // stable per LinkedIn account
    "publicIdentifier": "drew-example",
    "firstName": "Drew",
    "lastName": "Example",
    "profileUrl": "https://www.linkedin.com/in/drew-example/"
  }
}
```

Response `200`:

```
{
  "syncToken": "st_9f2c...",     // bearer token, store in extension, used for all /api/sync
  "orgName": "Acme Inc",
  "displayName": "Drew Example"
}
```

Errors: `404` unknown/expired/used invite code; `409` this member already linked in the org
(returns the existing token so re-linking is idempotent).

## 2. Sync (upload a snapshot batch)

```
POST /api/sync
Authorization: Bearer st_9f2c...
Content-Type: application/json

{
  "capturedAt": "2026-08-08T12:00:00Z",
  "profile": {
    "followerCount": 1234,
    "profileViews": 56              // author-only; null if not collected this run
  },
  "postFeedComplete": true,          // safe to reconcile deleted posts only when page is under-full
  "posts": [
    {
      "urn": "urn:li:activity:7231000000000000000",
      "permalink": "https://www.linkedin.com/feed/update/urn:li:activity:7231000000000000000/",
      "createdAt": "2026-08-01T09:00:00Z",
      "textPreview": "We just shipped ...",   // <= 10,000 Unicode characters
      "imageUrls": ["https://media.licdn.com/..."], // attached images; empty when none
      "metrics": {
        "impressions": 3400,        // author-only; null if unavailable
        "reactions": 45,
        "comments": 12,
        "reposts": 3
      }
    }
  ]
}
```

Response `200`:

```
{ "ok": true, "postsIngested": 1, "nextSyncAfterSeconds": 21600 }
```

Errors: `401` bad/expired token.

## Server-side handling

- The server records `capturedAt` from the client but also stamps its own `receivedAt` and uses the
  server clock for windowing decisions (clients can lie / be skewed).
- Each sync writes one `ProfileSnapshot` and one `PostSnapshot` per post (append-only, time series).
- `Post` rows are upserted by `(user, urn)`; snapshots are always inserted.
- Scores are computed from snapshots at read time — the ingest never computes score.


## Validation targets

Real values from one account (2026-08-09), for checking the scrapers produce sane numbers rather
than plausible-looking ones:

| Metric | Actual | Where the user sees it |
|---|---|---|
| Followers | 945 | Profile → followers, under activity |
| Profile views | 672 | Analytics |
| Post impressions (all posts) | 19,833 | Analytics |
| Search appearances | 53 | Analytics |

Followers and profile views are **not currently collected** — the Voyager REST endpoints that used
to expose them (`networkinfo`, `profileView`, `wvmpCards`, `feed/dash/followingStates`) now answer
410 or 400, and a recursive search of the profile responses finds no follower-shaped number at any
depth. They will need either GraphQL or a DOM read of the analytics page.
