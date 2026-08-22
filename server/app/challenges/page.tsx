// Challenges the signed-in user has explicitly joined.
import { useGetChallenges } from "@linkedin-challenge/client/react-query";
import { fmtDate } from "../../components/format";

export default function ChallengesPage() {
  const { data, isLoading } = useGetChallenges();

  if (isLoading) return <div className="spinner">Loading…</div>;
  if (data?.status !== 200) {
    return (
      <div className="empty">
        Your session expired. <a href="/auth/login">Log in again</a>.
      </div>
    );
  }

  const { challenges, current } = data.data;
  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <h1>Challenges</h1>
      <p className="lede">
        Joining a challenge gives that challenge permission to read and score your synced posts.
        Your posts remain attached to your account.
      </p>

      {challenges.length === 0 ? (
        <div className="empty">No challenges yet.</div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Window</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href="/">{c.name}</a>
                    {current?.id === c.id && <span className="badge ok" style={{ marginLeft: 8 }}>Current</span>}
                  </td>
                  <td className="small muted">
                    {fmtDate(c.startAt)} → {fmtDate(c.endAt)}
                  </td>
                  <td>
                    <span className={`badge ${c.isActive && c.endAt >= now ? "ok" : "muted"}`}>
                      {c.isActive && c.endAt >= now ? "Running" : "Finished"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
