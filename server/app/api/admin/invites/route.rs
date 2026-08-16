//! `POST /api/admin/invites` — mint one or more single-use invite codes for the viewer's org.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::require_admin;
use linkedin_challenge_server::models::Invite;
use linkedin_challenge_server::util::{invite_code, now_unix};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvitesRequest {
    pub count: Option<u32>,
    /// `"participant"` (default) or `"admin"`.
    pub role: Option<String>,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvitesResponse {
    pub codes: Vec<String>,
}

#[nextrs::api(
    operation_id = "createInvites",
    responses(
        (status = 200, description = "Codes generated", body = CreateInvitesResponse),
        (status = 401, description = "Not signed in as an admin", body = ApiError),
    ),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Json(req): Json<CreateInvitesRequest>,
) -> Result<Json<CreateInvitesResponse>, ApiError> {
    let admin = require_admin(&mut db, &headers).await?;

    let count = req.count.unwrap_or(1).clamp(1, 100);
    let role = match req.role.as_deref() {
        Some("admin") => "admin",
        _ => "participant",
    };

    let mut codes = Vec::new();
    for _ in 0..count {
        let code = unique_invite_code(&mut db).await?;
        toasty::create!(Invite {
            org_id: admin.org_id,
            code: &code,
            role,
            redeemed: false,
            created_at: now_unix(),
        })
        .exec(&mut db)
        .await?;
        codes.push(code);
    }

    Ok(Json(CreateInvitesResponse { codes }))
}

async fn unique_invite_code(db: &mut Db) -> ApiResult<String> {
    loop {
        let code = invite_code();
        if Invite::filter_by_code(&code)
            .first()
            .exec(&mut *db)
            .await?
            .is_none()
        {
            return Ok(code);
        }
    }
}
