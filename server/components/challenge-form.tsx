// The scoring-rules editor, shared by "New challenge" and a challenge's settings page so the two
// can never disagree about which knobs exist. The fields mirror `ScoringConfig` on the server.
import type { ScoringConfig } from "@linkedin-challenge/client";

function NumberField({
  label,
  value,
  step,
  onChange,
  help,
}: {
  label: string;
  value: number;
  step: string;
  onChange: (n: number) => void;
  help?: string;
}) {
  return (
    <label className="field" style={{ margin: 0 }}>
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {help && <p className="field-help">{help}</p>}
    </label>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <h4 className="muted small" style={{ margin: "14px 0 8px", letterSpacing: ".04em" }}>
      {children}
    </h4>
  );
}

export function ScoringFields({
  cfg,
  onChange,
}: {
  cfg: ScoringConfig;
  onChange: (next: ScoringConfig) => void;
}) {
  const set = (patch: Partial<ScoringConfig>) => onChange({ ...cfg, ...patch });

  return (
    <>
      <Heading>1 · SHOW UP</Heading>
      <div className="grid cols-2">
        <NumberField
          label="Points per post"
          value={cfg.perPost}
          step="1"
          onChange={(n) => set({ perPost: n })}
        />
        <NumberField
          label="Posts that count per week"
          value={cfg.maxPostsPerWeek}
          step="1"
          onChange={(n) => set({ maxPostsPerWeek: Math.max(0, Math.round(n)) })}
          help="Applies to show-up and engagement points alike: only the best N posts a week score."
        />
      </div>

      <Heading>2 · KEEP SHOWING UP</Heading>
      <div className="grid cols-2">
        <NumberField
          label="Points per active week"
          value={cfg.perActiveWeek}
          step="1"
          onChange={(n) => set({ perActiveWeek: n })}
          help="A week is active when it has at least one post."
        />
        <div />
        <NumberField
          label="Short streak (weeks)"
          value={cfg.streakShortWeeks}
          step="1"
          onChange={(n) => set({ streakShortWeeks: Math.max(0, Math.round(n)) })}
        />
        <NumberField
          label="Short streak bonus"
          value={cfg.streakShortBonus}
          step="1"
          onChange={(n) => set({ streakShortBonus: n })}
        />
        <NumberField
          label="Long streak (weeks)"
          value={cfg.streakLongWeeks}
          step="1"
          onChange={(n) => set({ streakLongWeeks: Math.max(0, Math.round(n)) })}
        />
        <NumberField
          label="Long streak bonus"
          value={cfg.streakLongBonus}
          step="1"
          onChange={(n) => set({ streakLongBonus: n })}
          help="Replaces the short bonus once reached; the two don't add."
        />
      </div>

      <Heading>3 · EARN ENGAGEMENT</Heading>
      <div className="grid cols-2">
        <NumberField
          label="Points per comment"
          value={cfg.perComment}
          step="0.1"
          onChange={(n) => set({ perComment: n })}
          help="Only comments by other people count."
        />
        <NumberField
          label="Points per reaction"
          value={cfg.perReaction}
          step="0.1"
          onChange={(n) => set({ perReaction: n })}
          help="0.2 means every 5 likes is worth a point."
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
        <NumberField
          label="Points per impression"
          value={cfg.perImpression}
          step="0.001"
          onChange={(n) => set({ perImpression: n })}
        />
        <NumberField
          label="Full-rate cap per post"
          value={cfg.engagementCap}
          step="1"
          onChange={(n) => set({ engagementCap: n })}
          help="A post counts fully up to this many points; 0 means no cap."
        />
        <NumberField
          label="Rate beyond the cap"
          value={cfg.engagementOverCapRate}
          step="0.05"
          onChange={(n) => set({ engagementOverCapRate: n })}
          help="0.5 keeps earning at half rate."
        />
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
          <span style={{ margin: 0 }}>Scale engagement to follower count</span>
        </label>
        <NumberField
          label="Follower baseline"
          value={cfg.followerBaseline}
          step="1"
          onChange={(n) => set({ followerBaseline: Math.round(n) })}
          help="Engagement is multiplied by baseline ÷ your followers."
        />
      </div>

      <Heading>PROFILE POINTS (optional)</Heading>
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

      <Heading>PRIZES ($, 0 hides)</Heading>
      <div className="grid cols-2">
        <NumberField
          label="1st place"
          value={cfg.prizeFirst}
          step="50"
          onChange={(n) => set({ prizeFirst: Math.round(n) })}
        />
        <NumberField
          label="2nd place"
          value={cfg.prizeSecond}
          step="50"
          onChange={(n) => set({ prizeSecond: Math.round(n) })}
        />
        <NumberField
          label="3rd place"
          value={cfg.prizeThird}
          step="50"
          onChange={(n) => set({ prizeThird: Math.round(n) })}
        />
        <div />
        <NumberField
          label="Everyone who posts enough"
          value={cfg.prizeParticipation}
          step="50"
          onChange={(n) => set({ prizeParticipation: Math.round(n) })}
        />
        <NumberField
          label="Posts needed for it"
          value={cfg.participationPosts}
          step="1"
          onChange={(n) => set({ participationPosts: Math.max(0, Math.round(n)) })}
        />
      </div>
    </>
  );
}
