//! Scoring is fully derived from snapshots at read time — nothing is precomputed or stored.
//!
//! Per member, per competition window, three buckets (the "three ways to score"):
//!  * **Show up**: `per_post` points for each in-window post, at most `max_posts_per_week` a week.
//!  * **Keep showing up**: `per_active_week` for every week with at least one post, plus one streak
//!    bonus — `streak_long_bonus` once the best run of consecutive active weeks reaches
//!    `streak_long_weeks`, otherwise `streak_short_bonus` at `streak_short_weeks`.
//!  * **Engagement**: each post's reactions/comments/reposts/... are priced by the `per_*` rates.
//!    A post counts fully up to `engagement_cap` and then keeps earning at
//!    `engagement_over_cap_rate`, so a post that goes big still counts for more. Only the best
//!    `max_posts_per_week` posts a week count, and the sum is optionally scaled by
//!    `follower_baseline / follower_count` so audience size doesn't decide the board.
//!
//! Profile points (followers gained, profile views) remain available for challenges that price
//! them; the LinkedIn Cup rules leave those rates at zero.

use serde::{Deserialize, Serialize};
use toasty::Db;

use crate::models::{
    ChallengeMembership, Competition, Member, Post, PostComment, PostSnapshot, ProfileSnapshot,
};
use crate::util::now_unix;

pub const WEEK_SECONDS: i64 = 7 * 86400;

/// Per-competition scoring parameters, stored as typed columns on the `Competition` row.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(default, rename_all = "camelCase")]
pub struct ScoringConfig {
    /// Posts beyond this many per week don't score (only the highest-scoring ones count).
    #[schema(required)]
    pub max_posts_per_week: u32,
    /// "Show up": points for each post, up to `max_posts_per_week` a week.
    #[schema(required)]
    pub per_post: f64,
    /// "Keep showing up": points for every week with at least one post.
    #[schema(required)]
    pub per_active_week: f64,
    #[schema(required)]
    pub streak_short_weeks: u32,
    #[schema(required)]
    pub streak_short_bonus: f64,
    #[schema(required)]
    pub streak_long_weeks: u32,
    #[schema(required)]
    pub streak_long_bonus: f64,
    #[schema(required)]
    pub per_reaction: f64,
    #[schema(required)]
    pub per_comment: f64,
    #[schema(required)]
    pub per_repost: f64,
    /// A "send" is a private share — high intent, so usually worth more than a public repost.
    #[schema(required)]
    pub per_send: f64,
    #[schema(required)]
    pub per_save: f64,
    #[schema(required)]
    pub per_impression: f64,
    /// A post's engagement counts fully up to this many points; 0 means no cap.
    #[schema(required)]
    pub engagement_cap: f64,
    /// Rate at which engagement beyond the cap keeps earning (0.5 = half rate).
    #[schema(required)]
    pub engagement_over_cap_rate: f64,
    #[schema(required)]
    pub per_follower_gained: f64,
    #[schema(required)]
    pub per_profile_view: f64,
    /// If true, engagement points are scaled by `follower_baseline / follower_count`.
    #[schema(required)]
    pub normalize_by_followers: bool,
    #[schema(required)]
    pub follower_baseline: i64,
    /// Prize money, in whole dollars; 0 hides the prize.
    #[schema(required)]
    pub prize_first: i64,
    #[schema(required)]
    pub prize_second: i64,
    #[schema(required)]
    pub prize_third: i64,
    /// Guaranteed to everyone who posts `participation_posts` times or more in the window.
    #[schema(required)]
    pub prize_participation: i64,
    #[schema(required)]
    pub participation_posts: i64,
}

impl Default for ScoringConfig {
    /// The LinkedIn Cup rules: show up, keep showing up, earn engagement.
    fn default() -> Self {
        Self {
            max_posts_per_week: 3,
            per_post: 10.0,
            per_active_week: 20.0,
            streak_short_weeks: 4,
            streak_short_bonus: 25.0,
            streak_long_weeks: 8,
            streak_long_bonus: 75.0,
            per_reaction: 0.2,
            per_comment: 5.0,
            per_repost: 0.0,
            per_send: 0.0,
            per_save: 0.0,
            per_impression: 0.0,
            engagement_cap: 150.0,
            engagement_over_cap_rate: 0.5,
            per_follower_gained: 0.0,
            per_profile_view: 0.0,
            normalize_by_followers: true,
            follower_baseline: 1000,
            prize_first: 2500,
            prize_second: 1500,
            prize_third: 1000,
            prize_participation: 250,
            participation_posts: 20,
        }
    }
}

