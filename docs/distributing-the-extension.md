# Distributing the Chrome extension

Three ways to get the extension onto someone's machine, in increasing order of effort. You do **not**
have to publish publicly, and for an internal company challenge you probably shouldn't.

| Route | Who can install | Effort | Auto-updates |
|---|---|---|---|
| **Load unpacked** | anyone you send a folder to | none | no |
| **Unlisted Web Store item** | anyone with the link | $5 once, ~1–3 day review | yes |
| **Public Web Store listing** | anyone searching | same, stricter review | yes |

## Build first, always

```sh
cd extension
./build.sh https://challenge.example.com          # -> dist/challenge-sync-0.1.0.zip
./build.sh http://localhost:3312 --dir            # -> dist/unpacked/ for development
```

The server URL is a build-time constant reflected in `SERVER_URL` in `config.js`, plus
`host_permissions` and `homepage_url` in `manifest.json`. The extension reads the
site's session cookie, and Chrome only permits that for an origin the manifest declares — so a build
with one updated and not the other fails at **Connect** with no useful message. `build.sh` writes
all three from a single argument and then verifies they match, which is the whole reason it exists.

It also refuses a plain-`http` URL that isn't localhost: the sync token is a bearer credential and
would otherwise travel in clear text.

## Route 1 — load unpacked (development, or a handful of colleagues)

```sh
./build.sh https://challenge.example.com --dir
```

Send them `extension/dist/unpacked/` (zip it yourself), then:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select the folder.

Good enough for a pilot. The costs: Chrome nags about developer-mode extensions on every restart,
there are no updates (you re-send the folder), and the extension ID changes each time it's loaded
from a new path, so anything keyed to the ID resets.

## Route 2 — unlisted Web Store item (recommended for a company challenge)

Unlisted means it doesn't appear in search and isn't browsable — only people with the link can
install it — but you still get one-click installation and automatic updates. This is the sweet spot
for an internal tool.

**One-time:**

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   and sign in with the Google account that should own it. Use a **role account** if this belongs to
   a company — transferring an item between accounts is painful.
2. Pay the **one-time $5 registration fee**.
3. If the account is a Google Workspace account, an admin may need to allow developer registration.

**Per release:**

1. `./build.sh https://challenge.example.com` → `dist/challenge-sync-<version>.zip`.
2. Dashboard → **Add new item** → upload the zip.
3. Fill in the listing. Required: name, a short description, a detailed description, a category, a
   **128×128 icon**, and at least one **1280×800 or 640×400 screenshot**. A privacy policy URL is
   required because this extension handles personal data.
4. Set **Visibility → Unlisted**.
5. Complete the **Privacy practices** tab — see below, this is where reviews stall.
6. Submit. Review is typically one to three days; extensions requesting broad host permissions can
   take longer.

Share the resulting item URL with participants. Updates: bump `version` in `manifest.json`, rebuild,
upload, submit. Installed copies update themselves within a few hours.

## What the privacy review will ask, and the honest answers

This is where a submission gets rejected or delayed, and the answers matter because they must match
what the code does. They do here — the extension was built this way deliberately.

**Single purpose.** "Syncs the signed-in user's own LinkedIn post analytics to their company's
posting-challenge leaderboard." One purpose, which is what the policy requires.

**Why each permission:**

| Permission | Justification |
|---|---|
| `storage` | Stores the sync token and last-sync status. No credentials. |
| `alarms` | Schedules the twice-daily background sync. |
| `cookies` | Reads the *challenge server's* session cookie to link the browser without a second sign-in, and LinkedIn's `JSESSIONID` to derive the CSRF token LinkedIn's own API requires. |
| `host_permissions: linkedin.com` | Reads the user's own profile and post analytics from LinkedIn's internal API using the session already open in their browser. |
| `host_permissions: <your server>` | Uploads that data to the challenge server. |

**Remote code:** none. Everything ships in the package; nothing is `eval`'d or fetched as code.

**Data use disclosure:** it collects *personally identifiable information* (name, LinkedIn profile)
and *website content* (the user's own posts and their analytics). Declare that it is transmitted to
a third party — your server — and is **not** sold, not used for creditworthiness, and not used for
purposes unrelated to the single purpose.

You must certify the extension does not collect passwords. It doesn't: it reads LinkedIn data
through the session cookie already in the browser and never sees a LinkedIn credential. The only
secret it stores is your server's sync token.

**The likeliest rejection reason** is the breadth of `linkedin.com` host access combined with
personal-data collection. Pre-empt it in the justification field: state that it reads only the
signed-in user's *own* data, only on a schedule of twice a day, and never writes to LinkedIn —
no posting, liking, or messaging.

## Route 3 — public listing

Identical mechanics, visibility **Public**. Only worth it if you want strangers to find it, and it
draws stricter review. For a company challenge, unlisted is a better fit.

## Enterprise force-install (worth knowing)

If your company uses Google Workspace, an admin can force-install the extension for a whole
organisational unit via **Admin console → Devices → Chrome → Apps & extensions**, using the Web
Store item ID or a self-hosted `update.xml`. Nobody has to install anything by hand, and it works
with an unlisted item. This is usually the right answer for a company-wide rollout.

## Before you distribute anything

- **Settle the server URL first.** It is baked into every installed copy. Changing it later means
  shipping an update and waiting for every user to receive it. Get a custom domain before you
  publish — do not ship a `*.vercel.app` hostname.
- **Bump `version` in `manifest.json` for every upload.** The Web Store rejects a re-used version.
- **Never ship a localhost build.** `build.sh` warns, but nothing stops you zipping the folder by
  hand.
- **Icons.** The repo ships a single `icons/icon.png` used at 16/48/128. The store additionally
  wants a proper 128×128 for the listing itself.
