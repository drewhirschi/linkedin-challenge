import { useCreateInvites, useGetChallengeInvites, useGetLeaderboard } from "@linkedin-challenge/client/react-query";
import { useState } from "react";

export default function ChallengeInvitesPage({ params }: { params: { id: string } }) {
  const challengeId = Number(params.id);
  const [count, setCount] = useState(5);
  const challenge = useGetLeaderboard({ challengeId });
  const { data, isLoading, refetch } = useGetChallengeInvites(challengeId);
  const create = useCreateInvites();
  const info = challenge.data?.status === 200 ? challenge.data.data.competition : undefined;

  if (isLoading || challenge.isLoading) return <div className="spinner">Loading invites…</div>;
  if (!info?.isOwner || data?.status !== 200) return <div className="empty">Challenge not found.</div>;

  return (
    <>
      <h1>Invites</h1>
      <p className="lede">Invite people to <strong>{info.name}</strong>. Joining grants this challenge read access to their synced posts.</p>
      <div className="panel">
        <form onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ id: challengeId, data: { count } }, { onSuccess: () => void refetch() });
        }}>
          <label className="field" style={{ maxWidth: 180 }}>
            <span>How many codes</span>
            <input type="number" min={1} max={100} value={count} onChange={(event) => setCount(Number(event.target.value))} />
          </label>
          <button type="submit" disabled={create.isPending}>{create.isPending ? "Generating…" : "Generate invites"}</button>
        </form>
      </div>
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {data.data.invites.length === 0 ? <div className="empty">No invites yet.</div> : (
          <table><thead><tr><th>Code</th><th>Status</th></tr></thead><tbody>
            {data.data.invites.map((invite) => <tr key={invite.code}><td><span className="code">{invite.code}</span></td><td><span className={`badge ${invite.redeemed ? "muted" : "ok"}`}>{invite.redeemed ? "Redeemed" : "Open"}</span></td></tr>)}
          </tbody></table>
        )}
      </div>
    </>
  );
}
