//! `POST /api/orgs/{slug}/admin/competitions` — create a competition with its scoring rules.

use axum::extract::Path;
use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::require_org_admin;
use linkedin_challenge_server::models::Competition;
use linkedin_challenge_server::scoring::ScoringConfig;
use linkedin_challenge_server::util::{now_unix, parse_date};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCompetitionRequest {
    pub name: String,
    /// `YYYY-MM-DD`.
    pub start: String,
    /// `YYYY-MM-DD`, inclusive through end of day.
    pub end: String,
    pub config: ScoringConfig,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateCompetitionResponse {
    pub id: i64,
}

#[nextrs::api(
    post,
    operation_id = "createCompetition",
    responses(
        (status = 200, description = "Competition created", body = CreateCompetitionResponse),
        (status = 400, description = "Missing name", body = ApiError),
        (status = 401, description = "Not signed in as an admin", body = ApiError),
    ),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(req): Json<CreateCompetitionRequest>,
) -> ApiResult<Json<CreateCompetitionResponse>> {
    let admin = require_org_admin(&mut db, &headers, &slug).await?;

    let name = req.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("competition name is required"));
    }

    let start = parse_date(&req.start).unwrap_or_else(now_unix);
    // Treat the end date as inclusive through end-of-day.
    let end = parse_date(&req.end)
        .map(|e| e + 86_399)
        .unwrap_or_else(|| now_unix() + 90 * 86400);
    if end <= start {
        return Err(ApiError::bad_request("end date must be after the start"));
    }

    let comp = toasty::create!(Competition {
        org_id: admin.org_id,
        name,
        start_at: start,
        end_at: end,
        max_posts_per_week: req.config.max_posts_per_week as i64,
        per_reaction: req.config.per_reaction,
        per_comment: req.config.per_comment,
        per_repost: req.config.per_repost,
        per_send: req.config.per_send,
        per_save: req.config.per_save,
        per_impression: req.config.per_impression,
        per_follower_gained: req.config.per_follower_gained,
        per_profile_view: req.config.per_profile_view,
        normalize_by_followers: req.config.normalize_by_followers,
        follower_baseline: req.config.follower_baseline,
        is_active: true,
        created_at: now_unix(),
    })
    .exec(&mut db)
    .await?;

    Ok(Json(CreateCompetitionResponse { id: comp.id }))
}
