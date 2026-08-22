// One member's results, LinkedIn-analytics style: the overall standing first, then each post
// behind it, grouped into the same weekly buckets the scoring uses. Shared by "My results" and
// the leaderboard drill-in — the manifest wants those to be the same view of the same data.
import { useGetMemberDetail } from "@linkedin-challenge/client/react-query";
import type { PostStat, WeekGroup } from "@linkedin-challenge/client";
import { useMemo, useState } from "react";
import { fmtInt, fmtNum, fmtDate, initials } from "./format";

type PostSort =
  | "newest"
  | "oldest"
  | "impressions"
  | "reactions"
  | "comments"
  | "reposts"
  | "sends"
  | "saves";

function Metric({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="metric">
      <span className="n">{fmtInt(value)}</span>
      <span className="k">{label}</span>
      {sub && <span className="k muted">{sub}</span>}
    </div>
  );
}

function Post({ post }: { post: PostStat }) {
  const total = post.impressionsInNetwork + post.impressionsOutOfNetwork;
  return (
    <div className="post">
      <p className="post-text">{post.textPreview || <span className="muted">(no preview)</span>}</p>
      <div className="metrics">
        <Metric label="Impressions" value={post.impressions} />
        <Metric label="Reactions" value={post.reactions} />
        {/* Only other people's comments score, so show that number and keep the raw total beside
            it — otherwise a post whose comments are all the author's own looks mis-scored. */}
        <Metric
          label={post.comments !== post.commentsByOthers ? "Comments (others)" : "Comments"}
          value={post.commentsByOthers}
          sub={post.comments !== post.commentsByOthers ? `${post.comments} total` : undefined}
        />
        <Metric label="Reposts" value={post.reposts} />
        <Metric label="Sends" value={post.sends} />
        <Metric label="Saves" value={post.saves} />
      </div>
      {(total > 0 || post.profileViewersFromPost > 0 || post.followersFromPost > 0) && (
        <div className="metrics" style={{ marginTop: 8 }}>
          {total > 0 && (
            <>
              <Metric
                label="In-network"
                value={post.impressionsInNetwork}
                sub={`${Math.round((post.impressionsInNetwork / total) * 100)}%`}
              />
              <Metric
                label="Out-of-network"
                value={post.impressionsOutOfNetwork}
                sub={`${Math.round((post.impressionsOutOfNetwork / total) * 100)}%`}
              />
            </>
          )}
          <Metric label="Profile views from post" value={post.profileViewersFromPost} />
          <Metric label="Followers from post" value={post.followersFromPost} />
        </div>
      )}
      <p className="small muted" style={{ marginBottom: 0, marginTop: 8 }}>
        {fmtDate(post.postedAt)}
        {post.permalink && (
          <>
            {" · "}
            <a href={post.permalink} target="_blank" rel="noreferrer">
              View on LinkedIn
            </a>
          </>
        )}
      </p>
    </div>
  );
}

function Week({ group, gradedPerWeek }: { group: WeekGroup; gradedPerWeek: number }) {
  const counted = Math.min(gradedPerWeek, group.posts.length);
  return (
    <section>
      <div className="week-head">
        <h3>Week {group.week + 1}</h3>
        <span className="small muted">
          {fmtDate(group.startAt)} → {fmtDate(group.endAt)} · {group.posts.length} post
          {group.posts.length === 1 ? "" : "s"}
          {group.posts.length > counted && `, best ${counted} scored`}
        </span>
      </div>
      {group.posts.map((post) => (
        <Post key={post.id} post={post} />
      ))}
    </section>
  );
}

