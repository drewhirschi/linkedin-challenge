// Admin dashboard: org-wide aggregate progress, competition creation with the full scoring
// configuration, and invite management.
import {
  useGetAdminOverview,
  useCreateCompetition,
  useCreateInvites,
  getGetAdminOverviewQueryKey,
  fmtDate,
} from "@server/client";
import type { ScoringConfig } from "@server/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
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

function NewCompetition({
  slug,
  defaults,
  open,
  onClose,
  onCreated,
}: {
  slug: string;
  defaults: ScoringConfig;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [start, setStart] = useState(isoDate());
  const [end, setEnd] = useState(isoDate(90));
  const [cfg, setCfg] = useState<ScoringConfig>(defaults);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateCompetition();

  const set = (patch: Partial<ScoringConfig>) => setCfg({ ...cfg, ...patch });

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        // Backdrop only — a click that started inside the dialog shouldn't discard a filled form.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="New competition">
      <div className="modal-head">
        <h3>New competition</h3>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
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
                  onClose();
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

        <p style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create competition"}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </p>
      </form>
      </div>
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
  const [creating, setCreating] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey(slug) });

  if (isLoading) return <div className="spinner">Loading…</div>;
  if (data?.status !== 200) {
    return (
      <div className="empty">
        Your session expired. <a href="/auth/login">Log in again</a>.
      </div>
    );
  }

  const { org, competitions, invites, defaults } = data.data;
  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <p className="small muted">
        <a href={`/orgs/${slug}`}>← {org.name}</a>
      </p>
      <h1>Manage {org.name}</h1>
      <p className="lede">
        Set up competitions and invite people. A competition&rsquo;s own page carries its
        leaderboard and progress.
      </p>

      <div className="week-head">
        <h2 style={{ margin: 0 }}>Competitions</h2>
        <button onClick={() => setCreating(true)}>New competition</button>
      </div>

      {competitions.length === 0 ? (
        <div className="empty">No competitions yet. Create one to start scoring.</div>
      ) : (
        <div className="panel">
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
                  <td>
                    {/* The row is the way in — the details live on the competition's own page. */}
                    <a href={`/orgs/${slug}/c/${c.id}`}>{c.name}</a>
                  </td>
                  <td className="small muted">
                    {fmtDate(c.startAt)} → {fmtDate(c.endAt)}
                  </td>
                  <td>
                    <span className={`badge ${c.isActive && c.endAt >= now ? "ok" : "muted"}`}>
                      {c.isActive && c.endAt >= now ? "Running" : "Finished"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewCompetition
        slug={slug}
        defaults={defaults}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={refresh}
      />

      <h2>Invites</h2>
      <div className="panel">
        <p className="small muted">
          Share a code with a teammate. They redeem it on the join page, then sign into the
          Challenge Sync extension with the same account.
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
