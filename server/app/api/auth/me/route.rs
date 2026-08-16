//! `GET /api/auth/me` — who, if anyone, is signed in. The sidebar shell reads this for the org
//! name, the nav sections to show, and the impersonation banner.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::auth::current_session;
use linkedin_challenge_server::models::Org;
use linkedin_challenge_server::web::ApiError;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub signed_in: bool,
    pub display_name: Option<String>,
    pub org_slug: Option<String>,
    pub org_name: Option<String>,
    /// Whether this member administers their org — unlocks the Admin section.
    pub is_admin: bool,
    /// Whether this member operates the product — unlocks the System panel.
    pub is_system_admin: bool,
    pub member_id: Option<i64>,
    /// The system admin really driving this session, when it is an impersonation.
    pub impersonated_by: Option<String>,
}

fn signed_out() -> MeResponse {
    MeResponse {
        signed_in: false,
        display_name: None,
        org_slug: None,
        org_name: None,
        is_admin: false,
        is_system_admin: false,
        member_id: None,
        impersonated_by: None,
    }
}

#[nextrs::api(operation_id = "getMe")]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> Result<Json<MeResponse>, ApiError> {
    let Some(session) = current_session(&mut db, &headers).await else {
        return Ok(Json(signed_out()));
    };
    let member = session.member;

    let org = Org::filter_by_id(member.org_id)
        .first()
        .exec(&mut db)
        .await?;
    Ok(Json(MeResponse {
        signed_in: true,
        display_name: Some(member.display_name),
        org_slug: org.as_ref().map(|o| o.slug.clone()),
        org_name: org.map(|o| o.name),
        is_admin: member.is_admin,
        is_system_admin: member.is_system_admin,
        member_id: Some(member.id),
        impersonated_by: session.impersonator.map(|m| m.display_name),
    }))
}
