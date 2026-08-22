import { useGetLeaderboard } from "@linkedin-challenge/client/react-query";
import { fmtDate } from "../../../../components/format";
import { Rules } from "../../../../components/rules";

export default function ChallengeManagementPage({ params }: { params: { id: string } }) {
  const challengeId = Number(params.id);
  const { data, isLoading } = useGetLeaderboard({ challengeId });
  if (isLoading) return <div className="spinner">Loading challenge…</div>;
  const challenge = data?.status === 200 ? data.data.competition : undefined;
  if (!challenge?.isOwner) return <div className="empty">Challenge not found.</div>;
  return (
    <>
      <h1>Management</h1>
      <p className="lede"><strong>{challenge.name}</strong> · {fmtDate(challenge.startAt)} → {fmtDate(challenge.endAt)}</p>
      <div className="panel">
        <p style={{ marginTop: 0 }}>You created this challenge and can manage its invitations and scoring configuration.</p>
        <p style={{ marginBottom: 0 }}><a className="btn" href={`/challenges/${challenge.id}/invites`}>Manage invites</a></p>
      </div>
      <h2>Scoring configuration</h2>
      <Rules config={challenge.config} />
    </>
  );
}
