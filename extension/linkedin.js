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

async function linkedinFetch(path, init = {}) {
  const token = await csrfToken();
  const res = await fetch(`${LINKEDIN_ORIGIN}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "csrf-token": token,
      ...(init.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) throw new Error("NOT_LOGGED_IN");
  if (!res.ok) throw new Error(`LINKEDIN_${res.status}`);
  return res;
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
// Engagement counts (reactions/comments/reposts/impressions) ride along in `included`.
export async function getPosts(memberUrn) {
  return (await getPostFeed(memberUrn)).posts;
}

function activityId(activityUrn) {
  return String(activityUrn || "").match(/urn:li:activity:(\d+)/)?.[1] || null;
}

function metricValues(fragment) {
  return [
    ...fragment.matchAll(/>([\d][\d,.]*%?)</g),
    ...fragment.matchAll(/"children":\["([\d][\d,.]*%?)"\]/g),
  ]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((match) => match[1]);
}

function metricTextBefore(html, label) {
  const at = html.indexOf(label);
  if (at < 0) return null;
  return metricValues(html.slice(Math.max(0, at - 700), at)).at(-1) || null;
}

function metricTextAfter(html, label) {
  const at = html.indexOf(label);
  if (at < 0) return null;
  return metricValues(html.slice(at + label.length, at + label.length + 700))[0] || null;
}

function metricNumber(value) {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[,%.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function analyticsRequest(activityId) {
  const requestId = "com.linkedin.sdui.requests.creatoranalytics.spaSlowMetrics";
  const requestedArguments = {
    $type: "proto.sdui.actions.requests.RequestedArguments",
    requestedStateKeys: [],
    payload: {
      updateKey: {
        feedType: 47,
        items: [{
          feedUpdateUrn: { updateUrnActivityUrn: { activityUrn: { activityId } } },
          trackingId: "",
        }],
        aggregationType: 0,
        isVideoCarousel: false,
      },
    },
    requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
  };
  return {
    requestId,
    serverRequest: {
      requestId,
      requestedArguments,
      requestMetadata: { $type: "proto.sdui.common.RequestMetadata" },
      isApfcEnabled: false,
      isStreaming: false,
      rumPageKey: "",
    },
    states: [],
    requestedArguments: {
      ...requestedArguments,
      states: [],
      screenId: "com.linkedin.sdui.flagshipnav.creatoranalytics.MembersSPAContainer",
      knownTemplateIds: [],
    },
  };
}

// Author-only analytics. LinkedIn's current page renders core values in its HTML response and
// fills the reach breakdown with one RSC server action. Both requests are keyed only by the
// activity id; cookies and CSRF stay inside this browser session.
async function getPostAnalytics(activityUrn) {
  const id = activityId(activityUrn);
  if (!id) return {};
  try {
    const requestId = "com.linkedin.sdui.requests.creatoranalytics.spaSlowMetrics";
    const [page, slow] = await Promise.all([
      linkedinFetch(`/flagship-web/analytics/post-summary/${activityUrn}/`),
      linkedinFetch(`/flagship-web/rsc-action/actions/server-request?sduiid=${requestId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-li-rsc-stream": "true",
        },
        body: JSON.stringify(analyticsRequest(id)),
      }),
    ]);
    const [html, stream] = await Promise.all([page.text(), slow.text()]);
    const impressions = metricNumber(metricTextBefore(html, "Impressions"));
    const inNetworkPercent = metricNumber(metricTextAfter(stream, "In-network (followers and connections)"));
    const outOfNetworkPercent = metricNumber(metricTextAfter(stream, "Out-of-network"));
    const inNetwork =
      impressions != null && inNetworkPercent != null
        ? Math.round((impressions * inNetworkPercent) / 100)
        : null;
    const outOfNetwork =
      impressions != null && outOfNetworkPercent != null
        ? Math.round((impressions * outOfNetworkPercent) / 100)
        : null;
    return Object.fromEntries(Object.entries({
      impressions,
      reactions: metricNumber(metricTextAfter(html, "Reactions")),
      comments: metricNumber(metricTextAfter(html, "Comments")),
      reposts: metricNumber(metricTextAfter(html, "Reposts")),
      sends: metricNumber(metricTextAfter(html, "Sends on LinkedIn")),
      saves: metricNumber(metricTextAfter(html, "Saves")),
      impressionsInNetwork: inNetwork,
      impressionsOutOfNetwork: outOfNetwork,
      membersReached: metricNumber(metricTextBefore(stream, "Members reached")),
      profileViewersFromPost: metricNumber(metricTextBefore(html, "Profile viewers from this post")),
      followersFromPost: metricNumber(metricTextBefore(html, "Followers gained from this post")),
    }).filter(([, value]) => value != null));
  } catch {
    return {};
  }
}

