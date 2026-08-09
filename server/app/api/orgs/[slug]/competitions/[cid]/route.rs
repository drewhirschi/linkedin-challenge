//! `GET /api/orgs/{slug}/competitions/{cid}` — one competition's leaderboard and its rules.
//!
//! The leaderboard is per-competition now, not per-org: an org can run several at once, and each
//! ranks only the members who entered it.

use axum::extract::Path;
use axum::{Extension, Json};
use linkedin_challenge_server::dto::{Leaderboard, competition_leaderboard};
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(
    operation_id = "getCompetitionLeaderboard",
    responses(
        (status = 200, description = "Standings for this competition", body = Leaderboard),
        (status = 404, description = "No such organization or competition", body = ApiError),
    ),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
    Path((slug, cid)): Path<(String, i64)>,
) -> Result<Json<Leaderboard>, ApiError> {
    Ok(Json(competition_leaderboard(&mut db, &slug, cid).await?))
}
