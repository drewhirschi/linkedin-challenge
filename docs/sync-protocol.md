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
      },
      "comments": [                 // who commented; [] means "didn't read them", not "none"
        {
          "urn": "urn:li:comment:(urn:li:activity:7231000000000000000,7231000000000000001)",
          "commenterUrn": "urn:li:fsd_profile:ACoAAB...",
          "commenterName": "Sam Example",
          "createdAt": "2026-08-02T10:00:00Z",
          "isReply": false          // true inside a thread (a reply to a comment)
        }
      ]
    }
  ]
}
```

Comments are read from the server-rendered post page (`/feed/update/urn:li:activity:{id}/`) —
every Voyager comments endpoint answers 400/404 now. Each rendered comment carries its URN, the
commenter's profile link, and a label naming them, so `commenterUrn` is a
`urn:li:publicIdentifier:…` and `createdAt` is null. The page renders only the first several
comments, so the list is a sample, never a count. The server stores each comment once by URN and
marks `isSelf` when the commenter matches the post's author by URN id or public identifier.
Scoring uses LinkedIn's `metrics.comments` total minus the author's own comments seen.

The follower count comes from `GET /voyager/api/feed/dash/followingStates?ids=List(urn:li:fsd_followingState:urn:li:fsd_profile:{id})`,
keyed by the member's own profile id. The post feed's `FollowingInfo` entities belong to *other*
actors on the page and must never be used for it. `just test-extension-e2e` proves both against
a live session.

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

Followers are collected from `feed/dash/followingStates` keyed by the `fsd_followingState` URN
(the bare `fsd_profile` form answers 400, which is why this was once thought dead). Profile views
are **not currently collected**: `networkinfo`, `profileView`, and `wvmpCards` answer 410.
