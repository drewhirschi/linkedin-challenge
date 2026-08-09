// Thin wrapper over chrome.storage.local for the extension's own config + status.
// NOTE: we never store LinkedIn credentials here. The only secret is the sync token
// for OUR server. LinkedIn auth stays in the browser's own cookie jar.
const DEFAULTS = {
  syncToken: null,       // set after linking; presence => "linked"
  orgName: null,
  displayName: null,
  memberUrn: null,
  publicIdentifier: null,
  lastSyncAt: null,      // ISO timestamp of last successful sync
  lastError: null,       // human-readable last error, or null
  lastPostsIngested: 0,
};

export async function getState() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function setState(patch) {
  await chrome.storage.local.set(patch);
  return getState();
}

export async function isLinked() {
  const { syncToken } = await getState();
  return Boolean(syncToken);
}

export async function clearLink() {
  await chrome.storage.local.set({
    syncToken: null,
    orgName: null,
    displayName: null,
    lastSyncAt: null,
    lastError: null,
    lastPostsIngested: 0,
  });
}
