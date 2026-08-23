// The leaderboard — the app's landing page, answering "how is everyone doing?". A switcher covers
// orgs running more than one challenge; the default is whichever the server considers current.
import { useState } from "react";
import { useGetLeaderboard, useGetChallengeAggregate, useGetMe } from "@linkedin-challenge/client/react-query";
import { fmtInt, fmtNum, fmtDate, initials } from "../components/format";

// The extra numbers an organiser wants while looking at a board — inline rather than on a
// separate screen, because "how is this challenge doing" is the same question the board answers,
// just wider.
function AdminStrip({ challengeId, enabled }: { challengeId: number; enabled: boolean }) {
  const { data } = useGetChallengeAggregate({ challengeId }, { query: { enabled } });
  if (!enabled || data?.status !== 200) return null;
  const a = data.data;

  const cells: [string, string][] = [
    ["Members", fmtInt(a.participants)],
    ["Scoring", fmtInt(a.scoringParticipants)],
    ["Posts in window", fmtInt(a.totalPosts)],
    ["Posts graded", fmtInt(a.gradedPosts)],
    ["Impressions", fmtInt(a.totalImpressions)],
    ["Reactions", fmtInt(a.totalReactions)],
    ["Comments", fmtInt(a.totalComments)],
    ["Reposts", fmtInt(a.totalReposts)],
    ["Latest reported followers", fmtInt(a.totalFollowers)],
    ["Points awarded", fmtNum(a.totalPoints)],
    ["Invites", `${a.invitesRedeemed} used / ${a.invitesOpen} open`],
  ];

  return (
    <div className="admin-strip">
      <div className="k" style={{ marginBottom: 8 }}>
        Organiser view
      </div>
      <div className="metrics">
        {cells.map(([k, v]) => (
          <div className="metric" key={k}>
            <span className="n">{v}</span>
            <span className="k">{k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChallengeLeaderboard({ fixedChallengeId }: { fixedChallengeId?: number }) {
  // undefined = "whatever the org's current challenge is"; a number = an explicit pick.
  const [challengeId, setChallengeId] = useState<number | undefined>(undefined);
  const selectedChallengeId = fixedChallengeId ?? challengeId;
  const { data, isLoading } = useGetLeaderboard(
    selectedChallengeId !== undefined ? { challengeId: selectedChallengeId } : undefined,
  );
  const { data: meData } = useGetMe();
  const me = meData?.status === 200 ? meData.data : undefined;

  if (isLoading) return <div className="spinner">Loading leaderboard…</div>;
  if (data?.status !== 200) {
    return (
      <div className="empty">
        Your session expired. <a href="/auth/login">Log in again</a>.
      </div>
    );
  }

  const { competition, challenges, standings } = data.data;

  if (!competition) {
    return (
      <>
        <h1>Leaderboard</h1>
        <div className="empty">
          No challenge yet.
          {me?.isAdmin ? (
            <>
              {" "}
              <a href="/admin/challenges">Set one up</a> to start scoring.
            </>
          ) : (
            " Your admin hasn't set one up yet."
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="week-head">
        <h1 style={{ margin: 0 }}>{competition.name}</h1>
        {fixedChallengeId === undefined && challenges.length > 1 && (
          <select
            value={competition.id}
            onChange={(e) => setChallengeId(Number(e.target.value))}
            aria-label="Challenge"
          >
            {challenges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="lede">
        {fmtDate(competition.startAt)} → {fmtDate(competition.endAt)}
        {competition.isActive && (
          <>
            {" · "}
            <span className="badge ok">Active</span>
          </>
        )}
        {" · "}
        <a href={`/challenges/${competition.id}/scoring`}>How scoring works</a>
      </p>

      <AdminStrip challengeId={competition.id} enabled={competition.isOwner} />

      <div className="panel" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
        {standings.length === 0 ? (
          <div className="empty">
            Nobody has synced data for this challenge yet. Standings appear once people connect
            the extension.
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
                <tr key={row.memberId} className={row.memberId === me?.memberId ? "me-row" : undefined}>
                  <td className={`rank r${row.rank}`}>{row.rank}</td>
                  <td>
                    <a
                      className="who"
                      href={
                        `/members/${row.memberId}?challengeId=${competition.id}`
                      }
                    >
                      <span className="avatar">{initials(row.displayName)}</span>
                      <span>
                        {row.displayName}
                        {row.memberId === me?.memberId && <span className="muted"> (you)</span>}
                      </span>
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

      <p className="small muted">
        Click any participant to see the posts behind their score. Scores are computed fresh from
        the latest synced numbers every time this page loads — nothing is stored.
      </p>
    </>
  );
}

export default function LeaderboardPage() {
  return <ChallengeLeaderboard />;
}