// Fetch posts and the follower count that LinkedIn now includes alongside them. Keeping these in
// one request avoids the retired `networkinfo` endpoint and matches the live response diagnostics.
async function getPostFeed(memberUrn) {
  if (!memberUrn) return { posts: [], followerCount: null, excludedPostUrns: [] };
  let json;
  try {
    json = await voyagerFetch(
      `/identity/profileUpdatesV2?count=${MAX_POSTS}&start=0&q=memberShareFeed` +
        `&profileUrn=${encodeURIComponent(memberUrn)}`
    );
  } catch {
    return { posts: [], followerCount: null, excludedPostUrns: [] };
  }

  const following = firstWith(
    json,
    (e) => e && (e.$type || "").endsWith("FollowingInfo") && typeof e.followerCount === "number",
  );

  // Updates carry commentary + a socialDetail with reaction/comment/share counts.
  const rootUpdates = new Set(json.data?.["*elements"] || []);
  const updates = allWith(
    json,
    (e) => e && (e.$type || "").toString().toLowerCase().includes("update") && (e.metadata || e.socialDetail || e.commentary)
  ).filter((update) =>
    rootUpdates.size > 0
      ? rootUpdates.has(update.entityUrn)
      : JSON.stringify(update.actor || {}).includes(memberUrn)
  );

  const posts = [];
  const excludedPostUrns = [];
  for (const u of updates) {
    const urn = u.updateMetadata?.urn || u.entityUrn || u.dashEntityUrn;
    const serialized = JSON.stringify(u);
    const activityUrn = extractActivityUrn(urn) || extractActivityUrn(serialized);
    if (!activityUrn) continue;
    const nestedReshareUrn = extractActivityUrn(u["*resharedUpdate"]);
    if (nestedReshareUrn && nestedReshareUrn !== activityUrn) {
      excludedPostUrns.push(nestedReshareUrn);
    }

    const social = resolveSocialDetail(json, activityUrn);
    posts.push({
      urn: activityUrn,
      permalink: `${LINKEDIN_ORIGIN}/feed/update/${activityUrn}/`,
      createdAt: extractCreatedAt(u, activityUrn),
      textPreview: extractCommentary(u),
      isRepost:
        Boolean(u["*resharedUpdate"]) ||
        serialized.includes('"RESHARED"') ||
        /reposted this/i.test(serialized),
      metrics: {
        impressions: social.impressions,
        reactions: social.reactions,
        comments: social.comments,
        reposts: social.reposts,
      },
    });
    if (posts.length >= MAX_POSTS) break;
  }
  return {
    posts: dedupeByUrn(posts),
    followerCount: following?.followerCount ?? null,
    excludedPostUrns: [...new Set(excludedPostUrns)],
  };
}

// NOTE: there used to be a GraphQL "author analytics" call here to fetch impressions, guarded by
// scraping a rotating queryId out of the feed HTML. It never worked (the queryId regex found
// nothing, so it returned null every time) and it cost one extra request plus a polite delay per
// post. `numImpressions` on SocialActivityCounts supplies the same number in the response we
// already fetch, so the whole path is gone.

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
  return truncatePreview(text);
}

