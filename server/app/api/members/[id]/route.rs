//! `GET /api/members/{id}` — one member's posts and analytics for a challenge window.
//! Serves both "my results" (the viewer's own id) and the drill-in from a leaderboard row.
//! Scoped to the viewer's org: another org's member id reads as absent.

use axum::extract::{Path, Query};
use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::{MemberDetail, member_detail, org_of, require_member};
use linkedin_challenge_server::web::ApiError;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::IntoParams;

#[derive(Serialize, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct MemberDetailQuery {
    /// The challenge window to bucket posts into; omitted means the org's current one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub challenge_id: Option<i64>,
}

#[nextrs::api(operation_id = "getMemberDetail")]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Query(q): Query<MemberDetailQuery>,
) -> Result<Json<MemberDetail>, ApiError> {
    let member = require_member(&mut db, &headers).await?;
    let org = org_of(&mut db, &member).await?;
    Ok(Json(member_detail(&mut db, &org, q.challenge_id, id).await?))
}
