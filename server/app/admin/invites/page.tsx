// Invite management: mint codes, see who has redeemed. Joining the company is what enrolls
// someone — there is no per-challenge invitation.
import { useGetAdminOverview, useCreateInvites, getGetAdminOverviewQueryKey } from "@linkedin-challenge/client/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function MintInvites({ onCreated }: { onCreated: () => void }) {
  const [count, setCount] = useState(5);
  const [role, setRole] = useState("participant");
  const create = useCreateInvites();

  return (
    <div className="panel">
      <h3>Generate invites</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ data: { count, role } }, { onSuccess: onCreated });
        }}
      >
        <div className="field row">
          <label className="field" style={{ margin: 0 }}>
            <span>How many</span>
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="participant">Participant</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? "Generating…" : "Generate"}
        </button>
      </form>
    </div>
  );
}

export default function InvitesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAdminOverview();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });

  if (isLoading) return <div className="spinner">Loading…</div>;
  if (data?.status !== 200) {
    return (
      <div className="empty">
        Your session expired. <a href="/auth/login">Log in again</a>.
      </div>
    );
  }

  const { invites } = data.data;

  return (
    <>
      <h1>Invites</h1>
      <p className="lede">
        Share a code with a teammate. They redeem it on the join page, then sign into the Challenge
        Sync extension with the same account — that connects their LinkedIn analytics.
      </p>

      <MintInvites onCreated={refresh} />

      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {invites.length === 0 ? (
          <div className="empty">No invites yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.code}>
                  <td>
                    <span className="code">{i.code}</span>
                  </td>
                  <td className="small muted">{i.role}</td>
                  <td>
                    <span className={`badge ${i.redeemed ? "muted" : "ok"}`}>
                      {i.redeemed ? "Redeemed" : "Open"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
