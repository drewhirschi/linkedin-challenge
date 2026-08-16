// One member's results, LinkedIn-analytics style: the overall standing first, then each post
// behind it, grouped into the same weekly buckets the scoring uses. Shared by "My results" and
// the leaderboard drill-in — the manifest wants those to be the same view of the same data.
import { useGetMemberDetail } from "@linkedin-challenge/client/react-query";
import type { PostStat, WeekGroup } from "@linkedin-challenge/client";
import { fmtInt, fmtNum, fmtDate, initials } from "./format";

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
        <p className="lede">No challenge is running, so there&rsquo;s nothing scored yet.</p>
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

          {outsideWindow.length > 0 && (
            <>
              <h2>Outside the window</h2>
              <p className="small muted">
                We hold analytics for these, but they fall outside {competition.name} and score
                nothing.
              </p>
              {outsideWindow.map((post) => (
                <Post key={post.id} post={post} />
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
