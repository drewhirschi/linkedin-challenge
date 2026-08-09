//! `GET /api/orgs/{slug}` — the public leaderboard plus the scoring rules behind it.

use axum::extract::Path;
use axum::{Extension, Json};
use linkedin_challenge_server::dto::{Leaderboard, leaderboard};
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(
    get,
    operation_id = "getLeaderboard",
    responses(
        (status = 200, description = "Standings and competition rules", body = Leaderboard),
        (status = 404, description = "No such organization", body = ApiError),
    ),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
    Path(slug): Path<String>,
) -> Result<Json<Leaderboard>, ApiError> {
    Ok(Json(leaderboard(&mut db, &slug).await?))
}
