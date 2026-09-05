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

// The member's own follower count, from the dash following-state keyed by their profile id.
//
// This is the one surface that still answers for it: `networkinfo` is gone (410), the profile
// top card carries no count, and the post feed only includes FollowingInfo for *other* actors on
// the page — which is how three people once synced a company page's 3,553 as their own. The id
// after the last colon of the member URN is the same id `fsd_profile` uses.
export async function getFollowerCount(memberUrn) {
  const id = urnTail(memberUrn);
  if (!id) return null;
  try {
    const key = `urn:li:fsd_followingState:urn:li:fsd_profile:${id}`;
    const json = await voyagerFetch(`/feed/dash/followingStates?ids=List(${encodeURIComponent(key)})`);
    const state =
      json?.data?.results?.[key] ||
      firstWith(json, (e) => e && String(e.entityUrn || "") === key && typeof e.followerCount === "number") ||
      firstWith(json, (e) => e && typeof e.followerCount === "number");
    return typeof state?.followerCount === "number" ? state.followerCount : null;
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
export async function getPostFeed(memberUrn) {
  if (!memberUrn) return { posts: [], followerCount: null, excludedPostUrns: [], postFeedComplete: false };
  let json;
  try {
    json = await voyagerFetch(
      `/identity/profileUpdatesV2?count=${MAX_POSTS}&start=0&q=memberShareFeed` +
        `&profileUrn=${encodeURIComponent(memberUrn)}`
    );
  } catch {
    return { posts: [], followerCount: null, excludedPostUrns: [], postFeedComplete: false };
  }

  // The member's OWN follower count. The feed response carries a FollowingInfo entity for every
  // actor on the page — reshared authors, company pages, the lot — so taking the first one
  // recorded a colleague's 3,500 or a company's 288,000 as the member's own. Match the entity
  // whose URN names this member; report null rather than guess when it isn't there.
  const following = ownFollowingInfo(json, memberUrn);

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

    const social = resolveSocialDetail(json, activityUrn, u);
    posts.push({
      urn: activityUrn,
      permalink: `${LINKEDIN_ORIGIN}/feed/update/${activityUrn}/`,
      createdAt: extractCreatedAt(u, activityUrn),
      textPreview: extractCommentary(u),
      imageUrls: extractImageUrls(u),
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
    // Every follower count on the page, for diagnostics and the e2e check: proves the one above
    // was chosen by identity rather than by position.
    allFollowerCounts: included(json)
      .filter((e) => e && /Following(Info|State)$/.test(String(e.$type || "")) && typeof e.followerCount === "number")
      .map((e) => e.followerCount),
    excludedPostUrns: [...new Set(excludedPostUrns)],
    // Only an under-full first page is authoritative for deletion. At exactly MAX_POSTS, an absent
    // stored post may simply have fallen onto page two rather than having been deleted.
    postFeedComplete: rootUpdates.size > 0 && rootUpdates.size < MAX_POSTS,
  };
}

// The FollowingInfo entity that belongs to `memberUrn`, or null.
//
// Identity URNs come in several spellings (`fs_miniProfile`, `fsd_profile`, `member`), but the
// id after the last colon is the same in all of them, and a FollowingInfo's entityUrn embeds it:
// `urn:li:fs_followingInfo:urn:li:fsd_profile:ACoAA...`. Company pages embed `urn:li:company:…`
// instead, so they can never match a member.
export function ownFollowingInfo(json, memberUrn) {
  const id = urnTail(memberUrn);
  if (!id) return null;
  const isFollowing = (e) =>
    e &&
    /Following(Info|State)$/.test(String(e.$type || "")) &&
    typeof e.followerCount === "number";
  return (
    included(json).find(
      (e) =>
        isFollowing(e) &&
        [e.entityUrn, e.followee, e["*followee"], e.dashFollowingStateUrn]
          .filter((v) => typeof v === "string")
          .some((v) => v.includes(id)),
    ) || null
  );
}

// NOTE: there used to be a GraphQL "author analytics" call here to fetch impressions, guarded by
// scraping a rotating queryId out of the feed HTML. It never worked (the queryId regex found
// nothing, so it returned null every time) and it cost one extra request plus a polite delay per
// post. `numImpressions` on SocialActivityCounts supplies the same number in the response we
// already fetch, so the whole path is gone.

// ---- comments -------------------------------------------------------------

// Every comment on a post, with its author.
//
// The post page renders only the first handful of comments, and Voyager's comment endpoints
// (`/feed/comments`, `/feed/dash/comments`, the GraphQL surface) answer 400/404 for the current
// site. What LinkedIn's own page uses is its server-driven UI: a POST to the `pagedComments`
// pager, which streams back the comment list as React Flight (the `id:json` chunk format React
// Server Components use). Threads with collapsed replies carry a `fetchReplies` ServerRequest in
// that stream; replaying it fetches the hidden replies the same way. Together they yield the whole
// thread, which is what "one point per person who commented" needs — the page's first few would
// miss anyone who only replied further down.
//
// The page embeds the exact next-page request it will send (`nextPageRequest`): the thread key
// (an activity for a normal post, the original ugcPost for a repost), a tracking id, and a page
// token that is a session id plus an offset. We take that verbatim, reset the offset to zero and
// page through by rewriting the offset; the server honours the page size when the token is
// genuine. Without a page token it caps at ~20 and ignores the thread key, so a synthetic
// request is only the fallback.
// Body shape was established by bisection against the real request (docs/linkedin-scraping.md):
// everything is optional except `clientArguments.states: []`. Best-effort like the other
// collectors: on failure we fall back to the rendered page, and that failing returns [].
const COMMENTS_PAGER = "com.linkedin.sdui.pagers.feed.pagedComments";
const REPLIES_REQUEST = "com.linkedin.sdui.feed.update.comments.fetchReplies";
// 50 per page: each comment costs ~400 KB of Flight stream, and asking for 250 at once made the
// server give up with a 500 on a 134-comment post. Pages advance by rewriting the token offset.
const COMMENT_PAGE_SIZE = 50;
const COMMENT_MAX_PAGES = 10;

export async function getPostComments(activityUrn, { max = 1000 } = {}) {
  const id = activityId(activityUrn);
  if (!id) return [];
  let html = null;
  try {
    const res = await linkedinFetch(`/feed/update/urn:li:activity:${id}/`);
    html = await res.text();
  } catch (error) {
    if (String(error?.message) === "NOT_LOGGED_IN") throw error;
  }
  // Two attempts: LinkedIn's SDUI endpoint answers 500 now and then under a burst of requests,
  // and a single transient failure would otherwise silently degrade this post to the page's
  // first handful — which scoring would then treat as the whole thread.
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(REQUEST_DELAY_MS * 4);
    try {
      const comments = await getPostCommentsSdui(id, html, max);
      pushDiagnostic({ activityId: id, path: "sdui", attempt, count: comments.length });
      if (comments.length > 0) return comments;
    } catch (error) {
      if (String(error?.message) === "NOT_LOGGED_IN") throw error;
      lastError = String(error?.message || error);
    }
  }
  const rendered = html ? parseRenderedComments(html, max) : [];
  pushDiagnostic({ activityId: id, path: "rendered", count: rendered.length, error: lastError });
  return rendered;
}

// Which path each post's comments came from, for the e2e and the diagnostics report. Bounded so
// a long-lived worker does not grow it forever.
export const commentDiagnostics = [];
const COMMENT_DIAGNOSTICS_MAX = 100;
const pushDiagnostic = (entry) => {
  commentDiagnostics.push(entry);
  if (commentDiagnostics.length > COMMENT_DIAGNOSTICS_MAX) commentDiagnostics.shift();
};

async function sduiPost(path, body) {
  const res = await linkedinFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-li-rsc-stream": "true" },
    body: JSON.stringify(body),
  });
  return res.text();
}

