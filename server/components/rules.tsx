// The plain-language explanation of a challenge's scoring rules. Shared by the Rules page, the
// board's footer, and the owner's settings page, so what participants read is exactly what
// owners configured. The wording follows the Cup's "three ways to score".
import type { ScoringConfig } from "@linkedin-challenge/client";
import { fmtInt, fmtRate } from "./format";

const money = (n: number) => `$${fmtInt(n)}`;

/** "every 5 likes is worth 1" reads better than "0.2 per reaction" when the rate divides evenly. */
function perReaction(rate: number): string {
  if (rate > 0 && rate < 1 && Number.isInteger(1 / rate)) {
    return `every ${1 / rate} likes is worth 1`;
  }
  return `every reaction is worth ${fmtRate(rate)}`;
}

export function Rules({ config, compact = false }: { config: ScoringConfig; compact?: boolean }) {
  const extras: string[] = [];
  if (config.perRepost) extras.push(`${fmtRate(config.perRepost)} per repost`);
  if (config.perSend) extras.push(`${fmtRate(config.perSend)} per send`);
  if (config.perSave) extras.push(`${fmtRate(config.perSave)} per save`);
  if (config.perImpression) extras.push(`${fmtRate(config.perImpression)} per impression`);

  const streak =
    config.streakShortBonus || config.streakLongBonus
      ? ` plus a streak bonus: ${fmtInt(config.streakShortBonus)} points at a ${config.streakShortWeeks}-week streak, ${fmtInt(config.streakLongBonus)} at ${config.streakLongWeeks}.`
      : ".";

  const body = (
    <>
      <p style={{ marginTop: 0 }}>Three ways to score, and comments are worth the most:</p>
      <ol className="rules-list">
        <li>
          <strong>Show up.</strong> {fmtInt(config.perPost)} points per post, up to{" "}
          {config.maxPostsPerWeek} posts a week.
        </li>
        <li>
          <strong>Keep showing up.</strong> {fmtInt(config.perActiveWeek)} points for every active
          week{streak}
        </li>
        <li>
          <strong>Earn engagement{config.normalizeByFollowers ? ", adjusted for the size of audience" : ""}.</strong>{" "}
          Every person who comments is worth {fmtRate(config.perComment)} points, {perReaction(config.perReaction)}
          {extras.length > 0 && `, ${extras.join(", ")}`}.
          {config.engagementCap > 0 && (
            <>
              {" "}A post counts fully up to {fmtInt(config.engagementCap)} points, then keeps
              earning at {config.engagementOverCapRate === 0.5 ? "half" : fmtRate(config.engagementOverCapRate)} rate, so a post that goes big always counts for more.
            </>
          )}
          {config.normalizeByFollowers && " That is then scaled to your follower count."}{" "}
          One person counts once per post however many times they reply, and comments you leave
          on your own posts don&rsquo;t count.
        </li>
      </ol>
      {(config.perFollowerGained > 0 || config.perProfileView > 0) && (
        <p>
          Your profile also earns {fmtRate(config.perFollowerGained)} per follower gained and{" "}
          {fmtRate(config.perProfileView)} per profile view across the window.
        </p>
      )}
      {config.prizeParticipation > 0 && (
        <p>
          Everyone who posts {config.participationPosts}+ times gets {money(config.prizeParticipation)}.
        </p>
      )}
    </>
  );

  if (compact) return body;
  return <div className="panel">{body}</div>;
}
