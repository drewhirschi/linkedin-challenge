import { useAcceptChallengeInvite, useGetMe, useGetMyInvites, getGetChallengesQueryKey } from "@linkedin-challenge/client/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { fmtDate } from "../../components/format";

export default function AccountPage() {
  const me = useGetMe();
  const { data, isLoading, refetch } = useGetMyInvites();
  const accept = useAcceptChallengeInvite();
  const queryClient = useQueryClient();
  const account = me.data?.status === 200 ? me.data.data : undefined;

  if (isLoading || me.isLoading) return <div className="spinner">Loading account…</div>;
  if (!account?.signedIn || data?.status !== 200) return <div className="empty">Your session expired. <a href="/auth/login">Log in again</a>.</div>;

  return (
    <>
      <h1>{account.displayName}</h1>
      <p className="lede">Your account and challenge invitations.</p>

      <h2>Challenge invitations</h2>
      {data.data.invites.length === 0 ? (
        <div className="empty">You don&rsquo;t have any pending invitations.</div>
      ) : data.data.invites.map((invite) => (
        <div className="panel" key={invite.code}>
          <div className="week-head" style={{ marginTop: 0 }}>
            <h3>{invite.challengeName}</h3>
          </div>
          <p className="muted">Invited by {invite.invitedBy} · {fmtDate(invite.startAt)} → {fmtDate(invite.endAt)}</p>
          <div className="notice" style={{ marginBottom: 16 }}>
            If you accept, this challenge can read and score the LinkedIn posts and analytics synced to your account for its challenge period. Your posts remain owned by your account.
          </div>
          <button
            type="button"
            disabled={accept.isPending}
            onClick={() => accept.mutate({ code: invite.code }, {
              onSuccess: (response) => {
                if (response.status !== 200) return;
                void refetch();
                void queryClient.invalidateQueries({ queryKey: getGetChallengesQueryKey() });
              },
            })}
          >
            {accept.isPending ? "Accepting…" : "Accept and share my challenge-period data"}
          </button>
        </div>
      ))}
    </>
  );
}
