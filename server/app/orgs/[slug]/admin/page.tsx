// Admin dashboard: org-wide aggregate progress, competition creation with the full scoring
// configuration, and invite management.
import {
  useGetAdminOverview,
  useCreateCompetition,
  useCreateInvites,
  getGetAdminOverviewQueryKey,
  fmtInt,
  fmtNum,
  fmtDate,
  initials,
} from "@server/client";
import type { ScoringConfig } from "@server/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field" style={{ margin: 0 }}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function NewCompetition({ slug, defaults, onCreated }: { slug: string; defaults: ScoringConfig; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState(isoDate());
  const [end, setEnd] = useState(isoDate(90));
  const [cfg, setCfg] = useState<ScoringConfig>(defaults);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateCompetition();

  const set = (patch: Partial<ScoringConfig>) => setCfg({ ...cfg, ...patch });

  return (
    <div className="panel">
      <h3>New competition</h3>
      {error && <div className="notice err">{error}</div>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate(
            { slug, data: { name, start, end, config: cfg } },
            {
              onSuccess: (res) => {
                if (res.status === 200) {
                  setName("");
                  onCreated();
                } else {
                  setError(res.data?.error ?? "Could not create the competition.");
                }
              },
              onError: () => setError("Could not create the competition."),
            },
          );
        }}
      >
        <div className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q3 Posting Sprint"
            required
          />
        </div>
        <div className="field row">
          <label className="field" style={{ margin: 0 }}>
            <span>Start</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span>End</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>

        <h4 className="muted small" style={{ margin: "14px 0 8px" }}>
          POST ENGAGEMENT POINTS
        </h4>
        <div className="grid cols-2">
          <NumberField
            label="Max posts graded / week"
            value={cfg.maxPostsPerWeek}
            step="1"
            onChange={(n) => set({ maxPostsPerWeek: n })}
          />
          <NumberField
            label="Points per impression"
            value={cfg.perImpression}
            step="0.001"
            onChange={(n) => set({ perImpression: n })}
          />
          <NumberField
            label="Points per reaction"
            value={cfg.perReaction}
            step="0.1"
            onChange={(n) => set({ perReaction: n })}
          />
          <NumberField
            label="Points per comment"
            value={cfg.perComment}
            step="0.1"
            onChange={(n) => set({ perComment: n })}
          />
          <NumberField
            label="Points per repost"
            value={cfg.perRepost}
            step="0.1"
            onChange={(n) => set({ perRepost: n })}
          />
          <NumberField
            label="Points per send"
            value={cfg.perSend}
            step="0.1"
            onChange={(n) => set({ perSend: n })}
          />
          <NumberField
            label="Points per save"
            value={cfg.perSave}
            step="0.1"
            onChange={(n) => set({ perSave: n })}
          />
        </div>

        <h4 className="muted small" style={{ margin: "14px 0 8px" }}>
          PROFILE POINTS
        </h4>
        <div className="grid cols-2">
          <NumberField
            label="Points per follower gained"
            value={cfg.perFollowerGained}
            step="0.1"
            onChange={(n) => set({ perFollowerGained: n })}
          />
          <NumberField
            label="Points per profile view"
            value={cfg.perProfileView}
            step="0.1"
            onChange={(n) => set({ perProfileView: n })}
          />
        </div>

        <h4 className="muted small" style={{ margin: "14px 0 8px" }}>
          NORMALIZATION
        </h4>
        <div className="grid cols-2">
          <label
            className="field"
            style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={cfg.normalizeByFollowers}
              onChange={(e) => set({ normalizeByFollowers: e.target.checked })}
              style={{ width: "auto" }}
            />
            <span style={{ margin: 0 }}>Normalize post points by follower count</span>
          </label>
          <NumberField
            label="Follower baseline"
            value={cfg.followerBaseline}
            step="1"
            onChange={(n) => set({ followerBaseline: n })}
          />
        </div>

        <p style={{ marginTop: 16 }}>
          <button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create competition"}
          </button>
        </p>
      </form>
    </div>
  );
}

