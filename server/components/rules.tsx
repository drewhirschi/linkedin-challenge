// The plain-language explanation of a challenge's scoring rules. Shared by the Rules page and the
// admin's challenge setup, so what participants read is exactly what admins configured.
import type { ScoringConfig } from "@linkedin-challenge/client";
import { fmtInt, fmtRate } from "./format";

export function Rules({ config }: { config: ScoringConfig }) {
  return (
    <div className="panel">
      <dl className="rules" style={{ margin: 0 }}>
        <dt>Each post earns</dt>
        <dd>
          {fmtRate(config.perReaction)} per reaction · {fmtRate(config.perComment)} per comment ·{" "}
          {fmtRate(config.perRepost)} per repost · {fmtRate(config.perSend)} per send ·{" "}
          {fmtRate(config.perSave)} per save · {fmtRate(config.perImpression)} per impression.
        </dd>

        <dt>Only other people&rsquo;s comments count</dt>
        <dd>
          Comments you leave on your own posts are excluded, so replying to your own thread
          doesn&rsquo;t earn points.
        </dd>

        <dt>Your profile earns</dt>
        <dd>
          {fmtRate(config.perFollowerGained)} per follower gained ·{" "}
          {fmtRate(config.perProfileView)} per profile view, counted across the whole window.
        </dd>

        <dt>Only your best {config.maxPostsPerWeek} posts each week count</dt>
        <dd>
          Post more than {config.maxPostsPerWeek} times in a week and only the highest-scoring{" "}
          {config.maxPostsPerWeek} score. Volume alone doesn&rsquo;t win.
        </dd>

        <dt>{config.normalizeByFollowers ? "Scores are follower-normalized" : "Raw engagement"}</dt>
        <dd>
          {config.normalizeByFollowers
            ? `Post points are scaled to a ${fmtInt(config.followerBaseline)}-follower baseline, so a small
               account and a large one compete on equal terms.`
            : "Post points are counted as-is, with no adjustment for audience size."}
        </dd>
      </dl>
    </div>
  );
}
