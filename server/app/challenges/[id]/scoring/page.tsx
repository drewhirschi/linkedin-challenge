// Scoring: the rules in force, then the viewer's own accounting under them — every post in the
// window, what each earned, which ones counted, and how the weekly and streak points add up.
// The ledger is produced by the same pass that ranks the board, so the two can never disagree.
import { useGetLeaderboard } from "@linkedin-challenge/client/react-query";
import type { Ledger, LedgerPost, LedgerWeek, ScoringConfig } from "@linkedin-challenge/client";
import { fmtDate, fmtInt, fmtNum } from "../../../../components/format";
import { Rules } from "../../../../components/rules";

const dateUtc = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

function PostLine({ post, cfg, factor }: { post: LedgerPost; cfg: ScoringConfig; factor: number }) {
  const capped = post.cappedEngagement < post.rawEngagement;
  return (
    <tr className={post.counted ? undefined : "ledger-dropped"}>
      <td>
        <div className="ledger-post">
          <a href={post.permalink} target="_blank" rel="noreferrer">{dateUtc(post.postedAt)}</a>
          {post.isRepost && <span className="badge muted">Repost</span>}
          {!post.counted && <span className="badge muted">Not counted</span>}
          {post.noData && <span className="badge muted">No data yet</span>}
        </div>
        <div className="small muted ledger-excerpt">{post.textPreview || "(no post text)"}</div>
      </td>
      <td className="num">{fmtInt(post.comments)}{post.commentsTotal !== post.comments && <span className="muted small"> / {fmtInt(post.commentsTotal)}</span>}</td>
      <td className="num">{fmtInt(post.reactions)}</td>
      <td className="num">
        {fmtNum(post.rawEngagement)}
        {capped && <span className="muted small"> → {fmtNum(post.cappedEngagement)}</span>}
      </td>
      <td className="num">{post.counted ? fmtNum(post.scaledEngagement) : <span className="muted">—</span>}</td>
      <td className="num">{post.counted ? fmtNum(post.showUpPoints) : <span className="muted">—</span>}</td>
      <td className="num"><strong>{post.counted ? fmtNum(post.scaledEngagement + post.showUpPoints) : "0"}</strong></td>
    </tr>
  );
}

function WeekBlock({ week, cfg, factor }: { week: LedgerWeek; cfg: ScoringConfig; factor: number }) {
  return (
    <section className="ledger-week">
      <div className="week-head">
        <h3>Week {week.week}</h3>
        <span className="small muted">
          {dateUtc(week.startAt)} → {dateUtc(week.endAt)} · {week.posts.length} post{week.posts.length === 1 ? "" : "s"}
          {week.posts.length > cfg.maxPostsPerWeek && `, best ${cfg.maxPostsPerWeek} count`}
        </span>
        <span className="ledger-week-total">
          {fmtNum(week.total)} pts
          <span className="muted small">
            {" "}· show up {fmtNum(week.showUpPoints)} · active week {fmtNum(week.activeWeekPoints)} · engagement {fmtNum(week.engagementPoints)}
          </span>
        </span>
      </div>
      {week.posts.length === 0 ? (
        <div className="small muted" style={{ padding: "6px 0 2px" }}>No posts. No active-week points.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="ledger">
            <thead>
              <tr>
                <th>Post</th>
                <th className="num">Comments</th>
                <th className="num">Likes</th>
                <th className="num">Engagement</th>
                <th className="num">× {fmtNum(factor)}</th>
                <th className="num">Show up</th>
                <th className="num">Points</th>
              </tr>
            </thead>
            <tbody>
              {week.posts.map((post) => <PostLine key={post.postId} post={post} cfg={cfg} factor={factor} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Accounting({ ledger, cfg }: { ledger: Ledger; cfg: ScoringConfig }) {
  const factor = ledger.followerFactor;
  // Newest first, and weeks that haven't started yet are left out — five "no posts" rows for the
  // future say nothing about where the points came from.
  const now = Math.floor(Date.now() / 1000);
  const weeks = ledger.weeks.filter((week) => week.startAt <= now).reverse();
  return (
    <>
      <h2>Your points, line by line</h2>
      <div className="grid cols-4">
        <Tile label="Total" value={fmtNum(ledger.total)} />
        <Tile
          label="Show up"
          value={fmtNum(ledger.showUpPoints)}
          sub={`${fmtInt(ledger.showUpPoints / Math.max(1, cfg.perPost))} counted posts × ${fmtNum(cfg.perPost)}`}
        />
        <Tile
          label="Consistency"
          value={fmtNum(ledger.consistencyPoints)}
          sub={`${ledger.activeWeeks} active weeks × ${fmtNum(cfg.perActiveWeek)}${ledger.streakBonus ? ` + ${fmtNum(ledger.streakBonus)} for a ${ledger.bestStreakWeeks}-week streak` : ""}`}
        />
        <Tile
          label="Engagement"
          value={fmtNum(ledger.engagementPoints)}
          sub={
            ledger.followersUnknown
              ? "not scaled: no follower count synced yet"
              : `${fmtNum(ledger.unscaledEngagementPoints)} × ${fmtNum(factor)} (${fmtInt(cfg.followerBaseline)} ÷ ${fmtInt(ledger.followerCount)} followers)`
          }
        />
      </div>
      {ledger.profilePoints > 0 && (
        <p className="small muted">Plus {fmtNum(ledger.profilePoints)} profile points (followers gained and profile views).</p>
      )}
      {cfg.normalizeByFollowers && (
        <p className="small muted">
          Engagement is scaled to a {fmtInt(cfg.followerBaseline)}-follower baseline: a comment on a
          {" "}{fmtInt(cfg.followerBaseline)}-follower account and a comment on a{" "}
          {fmtInt(cfg.followerBaseline * 4)}-follower account are worth 5 and 1.25 points respectively.
          {ledger.followersUnknown && " Your follower count hasn't synced, so your engagement currently counts at full rate."}
        </p>
      )}
      {weeks.map((week) => <WeekBlock key={week.week} week={week} cfg={cfg} factor={factor} />)}
    </>
  );
}

export default function ChallengeScoringPage({ params }: { params: { id: string } }) {
  const challengeId = Number(params.id);
  const { data, isLoading } = useGetLeaderboard({ challengeId });
  if (isLoading) return <div className="spinner">Loading scoring…</div>;
  if (data?.status !== 200 || !data.data.competition) {
    return <div className="empty">Challenge not found.</div>;
  }
  const { competition, viewerLedger } = data.data;
  return (
    <>
      <h1>Scoring</h1>
      <p className="lede">
        <strong>{competition.name}</strong> · {fmtDate(competition.startAt)} → {fmtDate(competition.endAt)}
      </p>
      <Rules config={competition.config} />
      {viewerLedger ? (
        <Accounting ledger={viewerLedger} cfg={competition.config} />
      ) : (
        <div className="empty">
          You don&rsquo;t have any synced data in this challenge yet. Connect the extension and your
          accounting will appear here.
        </div>
      )}
    </>
  );
}