impl ScoringConfig {
    /// Read the rules off a competition row. The columns are the storage; this struct is the wire
    /// and compute shape.
    pub fn from_competition(c: &Competition) -> Self {
        Self {
            max_posts_per_week: c.max_posts_per_week.clamp(0, u32::MAX as i64) as u32,
            per_post: c.per_post,
            per_active_week: c.per_active_week,
            streak_short_weeks: c.streak_short_weeks.clamp(0, u32::MAX as i64) as u32,
            streak_short_bonus: c.streak_short_bonus,
            streak_long_weeks: c.streak_long_weeks.clamp(0, u32::MAX as i64) as u32,
            streak_long_bonus: c.streak_long_bonus,
            per_reaction: c.per_reaction,
            per_comment: c.per_comment,
            per_repost: c.per_repost,
            per_send: c.per_send,
            per_save: c.per_save,
            per_impression: c.per_impression,
            engagement_cap: c.engagement_cap,
            engagement_over_cap_rate: c.engagement_over_cap_rate,
            per_follower_gained: c.per_follower_gained,
            per_profile_view: c.per_profile_view,
            normalize_by_followers: c.normalize_by_followers,
            follower_baseline: c.follower_baseline,
            prize_first: c.prize_first,
            prize_second: c.prize_second,
            prize_third: c.prize_third,
            prize_participation: c.prize_participation,
            participation_posts: c.participation_posts,
        }
    }

    /// Raw engagement points for one post, before the cap and before follower scaling.
    pub fn raw_engagement(&self, e: &Engagement) -> f64 {
        e.reactions as f64 * self.per_reaction
            + e.comments as f64 * self.per_comment
            + e.reposts as f64 * self.per_repost
            + e.sends as f64 * self.per_send
            + e.saves as f64 * self.per_save
            + e.impressions as f64 * self.per_impression
    }

    /// Engagement points for one post after the cap: full value up to `engagement_cap`, then the
    /// remainder at `engagement_over_cap_rate`.
    pub fn post_engagement(&self, e: &Engagement) -> f64 {
        let raw = self.raw_engagement(e);
        if self.engagement_cap <= 0.0 || raw <= self.engagement_cap {
            raw
        } else {
            self.engagement_cap + (raw - self.engagement_cap) * self.engagement_over_cap_rate
        }
    }

    /// The streak bonus earned by a best run of `best_streak` consecutive active weeks.
    pub fn streak_bonus(&self, best_streak: u32) -> f64 {
        if self.streak_long_weeks > 0 && best_streak >= self.streak_long_weeks {
            self.streak_long_bonus
        } else if self.streak_short_weeks > 0 && best_streak >= self.streak_short_weeks {
            self.streak_short_bonus
        } else {
            0.0
        }
    }

    /// The multiplier applied to engagement points for an account with this many followers.
    pub fn follower_factor(&self, followers: i64) -> f64 {
        if self.normalize_by_followers && followers > 0 && self.follower_baseline > 0 {
            self.follower_baseline as f64 / followers as f64
        } else {
            1.0
        }
    }

    /// Number of scoring weeks in a window (the last, partial week counts).
    pub fn weeks_in(start_at: i64, end_at: i64) -> i64 {
        ((end_at - start_at).max(0) / WEEK_SECONDS) + 1
    }
}

/// The engagement counts scoring prices, taken from a post's latest snapshot with comments
/// replaced by the ones other people wrote whenever we have read them.
#[derive(Debug, Clone, Copy, Default)]
pub struct Engagement {
    pub reactions: i64,
    pub comments: i64,
    pub reposts: i64,
    pub sends: i64,
    pub saves: i64,
    pub impressions: i64,
}