// The page's own `nextPageRequest`, or null. It is JSON escaped inside a JS string literal, so
// brace-match while honouring `\"` string boundaries, then unescape and parse.
export function embeddedNextPageRequest(html) {
  const at = html.indexOf('\\"nextPageRequest\\":');
  if (at < 0) return null;
  const open = html.indexOf("{", at);
  if (open < 0) return null;
  let depth = 0;
  let inString = false;
  let end = -1;
  for (let j = open; j < html.length; j++) {
    const ch = html[j];
    if (inString) {
      if (ch === "\\" && html[j + 1] === "\\") j++;
      else if (ch === "\\" && html[j + 1] === '"') {
        inString = false;
        j++;
      }
      continue;
    }
    if (ch === "\\" && html[j + 1] === '"') {
      inString = true;
      j++;
    } else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = j + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  // Unescape one level: `\\` -> `\` and `\"` -> `"`, without letting the first rewrite feed the second.
  const placeholder = "__BACKSLASH__";
  const unescaped = html
    .slice(open, end)
    .replace(/\\\\/g, placeholder)
    .replace(/\\"/g, '"')
    .split(placeholder)
    .join("\\");
  try {
    const request = JSON.parse(unescaped);
    return request?.pagerId === COMMENTS_PAGER && request.requestedArguments?.payload?.pageToken ? request : null;
  } catch {
    return null;
  }
}

// A page token is a protobuf: a session string, then field 2 (tag 0x10) holding the offset as a
// varint. Offsets we use stay below 128, so the varint is one byte.
function tokenWithOffset(token, offset) {
  const bytes = Uint8Array.from(atob(token), (c) => c.charCodeAt(0));
  const tag = bytes.lastIndexOf(0x10);
  if (tag < 0) return token;
  const out = new Uint8Array(tag + 2);
  out.set(bytes.subarray(0, tag + 1));
  out[tag + 1] = offset;
  return btoa(String.fromCharCode(...out));
}

function syntheticPayload(activityId) {
  return {
    threadUrn: { threadUrnActivityThreadUrn: { activityUrn: { activityId } } },
    updateKey: {
      feedType: 3,
      items: [{ feedUpdateUrn: { updateUrnActivityUrn: { activityUrn: { activityId } } }, trackingId: "AAAAAAAAAAAAAAAAAAAAAA==" }],
      aggregationType: 0,
      isVideoCarousel: false,
    },
    sortOrder: "CommentSortOrder_RELEVANCE",
  };
}

async function getPostCommentsSdui(activityId, html, max) {
  const embedded = html ? embeddedNextPageRequest(html) : null;
  const base = embedded ? embedded.requestedArguments.payload : syntheticPayload(activityId);
  const token = embedded ? base.pageToken : null;

  const byUrn = new Map();
  const replyRequests = new Map();
  for (let page = 0; page < COMMENT_MAX_PAGES && byUrn.size < max; page++) {
    const offset = page * COMMENT_PAGE_SIZE;
    if (page > 0 && !token) break; // the synthetic request cannot page
    const payload = {
      ...base,
      pageSize: COMMENT_PAGE_SIZE,
      subsequentPageSize: COMMENT_PAGE_SIZE,
      numCommentsDisplayed: offset,
      ...(token ? { pageToken: tokenWithOffset(token, offset) } : {}),
    };
    const requestedArguments = { $type: "proto.sdui.actions.requests.RequestedArguments", requestedStateKeys: [], payload };
    if (page > 0) await sleep(REQUEST_DELAY_MS);
    const text = await sduiPost(`/flagship-web/rsc-action/actions/pagination?sduiid=${COMMENTS_PAGER}`, {
      pagerId: COMMENTS_PAGER,
      clientArguments: { ...requestedArguments, states: [] },
      paginationRequest: { $type: "proto.sdui.actions.requests.PaginationRequest", pagerId: COMMENTS_PAGER, requestedArguments },
    });
    const chunks = parseFlight(text);
    let added = 0;
    for (const c of commentsFromFlight(chunks)) {
      if (!byUrn.has(c.urn)) {
        byUrn.set(c.urn, c);
        added++;
      }
    }
    // Collapsed reply threads: the stream includes the exact request the "see previous replies"
    // button would send. Collect each once (they repeat per render pass).
    walkFlight(chunks, (node) => {
      if (node && node.$type === "proto.sdui.actions.core.ServerRequest" && node.value?.requestId === REPLIES_REQUEST) {
        const key = node.value.requestedArguments?.payload?.anchorId || JSON.stringify(node.value.requestedArguments?.payload?.parentCommentUrn);
        if (key && !replyRequests.has(key)) replyRequests.set(key, node.value);
      }
    });
    // Pages carry visible replies alongside their top-level comments, so "fewer than a page"
    // is not a reliable end signal; only a page that adds nothing is.
    if (added === 0) break;
  }

  for (const request of replyRequests.values()) {
    if (byUrn.size >= max) break;
    await sleep(REQUEST_DELAY_MS);
    try {
      const text = await sduiPost(`/flagship-web/rsc-action/actions/server-request?sduiid=${REPLIES_REQUEST}`, {
        requestId: REPLIES_REQUEST,
        serverRequest: { requestId: REPLIES_REQUEST, requestedArguments: request.requestedArguments },
        states: [],
        requestedArguments: { ...request.requestedArguments, states: [] },
      });
      for (const c of commentsFromFlight(parseFlight(text))) if (!byUrn.has(c.urn)) byUrn.set(c.urn, c);
    } catch {
      // A thread we could not expand only costs its hidden replies; keep what we have.
    }
  }
  return [...byUrn.values()].slice(0, max);
}

// React Flight stream -> Map of chunk id -> parsed value. Each line is `id:payload`; a `T` payload
// is raw text of the given hex byte length (may span lines); `I`/`H`/`E` payloads are module and
// hint records we keep only so references resolve. Elements are `["$", type, key, props]` arrays
// and `"$<id>"` / `"$L<id>"` strings reference other chunks.
export function parseFlight(text) {
  const chunks = new Map();
  const bytes = new TextEncoder();
  let i = 0;
  while (i < text.length) {
    const colon = text.indexOf(":", i);
    if (colon < 0) break;
    const id = text.slice(i, colon);
    if (text[colon + 1] === "T") {
      const comma = text.indexOf(",", colon + 2);
      const byteLength = parseInt(text.slice(colon + 2, comma), 16);
      let end = comma + 1;
      let seen = 0;
      while (end < text.length && seen < byteLength) {
        seen += bytes.encode(text[end]).length;
        end++;
      }
      chunks.set(id, text.slice(comma + 1, end));
      i = end + (text[end] === "\n" ? 1 : 0);
      continue;
    }
    let lineEnd = text.indexOf("\n", colon);
    if (lineEnd < 0) lineEnd = text.length;
    let payload = text.slice(colon + 1, lineEnd);
    if (/^[A-Z]\[/.test(payload)) payload = payload.slice(1);
    try {
      chunks.set(id, JSON.parse(payload));
    } catch {
      // Not JSON (a hint row we do not model); nothing references it for our purposes.
    }
    i = lineEnd + 1;
  }
  return chunks;
}

function walkFlight(chunks, visit) {
  const stack = [...chunks.values()];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const x of node) stack.push(x);
    } else if (node && typeof node === "object") {
      visit(node);
      for (const v of Object.values(node)) stack.push(v);
    }
  }
}

