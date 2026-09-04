//! `PUT /api/challenges/{id}` — an owner edits a challenge's name, window, and scoring rules.
//!
//! Scores are derived at read time, so changing the rules re-scores the whole board on the next
//! request; nothing stored has to be recomputed.

use axum::extract::Path;
use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::{CompetitionInfo, require_challenge_owner};
use linkedin_challenge_server::enroll::enroll_everyone;
use linkedin_challenge_server::models::Competition;
use linkedin_challenge_server::scoring::ScoringConfig;
use linkedin_challenge_server::util::{now_unix, parse_date};
use linkedin_challenge_server::web::ApiError;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChallengeRequest {
    pub name: String,
    /// `YYYY-MM-DD`
    pub start: String,
    /// `YYYY-MM-DD`, inclusive.
    pub end: String,
    pub is_active: bool,
    pub config: ScoringConfig,
}

#[nextrs::api(operation_id = "updateChallenge")]
pub async fn put(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(req): Json<UpdateChallengeRequest>,
) -> Result<Json<CompetitionInfo>, ApiError> {
    let (_owner, challenge) = require_challenge_owner(&mut db, &headers, id).await?;
    let name = req.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("challenge name is required"));
    }
    let start = parse_date(&req.start).ok_or_else(|| ApiError::bad_request("invalid start date"))?;
    let end = parse_date(&req.end).map(|value| value + 86_399)
        .ok_or_else(|| ApiError::bad_request("invalid end date"))?;
    if end <= start {
        return Err(ApiError::bad_request("end date must be after the start"));
    }
    let c = req.config;
    toasty::update!(Competition::filter_by_id(challenge.id) {
        name,
        start_at: start,
        end_at: end,
        is_active: req.is_active,
        max_posts_per_week: c.max_posts_per_week as i64,
        per_post: c.per_post,
        per_active_week: c.per_active_week,
        streak_short_weeks: c.streak_short_weeks as i64,
        streak_short_bonus: c.streak_short_bonus,
        streak_long_weeks: c.streak_long_weeks as i64,
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
    })
    .exec(&mut db)
    .await?;

    // A window edit can make the challenge "running" — everyone is in when it is.
    if req.is_active && start <= now_unix() && now_unix() <= end {
        enroll_everyone(&mut db).await?;
    }

    let updated = Competition::filter_by_id(challenge.id)
        .first()
        .exec(&mut db)
        .await?
        .ok_or_else(|| ApiError::not_found("challenge not found"))?;
    let mut info = CompetitionInfo::new(&updated);
    info.is_owner = true;
    Ok(Json(info))
}