/// Choose the competition to display: prefer an active one whose window contains `now`, then any
/// active one, then the most recent overall; latest `start_at` breaks ties. Consumes the vec so we
/// don't require `Clone` on the model (Toasty models hold non-Clone `Deferred` fields).
pub fn active_competition(comps: Vec<Competition>, now: i64) -> Option<Competition> {
    let mut best: Option<(u8, i64, Competition)> = None;
    for c in comps {
        let priority = if c.is_active && c.start_at <= now && now <= c.end_at {
            2
        } else if c.is_active {
            1
        } else {
            0
        };
        let key = (priority, c.start_at);
        let replace = match &best {
            Some((bp, bs, _)) => key >= (*bp, *bs),
            None => true,
        };
        if replace {
            best = Some((priority, c.start_at, c));
        }
    }
    best.map(|(_, _, c)| c)
}

/// One member's standing in a competition.
#[derive(Debug, Clone)]
pub struct Standing {
    pub member_id: i64,
    pub display_name: String,
    pub profile_url: Option<String>,
    pub follower_count: i64,
    /// Followers gained across the window (latest in-window reading minus the first).
    pub follower_growth: i64,
    pub show_up_points: f64,
    pub consistency_points: f64,
    pub engagement_points: f64,
    /// `show_up + engagement` — the post-derived part of the score.
    pub post_points: f64,
    pub profile_points: f64,
    pub total: f64,
    /// Points earned in the current scoring week (show up + active week + engagement of this
    /// week's posts). Streak bonuses are excluded because they belong to the whole run.
    pub week_points: f64,
    pub graded_posts: usize,
    pub total_posts: usize,
    pub active_weeks: u32,
    /// Consecutive active weeks ending at the current (or, if it is quiet so far, previous) week.
    pub streak_weeks: u32,
    pub best_streak_weeks: u32,
}

/// Compute the full leaderboard for a competition, sorted by total score descending.
///
/// Ranks only users who explicitly joined this challenge. Membership is the user's grant for the
/// challenge to read and score their post data.
pub async fn compute_standings(db: &mut Db, comp: &Competition) -> toasty::Result<Vec<Standing>> {
    let cfg = ScoringConfig::from_competition(comp);
    let now = now_unix();
    let memberships =
        ChallengeMembership::filter(ChallengeMembership::fields().challenge_id().eq(comp.id))
            .exec(&mut *db)
            .await?;

    let mut standings = Vec::new();
    for membership in memberships {
        let Some(member) = Member::filter_by_id(membership.member_id)
            .first()
            .exec(&mut *db)
            .await?
        else {
            continue;
        };
        if let Some(standing) = score_member(db, &member, comp, &cfg, now).await? {
            standings.push(standing);
        }
    }

    standings.sort_by(|a, b| {
        b.total
            .partial_cmp(&a.total)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.display_name.cmp(&b.display_name))
    });
    Ok(standings)
}

/// The 0-based scoring week that `now` falls in, clamped to the window.
pub fn current_week(comp: &Competition, now: i64) -> i64 {
    let last = (comp.end_at - comp.start_at).max(0) / WEEK_SECONDS;
    ((now - comp.start_at) / WEEK_SECONDS).clamp(0, last)
}

/// Length of the run of consecutive active weeks that ends at `through` (or the week before it
/// when `through` itself is quiet so far).
pub fn current_streak(active: &[bool], through: i64) -> u32 {
    if active.is_empty() || through < 0 {
        return 0;
    }
    let mut week = through.min(active.len() as i64 - 1);
    if !active[week as usize] {
        week -= 1;
    }
    let mut streak = 0;
    while week >= 0 && active[week as usize] {
        streak += 1;
        week -= 1;
    }
    streak
}

/// Longest run of consecutive active weeks anywhere in the window.
pub fn best_streak(active: &[bool]) -> u32 {
    let mut best = 0;
    let mut run = 0;
    for &week in active {
        run = if week { run + 1 } else { 0 };
        best = best.max(run);
    }
    best
}

