//! Scoring is fully derived from snapshots at read time — nothing is precomputed or stored.
//!
//! Per member, per competition window:
//!  * Post points: for each post created in-window, take its latest snapshot, score its engagement,
//!    keep only the top `max_posts_per_week` posts in each ISO-week bucket, then sum. Optionally
//!    normalize by follower count so small and large accounts compete fairly.
//!  * Profile points: followers gained + profile views accrued across the window.

use serde::{Deserialize, Serialize};
use toasty::Db;

use crate::models::{Competition, Member, Post, PostComment, PostSnapshot, ProfileSnapshot};

pub const WEEK_SECONDS: i64 = 7 * 86400;

/// Per-competition scoring parameters, stored as JSON on the `Competition` row.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(default, rename_all = "camelCase")]
pub struct ScoringConfig {
    /// Posts beyond this many per week don't score (only the highest-scoring ones count).
    #[schema(required)]
    pub max_posts_per_week: u32,
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
    #[schema(required)]
    pub per_follower_gained: f64,
    #[schema(required)]
    pub per_profile_view: f64,
    /// If true, post points are scaled by `follower_baseline / follower_count`.
    #[schema(required)]
    pub normalize_by_followers: bool,
    #[schema(required)]
    pub follower_baseline: i64,
}

impl Default for ScoringConfig {
    fn default() -> Self {
        Self {
            max_posts_per_week: 3,
            per_reaction: 1.0,
            per_comment: 3.0,
            per_repost: 5.0,
            per_send: 5.0,
            per_save: 3.0,
            per_impression: 0.01,
            per_follower_gained: 10.0,
            per_profile_view: 0.5,
            normalize_by_followers: true,
            follower_baseline: 1000,
        }
    }
}

impl ScoringConfig {
    /// Read the rules off a competition row. The columns are the storage; this struct is the wire
    /// and compute shape.
    pub fn from_competition(c: &Competition) -> Self {
        Self {
            max_posts_per_week: c.max_posts_per_week.clamp(0, u32::MAX as i64) as u32,
            per_reaction: c.per_reaction,
            per_comment: c.per_comment,
            per_repost: c.per_repost,
            per_send: c.per_send,
            per_save: c.per_save,
            per_impression: c.per_impression,
            per_follower_gained: c.per_follower_gained,
            per_profile_view: c.per_profile_view,
            normalize_by_followers: c.normalize_by_followers,
            follower_baseline: c.follower_baseline,
        }
    }
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
    pub post_points: f64,
    pub profile_points: f64,
    pub total: f64,
    pub graded_posts: usize,
    pub total_posts: usize,
}

/// Compute the full leaderboard for a competition, sorted by total score descending.
///
/// Ranks every member of the competition's org: per the product manifest, everyone in a company
/// participates in every challenge it runs — there is no enrollment. Members with no collected
/// data are skipped by `score_member`, so nobody appears on a board until they have synced.
pub async fn compute_standings(db: &mut Db, comp: &Competition) -> toasty::Result<Vec<Standing>> {
    let cfg = ScoringConfig::from_competition(comp);

    let members = Member::filter(Member::fields().org_id().eq(comp.org_id))
        .exec(&mut *db)
        .await?;

    let mut standings = Vec::new();
    for member in &members {
        if let Some(standing) = score_member(db, member, comp, &cfg).await? {
            standings.push(standing);
        }
    }

    standings.sort_by(|a, b| b.total.partial_cmp(&a.total).unwrap_or(std::cmp::Ordering::Equal));
    Ok(standings)
}

async fn score_member(
    db: &mut Db,
    member: &Member,
    comp: &Competition,
    cfg: &ScoringConfig,
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

    // --- Post points: score each in-window post from its latest snapshot ---------------------
    struct ScoredPost {
        week: i64,
        points: f64,
    }
    let mut scored = Vec::new();
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

        let Some(snap) = latest_post_snapshot_before(db, post.id, comp.end_at).await? else {
            continue;
        };
        // Comments score from the rows we actually read, excluding the author's own — replying to
        // your own thread shouldn't earn points. When we have no rows at all (nothing read yet),
        // fall back to LinkedIn's total rather than scoring the post as if it had no comments.
        let scored_comments = match comments_by_others(db, post.id).await? {
            Some(n) => n,
            None => f(snap.comments),
        };

        let points = f(snap.reactions) * cfg.per_reaction
            + scored_comments * cfg.per_comment
            + f(snap.reposts) * cfg.per_repost
            + f(snap.sends) * cfg.per_send
            + f(snap.saves) * cfg.per_save
            + f(snap.impressions) * cfg.per_impression;

        let week = (effective - comp.start_at) / WEEK_SECONDS;
        scored.push(ScoredPost { week, points });
    }

    // Keep only the top `max_posts_per_week` posts within each week bucket.
    let mut by_week: std::collections::HashMap<i64, Vec<f64>> = std::collections::HashMap::new();
    for sp in &scored {
        by_week.entry(sp.week).or_default().push(sp.points);
    }
    let mut post_points = 0.0;
    let mut graded_posts = 0usize;
    for (_week, mut pts) in by_week {
        pts.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
        let take = (cfg.max_posts_per_week as usize).min(pts.len());
        post_points += pts[..take].iter().sum::<f64>();
        graded_posts += take;
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

    if cfg.normalize_by_followers && latest_followers > 0 {
        let factor = cfg.follower_baseline as f64 / latest_followers as f64;
        post_points *= factor;
    }

    // --- Profile points: followers gained + profile views accrued in-window ------------------
    let follower_gained = window_delta(&in_window, |p| p.follower_count);
    let profile_views_gained = window_delta(&in_window, |p| p.profile_views);
    let profile_points = follower_gained.max(0) as f64 * cfg.per_follower_gained
        + profile_views_gained.max(0) as f64 * cfg.per_profile_view;

    let total = post_points + profile_points;

    Ok(Some(Standing {
        member_id: member.id,
        display_name: member.display_name.clone(),
        profile_url: member.profile_url.clone(),
        follower_count: latest_followers,
        post_points,
        profile_points,
        total,
        graded_posts,
        total_posts: total_posts_in_window,
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
async fn comments_by_others(db: &mut Db, post_id: i64) -> toasty::Result<Option<f64>> {
    let rows = PostComment::filter(PostComment::fields().post_id().eq(post_id))
        .exec(&mut *db)
        .await?;
    if rows.is_empty() {
        return Ok(None);
    }
    Ok(Some(rows.iter().filter(|c| !c.is_self).count() as f64))
}

fn f(v: Option<i64>) -> f64 {
    v.unwrap_or(0) as f64
}
