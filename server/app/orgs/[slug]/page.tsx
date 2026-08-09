// Public leaderboard for an org's active competition, plus a plain-language explanation of the
// scoring rules in force — so participants can see how points are earned rather than guess.
import { useGetLeaderboard, fmtInt, fmtNum, fmtRate, fmtDate, initials } from "@server/client";
import type { ScoringConfig } from "@server/client";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

function Rules({ config }: { config: ScoringConfig }) {
  return (
    <div className="panel">
      <dl className="rules" style={{ margin: 0 }}>
        <dt>Each post earns</dt>
        <dd>
          {fmtRate(config.perReaction)} per reaction · {fmtRate(config.perComment)} per comment ·{" "}
          {fmtRate(config.perRepost)} per repost · {fmtRate(config.perSend)} per send ·{" "}
          {fmtRate(config.perSave)} per save · {fmtRate(config.perImpression)} per impression.
        </dd>

        <dt>Only other people&rsquo;s comments count</dt>
        <dd>
          Comments you leave on your own posts are excluded, so replying to your own thread
          doesn&rsquo;t earn points.
        </dd>

        <dt>Your profile earns</dt>
        <dd>
          {fmtRate(config.perFollowerGained)} per follower gained ·{" "}
          {fmtRate(config.perProfileView)} per profile view, counted across the whole window.
        </dd>

        <dt>Only your best {config.maxPostsPerWeek} posts each week count</dt>
        <dd>
          Post more than {config.maxPostsPerWeek} times in a week and only the highest-scoring{" "}
          {config.maxPostsPerWeek} score. Volume alone doesn&rsquo;t win.
        </dd>

        <dt>{config.normalizeByFollowers ? "Scores are follower-normalized" : "Raw engagement"}</dt>
        <dd>
          {config.normalizeByFollowers
            ? `Post points are scaled to a ${fmtInt(config.followerBaseline)}-follower baseline, so a small
               account and a large one compete on equal terms.`
            : "Post points are counted as-is, with no adjustment for audience size."}
        </dd>
      </dl>
    </div>
  );
}

export default function OrgLeaderboard({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const { data, isLoading } = useGetLeaderboard(slug);

  if (isLoading) return <div className="spinner">Loading leaderboard…</div>;
  if (data?.status !== 200) return <div className="empty">That organization doesn&rsquo;t exist.</div>;

  const { org, competition, standings } = data.data;

  if (!competition) {
    return (
      <>
        <h1>{org.name}</h1>
        <p className="lede">No competition is running yet.</p>
      </>
    );
  }

  const cfg = competition.config;

  return (
    <>
      <h1>{org.name}</h1>
      <p className="lede">
        <strong>{competition.name}</strong> · {fmtDate(competition.startAt)} →{" "}
        {fmtDate(competition.endAt)}
        {competition.isActive && (
          <>
            {" · "}
            <span className="badge ok">Active</span>
          </>
        )}
      </p>

      <div className="grid cols-3">
        <Stat label="Participants" value={fmtInt(standings.length)} />
        <Stat label="Max posts / week" value={String(cfg.maxPostsPerWeek)} />
        <Stat label="Follower-normalized" value={cfg.normalizeByFollowers ? "Yes" : "No"} />
      </div>

      <div className="panel" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        {standings.length === 0 ? (
          <div className="empty">
            Nobody has synced any data yet. Standings appear once participants link the extension.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Participant</th>
                <th className="num">Followers</th>
                <th className="num">Posts</th>
                <th className="num">Post pts</th>
                <th className="num">Profile pts</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.memberId}>
                  <td className={`rank r${row.rank}`}>{row.rank}</td>
                  <td>
                    <a className="who" href={`/orgs/${slug}/members/${row.memberId}`}>
                      <span className="avatar">{initials(row.displayName)}</span>
                      <span>{row.displayName}</span>
                    </a>
                  </td>
                  <td className="num">{fmtInt(row.followerCount)}</td>
                  <td className="num">
                    {row.gradedPosts}
                    {row.totalPosts > row.gradedPosts && (
                      <span className="muted small"> / {row.totalPosts}</span>
                    )}
                  </td>
                  <td className="num">{fmtNum(row.postPoints)}</td>
                  <td className="num">{fmtNum(row.profilePoints)}</td>
                  <td className="num">
                    <strong>{fmtNum(row.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2>How this challenge is scored</h2>
      <Rules config={cfg} />

      <p className="small muted">
        Click any participant to see their posts, week by week. Scores are computed fresh from the
        latest synced numbers every time this page loads — nothing is stored.
      </p>
    </>
  );
}