async fn score_member(
    db: &mut Db,
    member: &Member,
    comp: &Competition,
    cfg: &ScoringConfig,
    now: i64,
) -> toasty::Result<Option<Standing>> {
    let posts = Post::filter(Post::fields().member_id().eq(member.id))
        .exec(&mut *db)
        .await?;

    let profile_snaps = {
        let mut s = ProfileSnapshot::filter(ProfileSnapshot::fields().member_id().eq(member.id))
            .exec(&mut *db)
            .await?;
        s.sort_by_key(|p| p.captured_at);
        s
    };

    // Skip members with no collected data at all (e.g. an admin who never linked the extension).
    if posts.is_empty() && profile_snaps.is_empty() {
        return Ok(None);
    }

    // --- Per-post engagement, bucketed by scoring week --------------------------------------
    let weeks = ScoringConfig::weeks_in(comp.start_at, comp.end_at) as usize;
    let mut by_week: Vec<Vec<f64>> = vec![Vec::new(); weeks];
    let mut total_posts_in_window = 0usize;

    for post in &posts {
        // Effective time: the post's own creation time, or its first snapshot if unknown.
        let effective = if post.created_at > 0 {
            post.created_at
        } else {
            match earliest_post_snapshot(db, post.id).await? {
                Some(ts) => ts,
                None => continue,
            }
        };
        if effective < comp.start_at || effective > comp.end_at {
            continue;
        }
        total_posts_in_window += 1;
        let week = ((effective - comp.start_at) / WEEK_SECONDS) as usize;

        // A post with no snapshot yet still "shows up"; it just has no engagement to price.
        let engagement = match latest_post_snapshot_before(db, post.id, comp.end_at).await? {
            Some(snap) => {
                // Comments score from the rows we actually read, excluding the author's own —
                // replying to your own thread shouldn't earn points. When we have no rows at all
                // (nothing read yet), fall back to LinkedIn's total rather than scoring the post
                // as if it had no comments.
                let comments = match comments_by_others(db, post.id).await? {
                    Some(n) => n,
                    None => snap.comments.unwrap_or(0),
                };
                cfg.post_engagement(&Engagement {
                    reactions: snap.reactions.unwrap_or(0),
                    comments,
                    reposts: snap.reposts.unwrap_or(0),
                    sends: snap.sends.unwrap_or(0),
                    saves: snap.saves.unwrap_or(0),
                    impressions: snap.impressions.unwrap_or(0),
                })
            }
            None => 0.0,
        };
        by_week[week.min(weeks - 1)].push(engagement);
    }

    // --- Follower count + normalization -----------------------------------------------------
    let in_window: Vec<&ProfileSnapshot> = profile_snaps
        .iter()
        .filter(|p| p.captured_at >= comp.start_at && p.captured_at <= comp.end_at)
        .collect();

    let latest_followers = in_window
        .iter()
        .rev()
        .find_map(|p| p.follower_count)
        .or_else(|| profile_snaps.iter().rev().find_map(|p| p.follower_count))
        .unwrap_or(0);
    let factor = cfg.follower_factor(latest_followers);

    // --- Show up + engagement: only the best `max_posts_per_week` posts a week count ---------
    let max = cfg.max_posts_per_week as usize;
    let mut show_up = 0.0;
    let mut engagement = 0.0;
    let mut graded_posts = 0usize;
    let mut active: Vec<bool> = vec![false; weeks];
    let mut week_show_up = vec![0.0; weeks];
    let mut week_engagement = vec![0.0; weeks];
    for (week, pts) in by_week.iter_mut().enumerate() {
        if pts.is_empty() {
            continue;
        }
        active[week] = true;
        pts.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
        let take = max.min(pts.len());
        week_show_up[week] = take as f64 * cfg.per_post;
        week_engagement[week] = pts[..take].iter().sum::<f64>() * factor;
        show_up += week_show_up[week];
        engagement += week_engagement[week];
        graded_posts += take;
    }

    // --- Keep showing up: active weeks and the streak bonus ---------------------------------
    let this_week = current_week(comp, now);
    let active_weeks = active.iter().filter(|w| **w).count() as u32;
    let streak = current_streak(&active, this_week);
    let best = best_streak(&active);
    let consistency = active_weeks as f64 * cfg.per_active_week + cfg.streak_bonus(best);

    let week_index = this_week as usize;
    let week_points = week_show_up[week_index]
        + week_engagement[week_index]
        + if active[week_index] { cfg.per_active_week } else { 0.0 };

    // --- Profile points: followers gained + profile views accrued in-window ------------------
    let follower_growth = window_delta(&in_window, |p| p.follower_count);
    let profile_views_gained = window_delta(&in_window, |p| p.profile_views);
    let profile_points = follower_growth.max(0) as f64 * cfg.per_follower_gained
        + profile_views_gained.max(0) as f64 * cfg.per_profile_view;

    let post_points = show_up + engagement;
    let total = post_points + consistency + profile_points;

    Ok(Some(Standing {
        member_id: member.id,
        display_name: member.display_name.clone(),
        profile_url: member.profile_url.clone(),
        follower_count: latest_followers,
        follower_growth,
        show_up_points: show_up,
        consistency_points: consistency,
        engagement_points: engagement,
        post_points,
        profile_points,
        total,
        week_points,
        graded_posts,
        total_posts: total_posts_in_window,
        active_weeks,
        streak_weeks: streak,
        best_streak_weeks: best,
    }))
}