export function truncatePreview(text) {
  // Slice by Unicode code points, not UTF-16 code units. A code-unit slice can split an emoji's
  // surrogate pair at the boundary; JSON.stringify then emits a lone `\udxxx` escape that strict
  // server parsers reject. `toWellFormed` also replaces any malformed surrogate already present
  // in LinkedIn's response.
  const wellFormed = String(text).toWellFormed();
  return Array.from(wellFormed).slice(0, 280).join("");
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

// Engagement counts for one post.
//
// In the normalized envelope `SocialActivityCounts` is its OWN entity in `included`, not an object
// nested inside `SocialDetail` — `SocialDetail` holds only a reference to it (and `totalShares`).
// Reading `socialDetail.totalSocialActivityCounts` therefore always came back undefined, which is
// why every count landed as null.
//
// We match by activity URN rather than by chasing the reference key, because the entity URN embeds
// the activity id — `urn:li:fs_socialActivityCounts:urn:li:activity:123` — and that survives
// LinkedIn renaming the reference field.
function resolveSocialDetail(json, activityUrn) {
  const isCounts = (e) =>
    (e?.$type || "").endsWith("SocialActivityCounts") ||
    e?.numLikes != null ||
    e?.numImpressions != null;

  const counts =
    included(json).find((e) => isCounts(e) && String(e.entityUrn || "").includes(activityUrn)) || {};

  return {
    reactions: numeric(counts.numLikes),
    comments: numeric(counts.numComments),
    reposts: numeric(counts.numShares),
    // Impressions come from the same entity — no separate author-analytics call needed.
    impressions: numeric(counts.numImpressions),
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

/// Whether this browser has a LinkedIn session, without spending a request on it.
///
/// Presence of JSESSIONID is what every Voyager call depends on: it is both the session marker and
/// the source of the CSRF token. A cheap check is the right one here — the popup wants to tell you
/// what to fix before you click, not prove the session is still valid.
export async function isLinkedInSignedIn() {
  try {
    const cookie = await chrome.cookies.get({ url: LINKEDIN_ORIGIN, name: "JSESSIONID" });
    return Boolean(cookie?.value);
  } catch {
    return false;
  }
}

// ---- diagnostics ----------------------------------------------------------

// Report the SHAPE of the live Voyager responses so the parsers above can be fixed against real
// data instead of guesses. Deliberately returns structure only — entity types and the names of
// numeric fields — never post text, names, or ids, so the output is safe to paste into an issue.
export async function diagnose() {
  const out = { posts: null, followerCandidates: [] };

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

  // Follower count has no obvious home any more: `networkinfo` and `profileView` both answer 410,
  // and the dash profile projection carries no counts at the top level. So rather than probe
  // endpoint by endpoint, fetch a few that respond and search the WHOLE payload recursively for
  // numeric keys that look like follower/connection/view counts, reporting where they live.
  const deepFindNumbers = (node, re, path = "$", depth = 0, found = []) => {
    if (found.length >= 25 || depth > 6 || !node || typeof node !== "object") return found;
    for (const [k, v] of Object.entries(node)) {
      const here = Array.isArray(node) ? `${path}[]` : `${path}.${k}`;
      if (typeof v === "number" && re.test(k)) found.push({ path: here, key: k, value: v });
      else if (v && typeof v === "object") deepFindNumbers(v, re, here, depth + 1, found);
    }
    return found;
  };
  const INTERESTING = /follow|connection|view|impression/i;

  const me2 = await getMe().catch(() => null);
  const pid = me2?.publicIdentifier ? encodeURIComponent(me2.publicIdentifier) : null;
  // The dash APIs key off the fsd_profile urn, which the dash profile response contains.
  let fsdUrn = null;

  const paths = [
    pid && `/identity/dash/profiles?q=memberIdentity&memberIdentity=${pid}`,
    pid &&
      `/identity/dash/profiles?q=memberIdentity&memberIdentity=${pid}` +
        `&decorationId=com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-6`,
    `/identity/wvmpCards?q=findWvmpCards`,
  ].filter(Boolean);

  for (const path of paths) {
    try {
      const json = await voyagerFetch(path);
      fsdUrn =
        fsdUrn ||
        included(json).find((e) => String(e?.entityUrn || "").includes("fsd_profile"))?.entityUrn ||
        null;
      out.followerCandidates.push({
        path,
        status: "ok",
        entityTypes: [...new Set(included(json).map((e) => e?.$type).filter(Boolean))].slice(0, 10),
        matches: deepFindNumbers(json, INTERESTING),
      });
    } catch (e) {
      out.followerCandidates.push({ path, status: String(e.message || e) });
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // Follower counts live on a FollowingState in the dash graph; it needs the fsd_profile urn.
  if (fsdUrn) {
    const followPath = `/feed/dash/followingStates?ids=List(${encodeURIComponent(fsdUrn)})`;
    try {
      const json = await voyagerFetch(followPath);
      out.followerCandidates.push({
        path: followPath,
        status: "ok",
        entityTypes: [...new Set(included(json).map((e) => e?.$type).filter(Boolean))].slice(0, 10),
        matches: deepFindNumbers(json, INTERESTING),
      });
    } catch (e) {
      out.followerCandidates.push({ path: followPath, status: String(e.message || e) });
    }
  }
  out.profileUrnFound = Boolean(fsdUrn);

  return out;
}

// ---- orchestration --------------------------------------------------------

// Collect a full snapshot batch matching docs/sync-protocol.md. Sequential + polite.
export async function collectSnapshot() {
  const me = await getMe(); // throws NOT_LOGGED_IN if no session
  await sleep(REQUEST_DELAY_MS);

  const profileViews = await getProfileViews();
  await sleep(REQUEST_DELAY_MS);

  // Posts arrive with engagement and follower count attached — one request, not one per post.
  const { posts, followerCount, excludedPostUrns } = await getPostFeed(me.memberUrn);

  for (const post of posts) {
    const analytics = await getPostAnalytics(post.urn);
    post.metrics = { ...post.metrics, ...analytics };
    await sleep(REQUEST_DELAY_MS);
  }

  return {
    me,
    profile: { followerCount, profileViews },
    posts,
    excludedPostUrns,
  };
}
