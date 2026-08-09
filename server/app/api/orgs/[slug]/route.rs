//! `GET /api/orgs/{slug}` — the org and its competitions.
//!
//! This used to BE the leaderboard, silently picking whichever competition looked active. Now that
//! an org can run several, it lists them and the leaderboard lives under one.

use axum::extract::Path;
use axum::{Extension, Json};
use linkedin_challenge_server::dto::{OrgDetail, org_detail};
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(
    get,
    operation_id = "getOrg",
    responses(
        (status = 200, description = "The org and its competitions", body = OrgDetail),
        (status = 404, description = "No such organization", body = ApiError),
    ),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
    Path(slug): Path<String>,
) -> Result<Json<OrgDetail>, ApiError> {
    Ok(Json(org_detail(&mut db, &slug).await?))
}
