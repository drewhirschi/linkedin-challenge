// The product operator's panel: every org, every member, and impersonation — the support tool for
// "what is this user actually seeing?". Reachable only with the system-admin flag.
import { useGetSystemOverview, useImpersonate } from "@linkedin-challenge/client/react-query";
import { fmtDate, initials } from "../../components/format";

export default function SystemPanel() {
  const { data, isLoading } = useGetSystemOverview();
  const impersonate = useImpersonate();

  if (isLoading) return <div className="spinner">Loading…</div>;
  if (data?.status !== 200) {
    return (
      <div className="empty">
        Your session expired. <a href="/auth/login">Log in again</a>.
      </div>
    );
  }

  const { orgs } = data.data;

  return (
    <>
      <h1>All organizations</h1>
      <p className="lede">
        Every company on the platform. &ldquo;View as&rdquo; swaps your session for theirs — you
        see exactly what they see, with a banner in the sidebar until you stop.
      </p>

      {orgs.map((org) => (
        <section key={org.id}>
          <div className="week-head">
            <h2 style={{ margin: 0 }}>{org.name}</h2>
            <span className="small muted">
              /{org.slug} · created {fmtDate(org.createdAt)}
              {org.activeChallenge && (
                <>
                  {" · "}
                  <span className="badge ok">{org.activeChallenge}</span>
                </>
              )}
            </span>
          </div>
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Last sync</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {org.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="who">
                        <span className="avatar">{initials(m.displayName)}</span>
                        <span>{m.displayName}</span>
                      </span>
                    </td>
                    <td className="small muted">{m.email ?? "—"}</td>
                    <td className="small">
                      {m.isSystemAdmin ? (
                        <span className="badge">system</span>
                      ) : m.isAdmin ? (
                        <span className="badge ok">admin</span>
                      ) : (
                        <span className="muted">participant</span>
                      )}
                    </td>
                    <td className="small muted">
                      {m.lastSyncedAt ? fmtDate(m.lastSyncedAt) : "never"}
                    </td>
                    <td className="num">
                      {!m.isSystemAdmin && (
                        <button
                          className="btn ghost sm"
                          type="button"
                          disabled={impersonate.isPending}
                          onClick={() =>
                            impersonate.mutate(
                              { data: { memberId: m.id } },
                              {
                                // Full document load: the cookie changed, so every cached query
                                // is answering as the wrong user.
                                onSuccess: (res) => {
                                  if (res.status === 200) window.location.href = "/";
                                },
                              },
                            )
                          }
                        >
                          View as
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