function Invites({ slug, onCreated }: { slug: string; onCreated: () => void }) {
  const [count, setCount] = useState(5);
  const [role, setRole] = useState("participant");
  const create = useCreateInvites();

  return (
    <div className="panel">
      <h3>Generate invites</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ slug, data: { count, role } }, { onSuccess: onCreated });
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

export default function AdminDashboard({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAdminOverview(slug);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey(slug) });

  if (isLoading) return <div className="spinner">Loading dashboard…</div>;
  if (data?.status !== 200) {
    return (
      <div className="empty">
        Your session expired. <a href="/auth/login">Log in again</a>.
      </div>
    );
  }

  const { org, competitions, current, standings, invites, aggregate, defaults } = data.data;

  return (
    <>
      <h1>Dashboard</h1>
      <p className="lede">
        {org.name} · public leaderboard: <a href={`/orgs/${org.slug}`}>/orgs/{org.slug}</a>
      </p>

      <h2>Progress</h2>
      {!current ? (
        <div className="empty">No competition running. Create one below to start scoring.</div>
      ) : (
        <>
          <p className="small muted">
            {current.name} · {fmtDate(current.startAt)} → {fmtDate(current.endAt)}
          </p>
          <div className="grid cols-4">
            <Stat label="Participants" value={fmtInt(aggregate.participants)} />
            <Stat label="Scoring" value={fmtInt(aggregate.scoringParticipants)} />
            <Stat label="Posts in window" value={fmtInt(aggregate.totalPosts)} />
            <Stat label="Posts graded" value={fmtInt(aggregate.gradedPosts)} />
          </div>
          <div className="grid cols-4" style={{ marginTop: 12 }}>
            <Stat label="Impressions" value={fmtInt(aggregate.totalImpressions)} />
            <Stat label="Reactions" value={fmtInt(aggregate.totalReactions)} />
            <Stat label="Comments" value={fmtInt(aggregate.totalComments)} />
            <Stat label="Reposts" value={fmtInt(aggregate.totalReposts)} />
          </div>
          <div className="grid cols-3" style={{ marginTop: 12 }}>
            <Stat label="Combined followers" value={fmtInt(aggregate.totalFollowers)} />
            <Stat label="Total points awarded" value={fmtNum(aggregate.totalPoints)} />
            <Stat
              label="Invites"
              value={`${aggregate.invitesRedeemed} used / ${aggregate.invitesOpen} open`}
            />
          </div>

          <h2>Standings</h2>
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            {standings.length === 0 ? (
              <div className="empty">Nobody has synced data yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Participant</th>
                    <th className="num">Followers</th>
                    <th className="num">Posts</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((row) => (
                    <tr key={row.memberId}>
                      <td className={`rank r${row.rank}`}>{row.rank}</td>
                      <td>
                        <a className="who" href={`/orgs/${org.slug}/members/${row.memberId}`}>
                          <span className="avatar">{initials(row.displayName)}</span>
                          <span>{row.displayName}</span>
                        </a>
                      </td>
                      <td className="num">{fmtInt(row.followerCount)}</td>
                      <td className="num">
                        {row.gradedPosts}
                        {row.totalPosts > row.gradedPosts && (
                          <span className="muted small"> / {row.totalPosts}</span>
                        )}
                      </td>
                      <td className="num">
                        <strong>{fmtNum(row.total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <h2>Competitions</h2>
      <div className="panel">
        {competitions.length === 0 ? (
          <div className="empty">No competitions yet. Create one below.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Window</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {competitions.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="small muted">
                    {fmtDate(c.startAt)} → {fmtDate(c.endAt)}
                  </td>
                  <td>
                    <span className={`badge ${c.isActive ? "ok" : "muted"}`}>
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NewCompetition slug={slug} defaults={defaults} onCreated={refresh} />

      <h2>Invites</h2>
      <div className="panel">
        <p className="small muted">
          Share a code with a teammate. They install the Challenge Sync extension, open it, and
          paste the code to join.
        </p>
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

      <Invites slug={slug} onCreated={refresh} />
    </>
  );
}
