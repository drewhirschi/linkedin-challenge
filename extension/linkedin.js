// LinkedIn data collection — the ONE fragile module.
//
// Everything that depends on LinkedIn's undocumented internal ("Voyager") API lives here so a
// LinkedIn change is a single-file fix. All calls run inside the user's own browser session:
// cookies (li_at, JSESSIONID) are attached automatically by Chrome, so we read the user's own
// identity + author-only analytics without ever touching their password.
//
// See docs/linkedin-scraping.md for endpoint research and rationale. Endpoints are best-effort:
// each collector returns whatever it can and degrades to null rather than throwing.
import { LINKEDIN_ORIGIN, REQUEST_DELAY_MS, MAX_POSTS } from "./config.js";

const VOYAGER = `${LINKEDIN_ORIGIN}/voyager/api`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- auth -----------------------------------------------------------------

// The CSRF token Voyager requires is just the JSESSIONID cookie value, quotes stripped.
async function csrfToken() {
  const cookie = await chrome.cookies.get({ url: LINKEDIN_ORIGIN, name: "JSESSIONID" });
  if (!cookie || !cookie.value) {
    throw new Error("NOT_LOGGED_IN"); // no LinkedIn session in this browser
  }
  return cookie.value.replace(/"/g, "");
}

async function voyagerFetch(path) {
  const token = await csrfToken();
  const res = await fetch(`${VOYAGER}${path}`, {
    method: "GET",
    credentials: "include", // send LinkedIn cookies
    headers: {
      "csrf-token": token,
      "x-restli-protocol-version": "2.0.0",
      "x-li-lang": "en_US",
      accept: "application/vnd.linkedin.normalized+json+2.1",
    },
  });
  if (res.status === 401 || res.status === 403) throw new Error("NOT_LOGGED_IN");
  if (!res.ok) throw new Error(`VOYAGER_${res.status}`);
  return res.json();
}

// Voyager returns a normalized envelope: { data, included: [ ...entities ] }.
// Helpers to dig through `included` tolerantly.
const included = (json) => (json && Array.isArray(json.included) ? json.included : []);
const firstWith = (json, pred) => included(json).find(pred);
const allWith = (json, pred) => included(json).filter(pred);

// ---- identity -------------------------------------------------------------

// Current member: URN + public identifier + name. Basis for everything else.
export async function getMe() {
  const json = await voyagerFetch("/me");
  // The mini profile is either in `data` or in `included`.
  const mini =
    firstWith(json, (e) => e && typeof e.publicIdentifier === "string") ||
    (json.data && json.data.miniProfile) ||
    {};
  const memberUrn =
    mini.entityUrn ||
    (json.data && json.data["*miniProfile"]) ||
    null;
  return {
    memberUrn,
    publicIdentifier: mini.publicIdentifier || null,
    firstName: mini.firstName || null,
    lastName: mini.lastName || null,
    profileUrl: mini.publicIdentifier
      ? `${LINKEDIN_ORIGIN}/in/${mini.publicIdentifier}/`
      : null,
  };
}

// ---- profile metrics ------------------------------------------------------

// Follower count via the network-info surface. Falls back to null.
export async function getFollowerCount(publicIdentifier) {
  if (!publicIdentifier) return null;
  try {
    const json = await voyagerFetch(
      `/identity/profiles/${encodeURIComponent(publicIdentifier)}/networkinfo`
    );
    const info =
      (json.data && (json.data.followersCount ?? json.data.followerCount) != null
        ? json.data
        : firstWith(json, (e) => e && (e.followersCount != null || e.followerCount != null))) ||
      {};
    const count = info.followersCount ?? info.followerCount;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

// "Who viewed your profile" count — author-only, may not be present. Best-effort.
export async function getProfileViews() {
  try {
    const json = await voyagerFetch("/identity/wvmpCards?q=findWvmpCards");
    const card = firstWith(
      json,
      (e) => e && (e.numViews != null || e.allTimeViewsCount != null || e.value != null)
    );
    if (!card) return null;
    return card.numViews ?? card.allTimeViewsCount ?? card.value ?? null;
  } catch {
    return null;
  }
}

// ---- posts ----------------------------------------------------------------

// Recent posts by the member with public engagement (reactions/comments/reposts).
// Impressions are author-only and fetched separately (getPostAnalytics).
export async function getPosts(memberUrn) {
  if (!memberUrn) return [];
  let json;
  try {
    json = await voyagerFetch(
      `/identity/profileUpdatesV2?count=${MAX_POSTS}&start=0&q=memberShareFeed` +
        `&profileUrn=${encodeURIComponent(memberUrn)}`
    );
  } catch {
    return [];
  }

  // Updates carry commentary + a socialDetail with reaction/comment/share counts.
  const updates = allWith(
    json,
    (e) => e && (e.$type || "").toString().toLowerCase().includes("update") && (e.metadata || e.socialDetail || e.commentary)
  );

  const posts = [];
  for (const u of updates) {
    const urn = u.updateMetadata?.urn || u.entityUrn || u.dashEntityUrn;
    const activityUrn = extractActivityUrn(urn) || extractActivityUrn(JSON.stringify(u));
    if (!activityUrn) continue;

    const social = resolveSocialDetail(json, u);
    posts.push({
      urn: activityUrn,
      permalink: `${LINKEDIN_ORIGIN}/feed/update/${activityUrn}/`,
      createdAt: extractCreatedAt(u, activityUrn),
      textPreview: extractCommentary(u),
      metrics: {
        impressions: null, // filled by getPostAnalytics
        reactions: social.reactions,
        comments: social.comments,
        reposts: social.reposts,
      },
    });
    if (posts.length >= MAX_POSTS) break;
  }
  return dedupeByUrn(posts);
}

// Author-only analytics (impressions) for a single post. GraphQL queryId rotates, so this is
// wrapped defensively and returns null on any failure. See docs for the queryId-discovery plan.
export async function getPostAnalytics(activityUrn) {
  if (!activityUrn) return null;
  try {
    const queryId = await discoverAnalyticsQueryId();
    if (!queryId) return null;
    const variables = `(analyticsEntityUrn:${encodeURIComponent(activityUrn)})`;
    const json = await voyagerFetch(`/graphql?queryId=${queryId}&variables=${variables}`);
    const node = firstWith(
      json,
      (e) => e && (e.impressionCount != null || e.numImpressions != null)
    );
    if (!node) return null;
    return node.impressionCount ?? node.numImpressions ?? null;
  } catch {
    return null;
  }
}

// ---- queryId discovery ----------------------------------------------------

let _analyticsQueryIdCache = null;
// Scrape the current analytics queryId out of a live LinkedIn page. Cached per worker lifetime.
async function discoverAnalyticsQueryId() {
  if (_analyticsQueryIdCache) return _analyticsQueryIdCache;
  try {
    const res = await fetch(`${LINKEDIN_ORIGIN}/feed/`, { credentials: "include" });
    const html = await res.text();
    // queryIds look like: voyagerPremiumDashAnalyticsObject.<hash> or voyagerFeedDashCreatorAnalytics.<hash>
    const m = html.match(/voyager(?:Premium|Feed)Dash(?:Analytics|CreatorAnalytics)[A-Za-z]*\.[a-f0-9]{16,}/);
    _analyticsQueryIdCache = m ? m[0] : null;
    return _analyticsQueryIdCache;
  } catch {
    return null;
  }
}

// ---- parsing helpers ------------------------------------------------------

function extractActivityUrn(s) {
  if (!s) return null;
  const m = String(s).match(/urn:li:activity:\d+/);
  return m ? m[0] : null;
}

function extractCommentary(update) {
  const text =
    update.commentary?.text?.text ||
    update.commentary?.text ||
    update.text?.text ||
    (typeof update.commentary === "string" ? update.commentary : null);
  if (!text) return null;
  return String(text).slice(0, 280);
}

// Post creation time, derived from the activity URN rather than from a response field.
//
// LinkedIn activity ids are snowflake-like: the high bits of the 64-bit id are a millisecond
// epoch. `urn:li:activity:7466141027192467456 >> 22` is 2026-05-29, and it lines up with the post
// content. This beats hunting for a timestamp field because the URN is the one thing we already
// extract reliably — no extra request, and nothing to re-fix when Voyager reshapes its payloads.
export function createdAtFromUrn(activityUrn) {
  const id = String(activityUrn || "").match(/urn:li:activity:(\d+)/)?.[1];
  if (!id) return null;
  const ms = Number(BigInt(id) >> 22n);
  // Sanity-bound it: anything before LinkedIn existed or in the future means we guessed wrong.
  if (!Number.isFinite(ms) || ms < 1_000_000_000_000 || ms > Date.now() + 86_400_000) return null;
  return new Date(ms).toISOString();
}

function extractCreatedAt(update, activityUrn) {
  const created = update.createdAt || update.publishedAt || update.metadata?.createdAt;
  if (typeof created === "number") return new Date(created).toISOString();
  return createdAtFromUrn(activityUrn);
}

function resolveSocialDetail(json, update) {
  // socialDetail may be inline or referenced by urn in `included`.
  let sd = update.socialDetail;
  if (!sd && update["*socialDetail"]) {
    sd = firstWith(json, (e) => e && e.entityUrn === update["*socialDetail"]);
  }
  const counts = sd?.totalSocialActivityCounts || sd?.socialActivityCounts || sd || {};
  return {
    reactions: numeric(counts.numLikes ?? counts.reactionCount ?? counts.numReactions),
    comments: numeric(counts.numComments ?? counts.commentCount),
    reposts: numeric(counts.numShares ?? counts.shareCount ?? counts.repostCount),
  };
}

function numeric(v) {
  return typeof v === "number" ? v : null;
}

function dedupeByUrn(posts) {
  const seen = new Set();
  const out = [];
  for (const p of posts) {
    if (seen.has(p.urn)) continue;
    seen.add(p.urn);
    out.push(p);
  }
  return out;
}

// ---- diagnostics ----------------------------------------------------------

// Report the SHAPE of the live Voyager responses so the parsers above can be fixed against real
// data instead of guesses. Deliberately returns structure only — entity types and the names of
// numeric fields — never post text, names, or ids, so the output is safe to paste into an issue.
export async function diagnose() {
  const out = { posts: null, networkinfo: null, analyticsQueryId: null };

  const shapeOf = (entity) => ({
    type: entity?.$type || entity?.$recipeType || "(untyped)",
    // Numeric fields are what we're missing: reactions, comments, reposts, followers, impressions.
    numericKeys: Object.entries(entity || {})
      .filter(([, v]) => typeof v === "number")
      .map(([k]) => k),
    // One level down, since counts usually live in a nested counts object.
    nested: Object.entries(entity || {})
      .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
      .map(([k, v]) => ({
        key: k,
        numericKeys: Object.entries(v)
          .filter(([, vv]) => typeof vv === "number")
          .map(([kk]) => kk),
      }))
      .filter((n) => n.numericKeys.length),
  });

  try {
    const me = await getMe();
    const json = await voyagerFetch(
      `/identity/profileUpdatesV2?count=3&start=0&q=memberShareFeed` +
        `&profileUrn=${encodeURIComponent(me.memberUrn)}`
    );
    out.posts = {
      topLevelKeys: Object.keys(json || {}),
      includedCount: included(json).length,
      entities: included(json).map(shapeOf).filter((e) => e.numericKeys.length || e.nested.length),
    };
  } catch (e) {
    out.posts = { error: String(e.message || e) };
  }

  try {
    const me = await getMe();
    const json = await voyagerFetch(
      `/identity/profiles/${encodeURIComponent(me.publicIdentifier)}/networkinfo`
    );
    out.networkinfo = {
      dataNumericKeys: Object.entries(json?.data || {})
        .filter(([, v]) => typeof v === "number")
        .map(([k]) => k),
      entities: included(json).map(shapeOf),
    };
  } catch (e) {
    out.networkinfo = { error: String(e.message || e) };
  }

  out.analyticsQueryId = await discoverAnalyticsQueryId();
  return out;
}

// ---- orchestration --------------------------------------------------------

// Collect a full snapshot batch matching docs/sync-protocol.md. Sequential + polite.
export async function collectSnapshot() {
  const me = await getMe(); // throws NOT_LOGGED_IN if no session
  await sleep(REQUEST_DELAY_MS);

  const followerCount = await getFollowerCount(me.publicIdentifier);
  await sleep(REQUEST_DELAY_MS);

  const profileViews = await getProfileViews();
  await sleep(REQUEST_DELAY_MS);

  const posts = await getPosts(me.memberUrn);

  // Enrich each post with author-only impressions, politely spaced.
  for (const post of posts) {
    await sleep(REQUEST_DELAY_MS);
    post.metrics.impressions = await getPostAnalytics(post.urn);
  }

  return {
    me,
    profile: { followerCount, profileViews },
    posts,
  };
}