function PostExplorer({ posts }: { posts: PostStat[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PostSort>("newest");
  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = needle
      ? posts.filter((post) => post.textPreview?.toLocaleLowerCase().includes(needle))
      : posts;
    const direction = sort === "oldest" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort === "newest" || sort === "oldest") {
        return direction * (a.postedAt - b.postedAt);
      }
      const difference = b[sort] - a[sort];
      return difference || b.postedAt - a.postedAt;
    });
  }, [posts, query, sort]);

  return (
    <section className="post-explorer">
      <div className="post-explorer-head">
        <div>
          <h2>Synced posts</h2>
          <p className="small muted">
            {shown.length === posts.length
              ? `${posts.length} post${posts.length === 1 ? "" : "s"}`
              : `${shown.length} of ${posts.length} posts`}
          </p>
        </div>
        <div className="post-controls">
          <label>
            <span>Filter posts</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search post text"
            />
          </label>
          <label>
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as PostSort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="impressions">Most impressions</option>
              <option value="reactions">Most reactions</option>
              <option value="comments">Most comments</option>
              <option value="reposts">Most reposts</option>
              <option value="sends">Most sends</option>
              <option value="saves">Most saves</option>
            </select>
          </label>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="empty">
          {posts.length === 0 ? "No posts have synced yet." : "No posts match that filter."}
        </div>
      ) : (
        <div className="post-list">
          {shown.map((post) => (
            <Post key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}

export function MemberResults({
  memberId,
  challengeId,
  backHref,
  backLabel,
}: {
  memberId: number;
  challengeId?: number;
  backHref?: string;
  backLabel?: string;
}) {
  const { data, isLoading } = useGetMemberDetail(
    memberId,
    challengeId !== undefined ? { challengeId } : undefined,
  );

  if (isLoading) return <div className="spinner">Loading results…</div>;
  if (data?.status !== 200) {
    return <div className="empty">We couldn&rsquo;t find that participant.</div>;
  }

  const detail = data.data;
  const { standing, competition, weeks, outsideWindow } = detail;
  const allPosts = [...weeks.flatMap((group) => group.posts), ...outsideWindow];

  return (
    <>
      {backHref && (
        <p className="small muted">
          <a href={backHref}>← {backLabel ?? "Back"}</a>
        </p>
      )}

      <div className="who" style={{ gap: 14, marginBottom: 4 }}>
        <span className="avatar" style={{ width: 48, height: 48, fontSize: 16 }}>
          {initials(detail.displayName)}
        </span>
        <h1 style={{ margin: 0 }}>{detail.displayName}</h1>
      </div>

      {detail.profileUrl && (
        <p className="small muted">
          <a href={detail.profileUrl} target="_blank" rel="noreferrer">
            LinkedIn profile
          </a>
        </p>
      )}

      {!competition ? (
        <p className="lede">
          No challenge is running yet. Your LinkedIn results will still sync and appear below.
        </p>
      ) : (
        <>
          <p className="lede">
            <strong>{competition.name}</strong> · {fmtDate(competition.startAt)} →{" "}
            {fmtDate(competition.endAt)}
          </p>

          {standing ? (
            <div className="grid cols-4">
              <div className="stat">
                <div className="k">Rank</div>
                <div className="v">#{standing.rank}</div>
              </div>
              <div className="stat">
                <div className="k">Total points</div>
                <div className="v">{fmtNum(standing.total)}</div>
              </div>
              <div className="stat">
                <div className="k">Followers</div>
                <div className="v">{fmtInt(standing.followerCount)}</div>
              </div>
              <div className="stat">
                <div className="k">Posts scored</div>
                <div className="v">
                  {standing.gradedPosts}
                  {standing.totalPosts > standing.gradedPosts && (
                    <span className="muted small"> / {standing.totalPosts}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty">No synced data inside the challenge window yet.</div>
          )}

          <h2>Posts by week</h2>
          {weeks.length === 0 ? (
            <div className="empty">No posts in the challenge window.</div>
          ) : (
            weeks.map((group) => (
              <Week
                key={group.week}
                group={group}
                gradedPerWeek={competition.config.maxPostsPerWeek}
              />
            ))
          )}

        </>
      )}

      <PostExplorer posts={allPosts} />
    </>
  );
}
