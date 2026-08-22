import { ChallengeLeaderboard } from "../../page";

export default function ChallengeLeaderboardPage({ params }: { params: { id: string } }) {
  return <ChallengeLeaderboard fixedChallengeId={Number(params.id)} />;
}
