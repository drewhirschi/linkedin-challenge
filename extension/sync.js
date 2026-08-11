// Talks to OUR server through the generated nextrs client (see api.js). Bearer-token auth; no
// cookies involved.
//
// The request and response shapes come from the Rust routes via OpenAPI, so a field rename on the
// server surfaces here as a type error in an editor rather than as a silent runtime failure. What
// stays hand-written is the part that is genuinely ours: turning status codes into messages a
// person can act on.
import { getState, setState } from "./storage.js";
import { SERVER_URL, SESSION_COOKIE } from "./config.js";
import { bearer, installApiBaseUrl, linkIdentity, pushSync, signInDeviceWithSession } from "./api.js";

installApiBaseUrl();

/** Whether the browser holds a challenge-app session for the configured server. */
export async function isAppSignedIn() {
  return Boolean(await readSessionCookie());
}

/** The website session cookie for our server, or null when the user isn't signed in there. */
export async function readSessionCookie() {
  const cookie = await chrome.cookies.get({ url: SERVER_URL, name: SESSION_COOKIE });
  return cookie?.value || null;
}

// Exchange the website session for this device's sync token — no second sign-in.
//
// Issuing rotates the token, so linking here un-links any other browser. That is the same
// single-device model the "Unlink this device" button already implies.
//
// Returns null when there is no usable session, so callers can send the user to the site to sign
// in rather than surfacing an error.
export async function signInFromSession() {
  const sessionToken = await readSessionCookie();
  if (!sessionToken) return null;

  const res = await signInDeviceWithSession({ sessionToken });
  if (res.status === 401) return null; // stale or expired cookie — same remedy as having none
  if (res.status !== 200) throw new Error(`Server error (${res.status}).`);
  return res.data;
}

// Bind this browser's LinkedIn identity to the account the sync token belongs to.
export async function linkIdentityToAccount(syncToken, member) {
  const token = syncToken.trim();
  const res = await linkIdentity({ member }, bearer(token));

  if (res.status === 401) throw new Error("That sync token wasn't recognized.");
  if (res.status === 409) {
    throw new Error("This LinkedIn account is already linked to someone else.");
  }
  if (res.status !== 200) throw new Error(`Server error (${res.status}).`);

  await setState({
    syncToken: token,
    orgName: res.data.orgName,
    displayName: res.data.displayName,
    memberUrn: member.memberUrn,
    publicIdentifier: member.publicIdentifier,
    lastError: null,
  });
  return res.data;
}

// Upload a snapshot batch. Returns the server's response.
//
// A 401 here is routine rather than exceptional: the token rotates whenever the account connects
// from anywhere else, and in development the server's database gets rebuilt out from under it. So
// we re-exchange the website session once and retry, and only surface an error if that fails too.
// Telling a user to "re-link" for something we can fix silently is just making them do our work.
export async function pushSnapshot(payload) {
  const { syncToken } = await getState();
  if (!syncToken) throw new Error("Not linked yet.");

  let res = await pushSync(payload, bearer(syncToken));

  if (res.status === 401) {
    const account = await signInFromSession();
    if (!account) {
      throw new Error(
        "Your link expired. Open the challenge site, sign in, then press Connect.",
      );
    }
    await setState({
      syncToken: account.syncToken,
      orgName: account.orgName,
      displayName: account.displayName,
    });
    res = await pushSync(payload, bearer(account.syncToken)); // once only — no retry loop
    if (res.status === 401) {
      throw new Error("Signed in, but the server rejected the new token. Press Connect.");
    }
  }

  if (res.status !== 200) throw new Error(`Server error (${res.status}).`);
  return res.data;
}
