// Challenge setup: any user can create one and becomes its first member. Other users join only
// through challenge-specific invitations.
import { useGetAdminOverview, useCreateChallenge, getGetAdminOverviewQueryKey } from "@linkedin-challenge/client/react-query";
import type { ScoringConfig } from "@linkedin-challenge/client";
import { fmtDate } from "../../../components/format";
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

function NewChallenge({
  defaults,
  open,
  onClose,
  onCreated,
}: {
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
  const create = useCreateChallenge();

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
      <div className="modal" role="dialog" aria-modal="true" aria-label="New challenge">
        <div className="modal-head">
          <h3>New challenge</h3>
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
              { data: { name, start, end, config: cfg } },
              {
                onSuccess: (res) => {
                  if (res.status === 200) {
                    setName("");
                    onCreated();
                    onClose();
                  } else {
                    setError(res.data?.error ?? "Could not create the challenge.");
                  }
                },
                onError: () => setError("Could not create the challenge."),
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
              {create.isPending ? "Creating…" : "Create challenge"}
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

export default function ChallengeSetup() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetAdminOverview();
  const [creating, setCreating] = useState(false);

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

  const { competitions, defaults } = data.data;
  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <div className="week-head">
        <h1 style={{ margin: 0 }}>Challenge setup</h1>
        <button onClick={() => setCreating(true)}>New challenge</button>
      </div>
      <p className="lede">
        A challenge defines the window being measured and how results turn into a ranking.
        Everyone in the company takes part automatically.
      </p>

      {competitions.length === 0 ? (
        <div className="empty">No challenges yet. Create one to start scoring.</div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
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

      <NewChallenge
        defaults={defaults}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={refresh}
      />
    </>
  );
}
