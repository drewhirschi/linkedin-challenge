// "How does this challenge work?" — the scoring rules in force for the current challenge, promoted
// to its own page: the manifest says participants should always be able to see the rules that
// produced the leaderboard.
import { useGetChallenges } from "@linkedin-challenge/client/react-query";
import { fmtDate } from "../../components/format";
import { Rules } from "../../components/rules";

export default function RulesPage() {
  const { data, isLoading } = useGetChallenges();

  if (isLoading) return <div className="spinner">Loading…</div>;
  if (data?.status !== 200) {
    return (
      <div className="empty">
        Your session expired. <a href="/auth/login">Log in again</a>.
      </div>
    );
  }

  const current = data.data.current;

  return (
    <>
      <h1>How scoring works</h1>
      {!current ? (
        <div className="empty">No challenge is set up yet, so there are no rules to show.</div>
      ) : (
        <>
          <p className="lede">
            The rules for <strong>{current.name}</strong> ({fmtDate(current.startAt)} →{" "}
            {fmtDate(current.endAt)}). The leaderboard is computed from these and nothing else.
          </p>
          <Rules config={current.config} />
          <h2>Where the numbers come from</h2>
          <div className="panel">
            <p style={{ marginTop: 0 }}>
              The browser extension reads the analytics LinkedIn shows you about your own posts —
              impressions, reactions, comments, reposts, saves, profile views and followers gained —
              using your own signed-in LinkedIn session, and syncs them here in the background.
            </p>
            <p style={{ marginBottom: 0 }}>
              It never sees your LinkedIn password and never touches anyone else&rsquo;s data.
              Installing it is what shares your analytics with your company for its challenges.
            </p>
          </div>
        </>
      )}
    </>
  );
}
