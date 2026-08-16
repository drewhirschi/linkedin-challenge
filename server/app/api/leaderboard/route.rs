//! `GET /api/leaderboard` — the viewer's org's board: the named challenge, or the current one.

use axum::extract::Query;
use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::{Leaderboard, leaderboard, org_of, require_member};
use linkedin_challenge_server::web::ApiError;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::IntoParams;

#[derive(Serialize, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardQuery {
    /// A specific challenge to rank; omitted means the org's current one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub challenge_id: Option<i64>,
}

#[nextrs::api(operation_id = "getLeaderboard")]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Query(q): Query<LeaderboardQuery>,
) -> Result<Json<Leaderboard>, ApiError> {
    let member = require_member(&mut db, &headers).await?;
    let org = org_of(&mut db, &member).await?;
    Ok(Json(leaderboard(&mut db, &org, q.challenge_id).await?))
}
