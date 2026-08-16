// A teammate's results — reached from a leaderboard row. Same component as "My results": the
// manifest wants the admin's and the participant's view to be the same information.
import { MemberResults } from "../../../components/member-results";

export default function MemberPage({ params }: { params: { id: string } }) {
  // The board links carry ?challengeId= so the detail describes the same window as the row.
  const challengeId =
    typeof window !== "undefined"
      ? Number(new URLSearchParams(window.location.search).get("challengeId")) || undefined
      : undefined;

  return (
    <MemberResults
      memberId={Number(params.id)}
      challengeId={challengeId}
      backHref="/"
      backLabel="Leaderboard"
    />
  );
}
