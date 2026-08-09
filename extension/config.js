// The challenge server this build talks to. Deliberately a build-time constant with no UI to
// change it: the extension reads the site's session cookie, which requires a matching entry in
// `host_permissions` in manifest.json, and that cannot be edited at runtime either.
//
// Producing a production build means changing BOTH this constant and the manifest's
// `host_permissions` to the deployed origin.
export const SERVER_URL = "http://localhost:3312";

/// Name of the session cookie the website sets — see `SESSION_COOKIE` in server/src/auth.rs.
export const SESSION_COOKIE = "session";

// How often to scrape, in minutes — twice a day. LinkedIn etiquette: keep this low.
export const SYNC_PERIOD_MINUTES = 12 * 60;

// Hard floor between two syncs, enforced in code rather than left to the alarm. Chrome can fire an
// alarm early after a wake-from-sleep or a worker restart, and "Sync now" is a button a person can
// hold down — without a floor, either one turns "twice a day" into a suggestion. Slightly under
// 12h so a run that drifts a few minutes late doesn't push the next one past its slot.
export const MIN_SYNC_INTERVAL_MINUTES = 11 * 60 + 30;

// Random jitter (minutes) added to each scheduled run so many installs don't sync in lockstep.
export const SYNC_JITTER_MINUTES = 45;

// Max posts to pull per sync (most recent first). Competitions only grade a few/week anyway.
export const MAX_POSTS = 30;

// Polite delay between sequential LinkedIn requests (ms).
export const REQUEST_DELAY_MS = 1200;

export const LINKEDIN_ORIGIN = "https://www.linkedin.com";
