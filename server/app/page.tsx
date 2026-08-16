// Home: the competitions you're in, and where you stand in each. Scoped to the viewer rather than
// listing every org, because "what am I competing in" is the question someone signing in has.
import { useGetMyCompetitions, useGetMe } from "@linkedin-challenge/client/react-query";
import { fmtInt, fmtNum, fmtDate } from "../components/format";

export default function Home() {
  const { data, isLoading } = useGetMyCompetitions();
  const { data: meData } = useGetMe();
  const me = meData?.status === 200 ? meData.data : undefined;
  const mine = data?.status === 200 ? data.data : [];

  if (isLoading) return <div className="spinner">Loading…</div>;

  return (
    <>
      <h1>Your challenges</h1>

      {mine.length === 0 ? (
        <div className="empty">
          You&rsquo;re not in any competitions yet.
          {me?.isAdmin && me.orgSlug && (
            <>
              {" "}
              <a href={`/orgs/${me.orgSlug}/admin`}>Set one up</a>.
            </>
          )}
        </div>
      ) : (
        <div className="grid cols-2">
          {mine.map(({ org, competition, standing, entrants }) => (
            <div className="panel" key={competition.id}>
              <h2 style={{ marginTop: 0 }}>
                <a href={`/orgs/${org.slug}/c/${competition.id}`}>{competition.name}</a>
              </h2>
              <p className="small muted" style={{ marginTop: 0 }}>
                {org.name} · {fmtDate(competition.startAt)} → {fmtDate(competition.endAt)}
                {competition.isActive && (
                  <>
                    {" · "}
                    <span className="badge ok">Active</span>
                  </>
                )}
              </p>

              {standing ? (
                <div className="grid cols-3">
                  <div className="stat">
                    <div className="k">Your rank</div>
                    <div className="v">
                      #{standing.rank}
                      <span className="muted small"> / {fmtInt(entrants)}</span>
                    </div>
                  </div>
                  <div className="stat">
                    <div className="k">Your points</div>
                    <div className="v">{fmtNum(standing.total)}</div>
                  </div>
                  <div className="stat">
                    <div className="k">Posts scored</div>
                    <div className="v">{standing.gradedPosts}</div>
                  </div>
                </div>
              ) : (
                <p className="small muted">
                  Nothing scored yet — sync from the extension to appear on the board.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
