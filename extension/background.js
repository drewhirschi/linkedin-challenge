// MV3 service worker: schedules periodic scrapes, runs them, and answers popup messages.
import { SYNC_CHECK_MINUTES, SYNC_JITTER_MINUTES, MIN_SYNC_INTERVAL_MINUTES } from "./config.js";
import { getState, setState, isLinked } from "./storage.js";
import { collectSnapshot, getMe, getPostFeed, getPostComments, getFollowerCount, diagnose, isLinkedInSignedIn } from "./linkedin.js";
import { isAppSignedIn, linkIdentityToAccount, pushSnapshot, signInFromSession } from "./sync.js";
import { SERVER_URL, LINKEDIN_ORIGIN } from "./config.js";

const ALARM = "challenge-sync";

// Convenience for the *service worker* console (chrome://extensions -> "service worker"), where
// `chrome.runtime` exists but module bindings don't: `await diagnose()`.
globalThis.diagnose = diagnose;
// The collectors, for the e2e check (scripts/test-extension-e2e.mjs), which drives this worker
// over DevTools — a service worker can't dynamic-import, so they must be reachable by name.
globalThis.collectors = { getMe, getPostFeed, getPostComments, getFollowerCount, collectSnapshot };

// Arm the check alarm. It fires every SYNC_CHECK_MINUTES; runSync() decides whether enough time
// has passed. The first check comes a minute after install or browser start, so a laptop that
// has been closed for two days syncs as soon as it is back rather than at the next clock mark.
async function scheduleSync() {
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: SYNC_CHECK_MINUTES });
}

chrome.runtime.onInstalled.addListener(scheduleSync);
chrome.runtime.onStartup.addListener(scheduleSync);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runSync().catch(() => {});
});

/** Milliseconds until the next AUTOMATIC sync is due; 0 when it's due now. */
export async function msUntilSyncAllowed() {
  const { lastSyncAt, syncJitterMinutes } = await getState();
  if (!lastSyncAt) return 0;
  // A per-install offset, fixed at first sync, so a fleet of laptops spreads its syncs out.
  const jitter = typeof syncJitterMinutes === "number" ? syncJitterMinutes : 0;
  const elapsed = Date.now() - new Date(lastSyncAt).getTime();
  return Math.max(0, (MIN_SYNC_INTERVAL_MINUTES + jitter) * 60_000 - elapsed);
}

// The core scrape+upload cycle. Records status/errors for the popup either way.
//
// `manual` skips the twice-a-day floor. That floor exists to keep *background* traffic polite —
// unattended alarm firings are what could hammer LinkedIn. A person clicking "Sync now" is
// deliberate, attended, and self-limiting, so refusing them serves nobody.
async function runSync({ manual = false } = {}) {
  if (!(await isLinked())) return { ok: false, error: "Not linked." };

  if (!manual) {
    const wait = await msUntilSyncAllowed();
    if (wait > 0) return { ok: false, tooSoon: true, retryInMs: wait };
  }

  try {
    const snap = await collectSnapshot();
    const payload = {
      capturedAt: new Date().toISOString(),
      profile: snap.profile,
      posts: snap.posts,
      excludedPostUrns: snap.excludedPostUrns,
      postFeedComplete: snap.postFeedComplete,
    };
    const result = await pushSnapshot(payload);
    const { syncJitterMinutes } = await getState();
    await setState({
      lastSyncAt: new Date().toISOString(),
      lastError: null,
      lastPostsIngested: result.postsIngested ?? snap.posts.length,
      syncJitterMinutes:
        typeof syncJitterMinutes === "number"
          ? syncJitterMinutes
          : Math.round(Math.random() * SYNC_JITTER_MINUTES),
    });
    return { ok: true, postsIngested: result.postsIngested ?? snap.posts.length };
  } catch (err) {
    const message = friendlyError(err);
    await setState({ lastError: message });
    return { ok: false, error: message };
  }
}

function friendlyError(err) {
  const m = String(err && err.message ? err.message : err);
  if (m === "NOT_LOGGED_IN") return "You're not logged into LinkedIn in this browser.";
  return m;
}

// --- popup message API -----------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "GET_STATE":
          sendResponse({ ok: true, state: await getState() });
          break;
        case "LINK": {
          // Reuse the website session rather than asking for a password again. No session means
          // the user simply isn't signed in yet — open the site and let them.
          if (!(await isLinkedInSignedIn())) {
            await chrome.tabs.create({ url: LINKEDIN_ORIGIN });
            sendResponse({ ok: false, needsLinkedIn: true });
            break;
          }
          const account = await signInFromSession();
          if (!account) {
            await chrome.tabs.create({ url: `${SERVER_URL}/auth/login` });
            sendResponse({ ok: false, needsSignIn: true });
            break;
          }
          // Then read the identity from the live LinkedIn session and bind it to that account.
          const me = await getMe();
          if (!me.memberUrn) throw new Error("Couldn't read your LinkedIn profile. Open LinkedIn and log in first.");
          const data = await linkIdentityToAccount(account.syncToken, {
            memberUrn: me.memberUrn,
            publicIdentifier: me.publicIdentifier,
            firstName: me.firstName,
            lastName: me.lastName,
            profileUrl: me.profileUrl,
          });
          await scheduleSync();
          // Kick off a first sync right away so the user sees data immediately.
          runSync({ manual: true }).catch(() => {});
          sendResponse({ ok: true, data });
          break;
        }
        case "PREFLIGHT": {
          // Both sessions are required, and they fail for different reasons with different fixes,
          // so report them separately rather than as one "not ready".
          const [app, linkedIn] = await Promise.all([isAppSignedIn(), isLinkedInSignedIn()]);
          sendResponse({ ok: true, appSignedIn: app, linkedInSignedIn: linkedIn, serverUrl: SERVER_URL });
          break;
        }
        case "OPEN_LINKEDIN":
          await chrome.tabs.create({ url: LINKEDIN_ORIGIN });
          sendResponse({ ok: true });
          break;
        case "SYNC_DUE_IN":
          sendResponse({ ok: true, ms: await msUntilSyncAllowed() });
          break;
        case "DIAGNOSE": {
          // Structure only — safe to share. See linkedin.js `diagnose()`.
          const report = await diagnose();
          console.log("[challenge-sync] voyager shape:", JSON.stringify(report, null, 2));
          sendResponse({ ok: true, report });
          break;
        }
        case "OPEN_SIGN_IN":
          await chrome.tabs.create({ url: `${SERVER_URL}/auth/login` });
          sendResponse({ ok: true });
          break;
        case "OPEN_DASHBOARD":
          await chrome.tabs.create({ url: `${SERVER_URL}/me` });
          sendResponse({ ok: true });
          break;
        case "SYNC_NOW":
          sendResponse(await runSync({ manual: true }));
          break;
        default:
          sendResponse({ ok: false, error: "Unknown message." });
      }
    } catch (err) {
      sendResponse({ ok: false, error: friendlyError(err) });
    }
  })();
  return true; // async response
});
