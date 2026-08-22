// Challenges the signed-in user has explicitly joined.
import { useGetChallenges, useSetChallengeFavorite } from "@linkedin-challenge/client/react-query";
import { fmtDate } from "../../components/format";

export default function ChallengesPage() {
  const { data, isLoading, refetch } = useGetChallenges();
  const favorite = useSetChallengeFavorite();

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
        Your posts remain attached to your account. Favorite the challenges you want pinned in
        the sidebar.
      </p>

      {challenges.length === 0 ? (
        <div className="empty">No challenges yet.</div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Favorite</th>
                <th>Window</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={`/challenges/${c.id}`}>{c.name}</a>
                    {current?.id === c.id && <span className="badge ok" style={{ marginLeft: 8 }}>Current</span>}
                  </td>
                  <td>
                    <button
                      className="btn ghost sm favorite-button"
                      type="button"
                      aria-label={c.isFavorite ? `Unfavorite ${c.name}` : `Favorite ${c.name}`}
                      aria-pressed={c.isFavorite}
                      onClick={() => favorite.mutate(
                        { id: c.id, data: { favorite: !c.isFavorite } },
                        { onSuccess: () => void refetch() },
                      )}
                    >
                      {c.isFavorite ? "★" : "☆"}
                    </button>
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
