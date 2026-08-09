//! `GET /api/orgs/{slug}/competitions/{cid}/aggregate` — org-wide totals for one competition.
//!
//! Admin-only, and separate from the leaderboard so the board itself stays identical for every
//! reader (and therefore seedable and cacheable). The competition page fetches this in addition
//! when the viewer administers the org.

use axum::extract::Path;
use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::{Aggregate, competition_aggregate};
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(
    get,
    operation_id = "getCompetitionAggregate",
    responses(
        (status = 200, description = "Totals across this competition", body = Aggregate),
        (status = 401, description = "Not signed in as an admin", body = ApiError),
        (status = 404, description = "No such organization or competition", body = ApiError),
    ),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Path((slug, cid)): Path<(String, i64)>,
) -> Result<Json<Aggregate>, ApiError> {
    Ok(Json(competition_aggregate(&mut db, &headers, &slug, cid).await?))
}
