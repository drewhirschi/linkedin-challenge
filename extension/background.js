// MV3 service worker: schedules periodic scrapes, runs them, and answers popup messages.
import { SYNC_PERIOD_MINUTES, SYNC_JITTER_MINUTES, MIN_SYNC_INTERVAL_MINUTES } from "./config.js";
import { getState, setState, isLinked, clearLink } from "./storage.js";
import { collectSnapshot, getMe, diagnose } from "./linkedin.js";
import { linkIdentityToAccount, pushSnapshot, signInFromSession } from "./sync.js";
import { SERVER_URL } from "./config.js";

const ALARM = "challenge-sync";

// (Re)arm the periodic alarm with a little jitter so installs don't sync in lockstep.
async function scheduleSync() {
  const jitter = (Math.random() * 2 - 1) * SYNC_JITTER_MINUTES; // +/- jitter
  const periodInMinutes = Math.max(30, SYNC_PERIOD_MINUTES);
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, {
    delayInMinutes: Math.max(1, periodInMinutes + jitter),
    periodInMinutes,
  });
}

chrome.runtime.onInstalled.addListener(scheduleSync);
chrome.runtime.onStartup.addListener(scheduleSync);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runSync().catch(() => {});
});

/** Milliseconds until another sync is allowed; 0 when one is due now. */
export async function msUntilSyncAllowed() {
  const { lastSyncAt } = await getState();
  if (!lastSyncAt) return 0;
  const elapsed = Date.now() - new Date(lastSyncAt).getTime();
  return Math.max(0, MIN_SYNC_INTERVAL_MINUTES * 60_000 - elapsed);
}

// The core scrape+upload cycle. Records status/errors for the popup either way.
//
// `force` only bypasses the schedule, never the floor: we hit LinkedIn on the user's own session,
// so the rate limit is an etiquette guarantee, not a preference.
async function runSync() {
  if (!(await isLinked())) return { ok: false, error: "Not linked." };

  const wait = await msUntilSyncAllowed();
  if (wait > 0) {
    const hours = Math.ceil(wait / 3_600_000);
    return { ok: false, tooSoon: true, retryInMs: wait,
             error: `Already synced recently — next sync in about ${hours}h.` };
  }

  try {
    const snap = await collectSnapshot();
    const payload = {
      capturedAt: new Date().toISOString(),
      profile: snap.profile,
      posts: snap.posts,
    };
    const result = await pushSnapshot(payload);
    await setState({
      lastSyncAt: new Date().toISOString(),
      lastError: null,
      lastPostsIngested: result.postsIngested ?? snap.posts.length,
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
          const account = await signInFromSession();
          if (!account) {
            await chrome.tabs.create({ url: `${SERVER_URL}/login` });
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
          runSync().catch(() => {});
          sendResponse({ ok: true, data });
          break;
        }
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
          await chrome.tabs.create({ url: `${SERVER_URL}/login` });
          sendResponse({ ok: true });
          break;
        case "SYNC_NOW":
          sendResponse(await runSync());
          break;
        case "UNLINK": {
          await clearLink();
          await chrome.alarms.clear(ALARM);
          sendResponse({ ok: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message." });
      }
    } catch (err) {
      sendResponse({ ok: false, error: friendlyError(err) });
    }
  })();
  return true; // async response
});
