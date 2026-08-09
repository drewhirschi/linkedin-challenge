//! Wire shapes shared by the `app/**/route.rs` adapters, plus the reads that build them.
//!
//! OpenAPI schema names are global, so these live in one place rather than being redeclared per
//! route. The queries stay here too: the leaderboard, the admin overview, and a member's own
//! standing are the same data viewed three ways, and duplicating the read per screen is how the
//! three drift apart.

use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

use crate::models::{
    Competition, CompetitionEntry, Invite, Member, Org, Post, PostComment, PostSnapshot, entry_key,
};
use crate::scoring::{
    ScoringConfig, Standing, WEEK_SECONDS, active_competition, compute_standings,
};
use crate::util::now_unix;
use crate::web::{ApiError, ApiResult};

// --- summaries -------------------------------------------------------------------------------

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OrgSummary {
    pub slug: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CompetitionInfo {
    pub id: i64,
    pub name: String,
    pub start_at: i64,
    pub end_at: i64,
    pub is_active: bool,
    /// The scoring rules in force — this is what the "how the challenge is configured" screen reads.
    pub config: ScoringConfig,
}

impl CompetitionInfo {
    pub fn new(c: &Competition) -> Self {
        Self {
            id: c.id,
            name: c.name.clone(),
            start_at: c.start_at,
            end_at: c.end_at,
            is_active: c.is_active,
            config: ScoringConfig::from_competition(c),
        }
    }
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StandingRow {
    pub rank: usize,
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

impl StandingRow {
    fn new(rank: usize, s: Standing) -> Self {
        Self {
            rank,
            member_id: s.member_id,
            display_name: s.display_name,
            profile_url: s.profile_url,
            follower_count: s.follower_count,
            post_points: s.post_points,
            profile_points: s.profile_points,
            total: s.total,
            graded_posts: s.graded_posts,
            total_posts: s.total_posts,
        }
    }
}

/// An org and the competitions it runs.
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OrgDetail {
    pub org: OrgSummary,
    pub competitions: Vec<CompetitionInfo>,
    /// Entrant count per competition, index-aligned with `competitions`.
    pub entrant_counts: Vec<usize>,
}

/// One competition a member has entered, plus where they stand in it — the home page's row.
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MyCompetition {
    pub org: OrgSummary,
    pub competition: CompetitionInfo,
    /// Absent until the member has collected data inside the window.
    pub standing: Option<StandingRow>,
    pub entrants: usize,
}

/// The public leaderboard payload: standings, the competition, and the rules behind the numbers.
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Leaderboard {
    pub org: OrgSummary,
    pub competition: Option<CompetitionInfo>,
    pub standings: Vec<StandingRow>,
}

// --- member detail ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PostStat {
    pub id: i64,
    pub urn: String,
    pub permalink: String,
    /// Post creation time, or the first snapshot's time when LinkedIn didn't give us one.
    pub posted_at: i64,
    pub text_preview: Option<String>,
    pub impressions: i64,
    pub reactions: i64,
    /// LinkedIn's total comment count.
    pub comments: i64,
    /// Comments by people other than the author — what actually scores. Equals `comments` until
    /// we have read the comment list for this post.
    pub comments_by_others: i64,
    pub reposts: i64,
    pub sends: i64,
    pub saves: i64,
    pub impressions_in_network: i64,
    pub impressions_out_of_network: i64,
    pub profile_viewers_from_post: i64,
    pub followers_from_post: i64,
    /// False when the post falls outside the competition window.
    pub in_window: bool,
}

/// Posts bucketed by the same weekly buckets the scoring uses, so the grouping matches how
/// points were actually earned.
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WeekGroup {
    /// 0-based week index from the competition start.
    pub week: i64,
    pub start_at: i64,
    pub end_at: i64,
    pub posts: Vec<PostStat>,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MemberDetail {
    pub org: OrgSummary,
    pub competition: Option<CompetitionInfo>,
    pub member_id: i64,
    pub display_name: String,
    pub profile_url: Option<String>,
    /// This member's row in the standings, when they have collected data.
    pub standing: Option<StandingRow>,
    pub weeks: Vec<WeekGroup>,
    /// Posts we hold that fall outside the competition window.
    pub outside_window: Vec<PostStat>,
}

// --- admin -----------------------------------------------------------------------------------

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteRow {
    pub code: String,
    pub role: String,
    pub redeemed: bool,
    pub created_at: i64,
}

/// Org-wide totals — the aggregate view, which the ranked list alone doesn't give you.
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Aggregate {
    pub participants: usize,
    pub scoring_participants: usize,
    pub total_posts: usize,
    pub graded_posts: usize,
    pub total_impressions: i64,
    pub total_reactions: i64,
    pub total_comments: i64,
    pub total_reposts: i64,
    pub total_followers: i64,
    pub total_points: f64,
    pub invites_open: usize,
    pub invites_redeemed: usize,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdminOverview {
    pub org: OrgSummary,
    pub admin_name: String,
    pub competitions: Vec<CompetitionInfo>,
    pub current: Option<CompetitionInfo>,
    pub standings: Vec<StandingRow>,
    pub invites: Vec<InviteRow>,
    pub aggregate: Aggregate,
    /// Sensible defaults for the "new competition" form.
    pub defaults: ScoringConfig,
}

// --- reads -----------------------------------------------------------------------------------

/// Enrol a member in a competition. Idempotent — the unique `entry_key` makes a repeat a no-op.
pub async fn enter_competition(
    db: &mut Db,
    competition_id: i64,
    member_id: i64,
) -> ApiResult<()> {
    let key = entry_key(competition_id, member_id);
    if CompetitionEntry::filter_by_entry_key(&key)
        .first()
        .exec(&mut *db)
        .await?
        .is_some()
    {
        return Ok(());
    }
    toasty::create!(CompetitionEntry {
        competition_id,
        member_id,
        entry_key: &key,
        joined_at: now_unix(),
    })
    .exec(&mut *db)
    .await?;
    Ok(())
}

/// Member ids entered in a competition.
pub async fn entrant_ids(db: &mut Db, competition_id: i64) -> ApiResult<Vec<i64>> {
    Ok(
        CompetitionEntry::filter(CompetitionEntry::fields().competition_id().eq(competition_id))
            .exec(&mut *db)
            .await?
            .into_iter()
            .map(|e| e.member_id)
            .collect(),
    )
}

/// Every competition a member has entered, newest first.
pub async fn competitions_for_member(
    db: &mut Db,
    member_id: i64,
) -> ApiResult<Vec<Competition>> {
    let entries = CompetitionEntry::filter(CompetitionEntry::fields().member_id().eq(member_id))
        .exec(&mut *db)
        .await?;
    let mut out = Vec::new();
    for e in entries {
        if let Some(c) = Competition::filter_by_id(e.competition_id)
            .first()
            .exec(&mut *db)
            .await?
        {
            out.push(c);
        }
    }
    out.sort_by(|a, b| b.start_at.cmp(&a.start_at));
    Ok(out)
}

/// The signed-in member, but only if they administer the org named by `slug`.
///
/// Org-scoped admin routes need this rather than a bare `is_admin`: the role lives on a member of
/// one particular org, so an admin of A must not be able to read or write B's data by putting B's
/// slug in the URL. Returns 404 for a wrong-org admin, not 403, so the URL doesn't confirm that the
/// other org exists.
pub async fn require_org_admin(
    db: &mut Db,
    headers: &http::HeaderMap,
    slug: &str,
) -> ApiResult<Member> {
    let Some(member) = crate::auth::current_admin(db, headers).await else {
        return Err(ApiError::unauthorized("admin session required"));
    };
    let org = org_by_slug(db, slug).await?;
    if member.org_id != org.id {
        return Err(ApiError::not_found("organization not found"));
    }
    Ok(member)
}

pub async fn org_by_slug(db: &mut Db, slug: &str) -> ApiResult<Org> {
    Org::filter_by_slug(slug)
        .first()
        .exec(&mut *db)
        .await?
        .ok_or_else(|| ApiError::not_found("organization not found"))
}

/// The org's public slug — the link target after signing in.
pub async fn org_slug(db: &mut Db, org_id: i64) -> ApiResult<String> {
    Ok(Org::filter_by_id(org_id)
        .first()
        .exec(&mut *db)
        .await?
        .map(|o| o.slug)
        .unwrap_or_default())
}

pub async fn current_competition(db: &mut Db, org_id: i64) -> ApiResult<Option<Competition>> {
    let comps = Competition::filter(Competition::fields().org_id().eq(org_id))
        .exec(&mut *db)
        .await?;
    Ok(active_competition(comps, now_unix()))
}

fn rank(standings: Vec<Standing>) -> Vec<StandingRow> {
    standings
        .into_iter()
        .enumerate()
        .map(|(i, s)| StandingRow::new(i + 1, s))
        .collect()
}

pub async fn leaderboard(db: &mut Db, slug: &str) -> ApiResult<Leaderboard> {
    let org = org_by_slug(db, slug).await?;
    let comp = current_competition(db, org.id).await?;

    let standings = match &comp {
        Some(c) => rank(compute_standings(db, c).await?),
        None => Vec::new(),
    };

    Ok(Leaderboard {
        org: OrgSummary {
            slug: org.slug,
            name: org.name,
        },
        competition: comp.as_ref().map(CompetitionInfo::new),
        standings,
    })
}

pub async fn org_detail(db: &mut Db, slug: &str) -> ApiResult<OrgDetail> {
    let org = org_by_slug(db, slug).await?;
    let mut comps = Competition::filter(Competition::fields().org_id().eq(org.id))
        .exec(&mut *db)
        .await?;
    comps.sort_by(|a, b| b.start_at.cmp(&a.start_at));

    let mut entrant_counts = Vec::new();
    for c in &comps {
        entrant_counts.push(entrant_ids(db, c.id).await?.len());
    }

    Ok(OrgDetail {
        org: OrgSummary {
            slug: org.slug,
            name: org.name,
        },
        competitions: comps.iter().map(CompetitionInfo::new).collect(),
        entrant_counts,
    })
}

/// The leaderboard for one specific competition.
pub async fn competition_leaderboard(
    db: &mut Db,
    slug: &str,
    competition_id: i64,
) -> ApiResult<Leaderboard> {
    let org = org_by_slug(db, slug).await?;
    let comp = Competition::filter_by_id(competition_id)
        .first()
        .exec(&mut *db)
        .await?
        // Scope the lookup to the org in the URL, or one org's competition id would resolve
        // under another org's slug.
        .filter(|c| c.org_id == org.id)
        .ok_or_else(|| ApiError::not_found("competition not found"))?;

    let standings = rank(compute_standings(db, &comp).await?);

    Ok(Leaderboard {
        org: OrgSummary {
            slug: org.slug,
            name: org.name,
        },
        competition: Some(CompetitionInfo::new(&comp)),
        standings,
    })
}

/// Every competition this member has entered, with their standing in each.
pub async fn my_competitions(db: &mut Db, member: &Member) -> ApiResult<Vec<MyCompetition>> {
    let org = Org::filter_by_id(member.org_id)
        .first()
        .exec(&mut *db)
        .await?
        .ok_or_else(|| ApiError::not_found("organization not found"))?;
    let summary = || OrgSummary {
        slug: org.slug.clone(),
        name: org.name.clone(),
    };

    let comps = competitions_for_member(db, member.id).await?;
    let mut out = Vec::new();
    for comp in comps {
        let standings = rank(compute_standings(db, &comp).await?);
        let entrants = entrant_ids(db, comp.id).await?.len();
        out.push(MyCompetition {
            org: summary(),
            competition: CompetitionInfo::new(&comp),
            standing: standings.into_iter().find(|s| s.member_id == member.id),
            entrants,
        });
    }
    Ok(out)
}

/// Latest snapshot per post, plus the earliest capture time (the fallback "posted at").
async fn post_stats(db: &mut Db, post: &Post) -> ApiResult<(PostStat, i64)> {
    let mut snaps = PostSnapshot::filter(PostSnapshot::fields().post_id().eq(post.id))
        .exec(&mut *db)
        .await?;
    snaps.sort_by_key(|s| s.captured_at);

    let earliest = snaps.first().map(|s| s.captured_at).unwrap_or(0);
    let latest = snaps.last();

    // Comments we actually read, minus the author's own — None when we've read none.
    let comment_rows = PostComment::filter(PostComment::fields().post_id().eq(post.id))
        .exec(&mut *db)
        .await?;
    let others = if comment_rows.is_empty() {
        None
    } else {
        Some(comment_rows.iter().filter(|c| !c.is_self).count() as i64)
    };

    let posted_at = if post.created_at > 0 {
        post.created_at
    } else {
        earliest
    };

    Ok((
        PostStat {
            id: post.id,
            urn: post.urn.clone(),
            permalink: post.permalink.clone(),
            posted_at,
            text_preview: post.text_preview.clone(),
            impressions: latest.and_then(|s| s.impressions).unwrap_or(0),
            reactions: latest.and_then(|s| s.reactions).unwrap_or(0),
            comments: latest.and_then(|s| s.comments).unwrap_or(0),
            comments_by_others: others.unwrap_or(latest.and_then(|s| s.comments).unwrap_or(0)),
            reposts: latest.and_then(|s| s.reposts).unwrap_or(0),
            sends: latest.and_then(|s| s.sends).unwrap_or(0),
            saves: latest.and_then(|s| s.saves).unwrap_or(0),
            impressions_in_network: latest.and_then(|s| s.impressions_in_network).unwrap_or(0),
            impressions_out_of_network: latest
                .and_then(|s| s.impressions_out_of_network)
                .unwrap_or(0),
            profile_viewers_from_post: latest
                .and_then(|s| s.profile_viewers_from_post)
                .unwrap_or(0),
            followers_from_post: latest.and_then(|s| s.followers_from_post).unwrap_or(0),
            in_window: false,
        },
        posted_at,
    ))
}

pub async fn member_detail(
    db: &mut Db,
    slug: &str,
    competition_id: i64,
    member_id: i64,
) -> ApiResult<MemberDetail> {
    let org = org_by_slug(db, slug).await?;

    let member = Member::filter_by_id(member_id)
        .first()
        .exec(&mut *db)
        .await?
        .filter(|m| m.org_id == org.id)
        .ok_or_else(|| ApiError::not_found("member not found in this organization"))?;

    // The competition named in the URL — not "whichever looks active" — so the weeks shown are the
    // ones the reader is looking at.
    let comp = Competition::filter_by_id(competition_id)
        .first()
        .exec(&mut *db)
        .await?
        .filter(|c| c.org_id == org.id);

    // This member's row, taken from the same ranked standings the leaderboard shows, so the rank
    // on a detail page always agrees with the rank on the board.
    let standing = match &comp {
        Some(c) => rank(compute_standings(db, c).await?)
            .into_iter()
            .find(|s| s.member_id == member_id),
        None => None,
    };

    let posts = Post::filter(Post::fields().member_id().eq(member.id))
        .exec(&mut *db)
        .await?;

    let mut in_window: Vec<(i64, PostStat)> = Vec::new();
    let mut outside: Vec<PostStat> = Vec::new();

    for post in &posts {
        let (mut stat, posted_at) = post_stats(db, post).await?;
        match &comp {
            Some(c) if posted_at >= c.start_at && posted_at <= c.end_at => {
                stat.in_window = true;
                in_window.push(((posted_at - c.start_at) / WEEK_SECONDS, stat));
            }
            _ => outside.push(stat),
        }
    }

    outside.sort_by(|a, b| b.posted_at.cmp(&a.posted_at));

    // Bucket into weeks, newest week first, newest post first inside each week.
    let mut weeks: Vec<WeekGroup> = Vec::new();
    if let Some(c) = &comp {
        let mut indexes: Vec<i64> = in_window.iter().map(|(w, _)| *w).collect();
        indexes.sort_unstable();
        indexes.dedup();
        for w in indexes.into_iter().rev() {
            let mut posts: Vec<PostStat> = in_window
                .iter()
                .filter(|(i, _)| *i == w)
                .map(|(_, s)| clone_stat(s))
                .collect();
            posts.sort_by(|a, b| b.posted_at.cmp(&a.posted_at));
            weeks.push(WeekGroup {
                week: w,
                start_at: c.start_at + w * WEEK_SECONDS,
                end_at: (c.start_at + (w + 1) * WEEK_SECONDS - 1).min(c.end_at),
                posts,
            });
        }
    }

    Ok(MemberDetail {
        org: OrgSummary {
            slug: org.slug,
            name: org.name,
        },
        competition: comp.as_ref().map(CompetitionInfo::new),
        member_id: member.id,
        display_name: member.display_name,
        profile_url: member.profile_url,
        standing,
        weeks,
        outside_window: outside,
    })
}

fn clone_stat(s: &PostStat) -> PostStat {
    PostStat {
        id: s.id,
        urn: s.urn.clone(),
        permalink: s.permalink.clone(),
        posted_at: s.posted_at,
        text_preview: s.text_preview.clone(),
        impressions: s.impressions,
        reactions: s.reactions,
        comments: s.comments,
        comments_by_others: s.comments_by_others,
        reposts: s.reposts,
        sends: s.sends,
        saves: s.saves,
        impressions_in_network: s.impressions_in_network,
        impressions_out_of_network: s.impressions_out_of_network,
        profile_viewers_from_post: s.profile_viewers_from_post,
        followers_from_post: s.followers_from_post,
        in_window: s.in_window,
    }
}

pub async fn admin_overview(db: &mut Db, admin: &Member) -> ApiResult<AdminOverview> {
    let org = Org::filter_by_id(admin.org_id)
        .first()
        .exec(&mut *db)
        .await?
        .ok_or_else(|| ApiError::not_found("organization not found"))?;

    let mut comps = Competition::filter(Competition::fields().org_id().eq(org.id))
        .exec(&mut *db)
        .await?;
    comps.sort_by(|a, b| b.start_at.cmp(&a.start_at));
    let competitions: Vec<CompetitionInfo> = comps.iter().map(CompetitionInfo::new).collect();

    let current = active_competition(comps, now_unix());
    let standings = match &current {
        Some(c) => rank(compute_standings(db, c).await?),
        None => Vec::new(),
    };

    let mut invites = Invite::filter(Invite::fields().org_id().eq(org.id))
        .exec(&mut *db)
        .await?;
    invites.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let members = Member::filter(Member::fields().org_id().eq(org.id))
        .exec(&mut *db)
        .await?;

    // Engagement totals come from the latest snapshot of every in-window post, which is the same
    // basis the scoring uses — so the aggregate and the leaderboard can't disagree.
    let mut totals = (0i64, 0i64, 0i64, 0i64);
    let mut total_posts = 0usize;
    for m in &members {
        let posts = Post::filter(Post::fields().member_id().eq(m.id))
            .exec(&mut *db)
            .await?;
        for post in &posts {
            let (stat, posted_at) = post_stats(db, post).await?;
            let counted = match &current {
                Some(c) => posted_at >= c.start_at && posted_at <= c.end_at,
                None => false,
            };
            if counted {
                total_posts += 1;
                totals.0 += stat.impressions;
                totals.1 += stat.reactions;
                totals.2 += stat.comments;
                totals.3 += stat.reposts;
            }
        }
    }

    let aggregate = Aggregate {
        participants: members.iter().filter(|m| !m.is_admin).count(),
        scoring_participants: standings.len(),
        total_posts,
        graded_posts: standings.iter().map(|s| s.graded_posts).sum(),
        total_impressions: totals.0,
        total_reactions: totals.1,
        total_comments: totals.2,
        total_reposts: totals.3,
        total_followers: standings.iter().map(|s| s.follower_count).sum(),
        total_points: standings.iter().map(|s| s.total).sum(),
        invites_open: invites.iter().filter(|i| !i.redeemed).count(),
        invites_redeemed: invites.iter().filter(|i| i.redeemed).count(),
    };

    Ok(AdminOverview {
        org: OrgSummary {
            slug: org.slug,
            name: org.name,
        },
        admin_name: admin.display_name.clone(),
        current: current.as_ref().map(CompetitionInfo::new),
        competitions,
        standings,
        invites: invites
            .into_iter()
            .map(|i| InviteRow {
                code: i.code,
                role: i.role,
                redeemed: i.redeemed,
                created_at: i.created_at,
            })
            .collect(),
        aggregate,
        defaults: ScoringConfig::default(),
    })
}