/// Latest value minus earliest value across the window snapshots, for a chosen metric.
fn window_delta(snaps: &[&ProfileSnapshot], pick: impl Fn(&ProfileSnapshot) -> Option<i64>) -> i64 {
    let first = snaps.iter().find_map(|p| pick(p));
    let last = snaps.iter().rev().find_map(|p| pick(p));
    match (first, last) {
        (Some(a), Some(b)) => b - a,
        _ => 0,
    }
}

async fn earliest_post_snapshot(db: &mut Db, post_id: i64) -> toasty::Result<Option<i64>> {
    let mut snaps = PostSnapshot::filter(PostSnapshot::fields().post_id().eq(post_id))
        .exec(&mut *db)
        .await?;
    snaps.sort_by_key(|s| s.captured_at);
    Ok(snaps.first().map(|s| s.captured_at))
}

async fn latest_post_snapshot_before(
    db: &mut Db,
    post_id: i64,
    before: i64,
) -> toasty::Result<Option<PostSnapshot>> {
    let mut snaps = PostSnapshot::filter(PostSnapshot::fields().post_id().eq(post_id))
        .exec(&mut *db)
        .await?;
    snaps.retain(|s| s.captured_at <= before);
    snaps.sort_by_key(|s| s.captured_at);
    Ok(snaps.pop())
}

/// Comments by anyone other than the post's author, or None when we have read no comments for it.
pub async fn comments_by_others(db: &mut Db, post_id: i64) -> toasty::Result<Option<i64>> {
    let rows = PostComment::filter(PostComment::fields().post_id().eq(post_id))
        .exec(&mut *db)
        .await?;
    if rows.is_empty() {
        return Ok(None);
    }
    Ok(Some(rows.iter().filter(|c| !c.is_self).count() as i64))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engagement_counts_fully_to_the_cap_then_at_half_rate() {
        let cfg = ScoringConfig::default();
        // 20 comments × 5 + 100 reactions × 0.2 = 120 → under the cap, counts fully.
        let small = Engagement { comments: 20, reactions: 100, ..Default::default() };
        assert!((cfg.post_engagement(&small) - 120.0).abs() < 1e-9);
        // 40 comments × 5 + 250 reactions × 0.2 = 250 → 150 + 100 × 0.5 = 200.
        let big = Engagement { comments: 40, reactions: 250, ..Default::default() };
        assert!((cfg.post_engagement(&big) - 200.0).abs() < 1e-9);
    }

    #[test]
    fn streak_bonus_is_the_larger_of_the_two_not_their_sum() {
        let cfg = ScoringConfig::default();
        assert_eq!(cfg.streak_bonus(3), 0.0);
        assert_eq!(cfg.streak_bonus(4), 25.0);
        assert_eq!(cfg.streak_bonus(7), 25.0);
        assert_eq!(cfg.streak_bonus(8), 75.0);
    }

    #[test]
    fn streaks_count_consecutive_active_weeks() {
        let active = [true, true, false, true, true, true, false, false];
        assert_eq!(best_streak(&active), 3);
        // Through week 5 (active): the run is weeks 3–5.
        assert_eq!(current_streak(&active, 5), 3);
        // Through week 6 (quiet so far): still the run ending at week 5.
        assert_eq!(current_streak(&active, 6), 3);
        // Through week 7: week 6 was quiet too, so the streak is broken.
        assert_eq!(current_streak(&active, 7), 0);
    }

    #[test]
    fn weeks_in_window_include_the_partial_last_week() {
        // Jul 13 → Sep 30 is 79 days: eleven full weeks and a partial twelfth.
        let start = crate::util::parse_date("2026-07-13").unwrap();
        let end = crate::util::parse_date("2026-09-30").unwrap() + 86_399;
        assert_eq!(ScoringConfig::weeks_in(start, end), 12);
    }
}
