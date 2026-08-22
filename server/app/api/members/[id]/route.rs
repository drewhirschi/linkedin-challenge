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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<usize>,
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
    let sort = q.sort.as_deref().unwrap_or("newest");
    if !["newest", "oldest", "impressions", "reactions", "comments", "reposts", "sends", "saves"]
        .contains(&sort)
    {
        return Err(ApiError::bad_request("invalid post sort"));
    }
    let page_size = q.page_size.unwrap_or(50).clamp(1, 100);
    Ok(Json(member_detail(
        &mut db,
        &org,
        q.challenge_id,
        id,
        q.filter.as_deref(),
        sort,
        q.page.unwrap_or(1).max(1),
        page_size,
    ).await?))
}
