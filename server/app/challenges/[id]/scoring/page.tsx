import { useGetLeaderboard } from "@linkedin-challenge/client/react-query";
import { fmtDate } from "../../../../components/format";
import { Rules } from "../../../../components/rules";

export default function ChallengeScoringPage({ params }: { params: { id: string } }) {
  const challengeId = Number(params.id);
  const { data, isLoading } = useGetLeaderboard({ challengeId });
  if (isLoading) return <div className="spinner">Loading scoring rules…</div>;
  if (data?.status !== 200 || !data.data.competition) {
    return <div className="empty">Challenge not found.</div>;
  }
  const challenge = data.data.competition;
  return (
    <>
      <h1>How scoring works</h1>
      <p className="lede">
        <strong>{challenge.name}</strong> · {fmtDate(challenge.startAt)} → {fmtDate(challenge.endAt)}
      </p>
      <Rules config={challenge.config} />
      <h2>Data access</h2>
      <div className="panel">
        Joining this challenge grants it read access to your synced LinkedIn posts for scoring.
        Your posts remain owned by your account.
      </div>
    </>
  );
}
