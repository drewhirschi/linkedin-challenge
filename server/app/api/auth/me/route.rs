//! `GET /api/auth/me` — who, if anyone, is signed in. The root layout reads this to decide
//! between "Admin login" and the dashboard link.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::auth::current_member;
use linkedin_challenge_server::dto::org_slug;
use linkedin_challenge_server::web::ApiResult;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub signed_in: bool,
    pub display_name: Option<String>,
    pub org_slug: Option<String>,
    /// Whether this member administers their org — the dashboard is the only thing it unlocks.
    pub is_admin: bool,
    pub member_id: Option<i64>,
}

#[nextrs::api(
    get,
    operation_id = "getMe",
    responses((status = 200, description = "Current session", body = MeResponse)),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> ApiResult<Json<MeResponse>> {
    let Some(member) = current_member(&mut db, &headers).await else {
        return Ok(Json(MeResponse {
            signed_in: false,
            display_name: None,
            org_slug: None,
            is_admin: false,
            member_id: None,
        }));
    };

    let slug = org_slug(&mut db, member.org_id).await?;
    Ok(Json(MeResponse {
        signed_in: true,
        display_name: Some(member.display_name),
        org_slug: Some(slug),
        is_admin: member.is_admin,
        member_id: Some(member.id),
    }))
}