// Comments in a Flight stream. Each comment is an element whose `componentKey` is
// `replaceableComment_<urn>` (nested wrappers repeat the key; the largest is the whole comment).
// Its subtree, with chunk references resolved, holds the actor header first: the author's
// profile link, the avatar's "View <name>’s profile" label, and a tracking view named
// `comment-actor-description` or `reply-actor-description`. Later links in the same subtree are
// @mentions, so the first profile link is the author. The `[null, "Name", null]` text run is the
// fallback for the name; the viewer's own comments render it with a " • You" suffix elsewhere.
export function commentsFromFlight(chunks) {
  const best = new Map();
  walkFlight(chunks, (node) => {
    const key = node.componentKey;
    if (typeof key === "string" && key.startsWith("replaceableComment_")) {
      const urn = key.slice("replaceableComment_".length);
      const size = JSON.stringify(node).length;
      if (!best.has(urn) || best.get(urn).size < size) best.set(urn, { size, node });
    }
  });
  const out = [];
  for (const [urn, { node }] of best) {
    const found = { slug: null, name: null, view: null };
    const seen = new Set();
    const visit = (n, depth) => {
      if (depth > 80) return;
      if (typeof n === "string") {
        if (!found.slug) {
          const m = n.match(/linkedin\.com\/in\/([^/?"#]+)/);
          if (m) found.slug = m[1];
        }
        // The avatar link's accessible label names the author: "View Ada Lovelace’s profile".
        if (found.slug && !found.name) {
          const m = n.match(/^View (.+?)(?:’|')s profile$/);
          if (m) found.name = m[1].trim();
        }
        if (!found.view && /^(comment|reply)-actor-description$/.test(n)) found.view = n;
        const ref = n.match(/^\$L?([0-9a-f]+)$/);
        if (ref && chunks.has(ref[1]) && !seen.has(ref[1])) {
          seen.add(ref[1]);
          visit(chunks.get(ref[1]), depth + 1);
        }
        return;
      }
      if (Array.isArray(n)) {
        if (!found.name && n.length === 3 && n[0] === null && typeof n[1] === "string" && n[2] === null && n[1].trim()) {
          found.name = n[1].trim();
        }
        for (const x of n) visit(x, depth + 1);
      } else if (n && typeof n === "object") {
        for (const v of Object.values(n)) visit(v, depth + 1);
      }
    };
    visit(node, 0);
    if (!found.slug) continue; // not a comment we can attribute (should not happen; skip rather than guess)
    out.push({
      urn: urn.replace(/^urn:li:comment:\(urn:li:activity:/, "urn:li:comment:(activity:"),
      commenterUrn: `urn:li:publicIdentifier:${decodeURIComponent(found.slug)}`,
      commenterName: found.name ? decodeEntities(found.name) : null,
      createdAt: null,
      isReply: found.view === "reply-actor-description",
    });
  }
  return out;
}

// Fallback: the rendered post page, which shows only the first several comments.
const COMMENT_ID = /id="replaceableComment_(urn:li:comment:\([^)"]*\))"/g;

export function parseRenderedComments(html, max = 100) {
  const anchors = [...html.matchAll(COMMENT_ID)];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < anchors.length && out.length < max; i++) {
    const urn = anchors[i][1];
    if (seen.has(urn)) continue;
    seen.add(urn);
    // The block for this comment runs until the next comment component starts.
    const from = anchors[i].index;
    const to = i + 1 < anchors.length ? anchors[i + 1].index : Math.min(html.length, from + 20_000);
    const block = html.slice(from, to);
    const publicIdentifier = block.match(/href="https:\/\/www\.linkedin\.com\/in\/([^/"?#]+)/)?.[1] || null;
    if (!publicIdentifier) continue;
    const name =
      block.match(/aria-label="View more options for (.+?)(?:['’]s|['’]) comment\./)?.[1] || null;
    out.push({
      urn,
      commenterUrn: `urn:li:publicIdentifier:${decodeURIComponent(publicIdentifier)}`,
      commenterName: name ? decodeEntities(name) : null,
      createdAt: null, // the page shows "1w", not a timestamp
      isReply: false,
    });
  }
  return out;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// A member's own identity can surface under several URN schemes (`fs_miniProfile`, `fsd_profile`,
// `member`); the stable part is the trailing id. Comparing on that keeps "is this my own
// comment?" correct whichever shape a given response uses.
export function urnTail(urn) {
  return String(urn || "").split(":").pop() || "";
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
  return normalizePostText(text);
}

function vectorImageUrl(vectorImage) {
  if (!vectorImage?.rootUrl || !Array.isArray(vectorImage.artifacts)) return null;
  const artifact = [...vectorImage.artifacts]
    .filter((item) => typeof item?.fileIdentifyingUrlPathSegment === "string")
    .sort((a, b) => (Number(b.width) * Number(b.height)) - (Number(a.width) * Number(a.height)))[0];
  if (!artifact) return null;
  const url = `${vectorImage.rootUrl}${artifact.fileIdentifyingUrlPathSegment}`;
  return url.startsWith("https://media.licdn.com/") ? url : null;
}

function extractImageUrls(update) {
  const images = Array.isArray(update?.content?.images) ? update.content.images : [];
  const urls = images.flatMap((image) =>
    (image?.attributes || []).map((attribute) => vectorImageUrl(attribute?.vectorImage)).filter(Boolean)
  );
  return [...new Set(urls)].slice(0, 10);
}

export function normalizePostText(text) {
  // Keep the complete commentary, including its line breaks. `toWellFormed` replaces a malformed
  // surrogate from LinkedIn before JSON serialization. Ten thousand Unicode code points is well
  // above LinkedIn's normal post limit while still bounding storage if the response shape changes.
  return Array.from(String(text).toWellFormed()).slice(0, 10_000).join("");
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
//
// Some posts key their counts by a different URN (a ugcPost or share id) so the activity-URN
// match finds nothing; for those, follow the update's own `*socialDetail` reference to its
// SocialDetail and that entity's `*totalSocialActivityCounts` reference. Either route lands on
// the same entity; the reference is tried first, the URN match is the fallback.
function resolveSocialDetail(json, activityUrn, update) {
  const isCounts = (e) =>
    (e?.$type || "").endsWith("SocialActivityCounts") ||
    e?.numLikes != null ||
    e?.numImpressions != null;
  const byUrn = (urn) => (urn ? included(json).find((e) => e && e.entityUrn === urn) : null);

  const detailUrn = update?.["*socialDetail"] || update?.socialDetail?.entityUrn || null;
  const detail = byUrn(detailUrn);
  const referenced = byUrn(detail?.["*totalSocialActivityCounts"]);
  // The counts entity shares the social detail's key: `fs_socialDetail:X` ↔ `fs_socialActivityCounts:X`.
  const derived = detailUrn ? byUrn(String(detailUrn).replace("fs_socialDetail:", "fs_socialActivityCounts:")) : null;
  const counts =
    (referenced && isCounts(referenced) ? referenced : null) ||
    (derived && isCounts(derived) ? derived : null) ||
    included(json).find((e) => isCounts(e) && String(e.entityUrn || "").includes(activityUrn)) ||
    {};

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
  const out = { posts: null, followerCandidates: [], mediaCandidates: [] };

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

  // Report media structure without reporting the media URLs themselves. Paths, value kinds, and
  // URL origins are enough to implement an extractor against the live shape without exposing a
  // private CDN token or identifying which image belongs to which post.
  const MEDIA_KEY = /image|media|thumbnail|vector|artifact|rooturl|originalurl|displayimage/i;
  const mediaShape = (node, path = "$", depth = 0, found = []) => {
    if (found.length >= 100 || depth > 8 || !node || typeof node !== "object") return found;
    for (const [key, value] of Object.entries(node)) {
      const here = Array.isArray(node) ? `${path}[]` : `${path}.${key}`;
      if (typeof value === "string" && (MEDIA_KEY.test(key) || /^https?:\/\//.test(value))) {
        let origin = null;
        if (/^https?:\/\//.test(value)) {
          try { origin = new URL(value).origin; } catch { /* structure-only diagnostics */ }
        }
        found.push({ path: here, key, kind: origin ? "url" : value.startsWith("urn:") ? "urn" : "string", origin });
      } else if (value && typeof value === "object") {
        if (MEDIA_KEY.test(key)) found.push({ path: here, key, kind: Array.isArray(value) ? "array" : "object", origin: null });
        mediaShape(value, here, depth + 1, found);
      }
    }
    return found;
  };

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
    out.mediaCandidates = included(json)
      .map((entity) => ({
        type: entity?.$type || entity?.$recipeType || "(untyped)",
        fields: mediaShape(entity),
      }))
      .filter((entity) => entity.fields.length);
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

  // The member's own follower count; the feed's own-entity match is only a fallback.
  const ownFollowers = await getFollowerCount(me.memberUrn);
  await sleep(REQUEST_DELAY_MS);

  // Posts arrive with engagement attached — one request, not one per post.
  const { posts, followerCount: feedFollowers, excludedPostUrns, postFeedComplete } =
    await getPostFeed(me.memberUrn);
  const followerCount = ownFollowers ?? feedFollowers;

  for (const post of posts) {
    const analytics = await getPostAnalytics(post.urn);
    post.metrics = { ...post.metrics, ...analytics };
    await sleep(REQUEST_DELAY_MS);
    // Who commented, so the author's own replies can be left out of the score. Only worth a
    // request when LinkedIn says there is something to read.
    if ((post.metrics.comments ?? 0) > 0) {
      post.comments = await getPostComments(post.urn);
      await sleep(REQUEST_DELAY_MS);
    } else {
      post.comments = [];
    }
  }

  return {
    me,
    profile: { followerCount, profileViews },
    posts,
    excludedPostUrns,
    postFeedComplete,
  };
}
