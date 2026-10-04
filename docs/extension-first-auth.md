# Extension-first auth (proposal)

Status: idea, not started. Raised 2026-09-24.

## The idea

Drop the website login. Installing the extension is how you join: it creates your account from
your LinkedIn identity and signs you in, and the website is reached through the extension. No
email, no password.

## How it works today

The root of trust is the website's email and password login. The extension borrows it:
`extension/sync.js` reads the site's session cookie and exchanges it for a per-device sync token
(`signInDeviceWithSession`). `POST /api/link` then fills in the LinkedIn identity of an account
that already exists; it never creates accounts.

The proposal inverts this. LinkedIn identity, as seen by the extension, becomes the root, and the
website session is minted from the extension's token.

## Problems to solve

**The server cannot verify who the extension says you are.** The extension knows the member's
LinkedIn id, but anything it sends is a claim. A scripted request could claim to be another
member and take over their account and points.

Sending LinkedIn cookies (`li_at`) to our server so it can check with LinkedIn is **ruled out**.
Those cookies are full access to the person's LinkedIn account, so we would be storing everyone's
LinkedIn keys, and it violates LinkedIn's terms. Identity needs a different proof.

**It reopens signup.** If installing the extension creates an account, anyone with LinkedIn gets
in. The enzo.health domain gate (#3) checks email, and there would be no email left to check.

## Proposed shape

- **Admission by invite link.** An admin sends a link; the person installs the extension from it;
  the extension creates the account from that single-use invite plus their LinkedIn identity. No
  link, no account. This replaces the domain gate. Invite codes already exist.
- **Identity bound once.** Redeeming the invite binds the LinkedIn member id to the new account.
  A later claim to the same member id is refused, not treated as a login.
- **Website opened from the extension.** A popup button such as "View leaderboard" opens the site
  already signed in, using a session minted from the device token. No login page.
- **Second device.** Installing on another machine is the same unverifiable claim again. It needs
  approval from an existing device, or a fresh invite from an admin.

## Tradeoffs

- The extension becomes the only way in. Phone-only users, or anyone on a laptop that blocks
  extensions, cannot see the board at all.
- Account recovery depends on admins issuing invites, since there is no email to reset through.

## Open decisions

1. Are single-use invite links the right admission gate, or should a domain check survive in
   some form (for example, one email verification at join time)?
2. How does a second device get approved?

## Scope

Medium. Touches signup and invite redemption, `/api/link`, website session minting, and the
extension popup. Best done after the in-flight work: the deploy-time migrate step (#8),
distinct-commenter scoring, and the repost scoring fix.
