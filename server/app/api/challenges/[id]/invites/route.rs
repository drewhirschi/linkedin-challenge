//! `POST /api/challenges/{id}/invites` — invite users to a challenge the viewer created.

use axum::extract::Path;
use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::require_member;
use linkedin_challenge_server::models::{Competition, Invite};
use linkedin_challenge_server::util::{invite_code, now_unix};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvitesRequest { pub count: Option<u32> }

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvitesResponse { pub codes: Vec<String> }

#[nextrs::api(operation_id = "createInvites")]
pub async fn post(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(req): Json<CreateInvitesRequest>,
) -> Result<Json<CreateInvitesResponse>, ApiError> {
    let creator = require_member(&mut db, &headers).await?;
    let challenge = Competition::filter_by_id(id).first().exec(&mut db).await?
        .filter(|challenge| challenge.creator_id == creator.id)
        .ok_or_else(|| ApiError::not_found("challenge not found"))?;
    let mut codes = Vec::new();
    for _ in 0..req.count.unwrap_or(1).clamp(1, 100) {
        let code = unique_invite_code(&mut db).await?;
        toasty::create!(Invite {
            challenge_id: challenge.id,
            org_id: creator.org_id,
            code: &code,
            role: "participant",
            redeemed: false,
            created_at: now_unix(),
        }).exec(&mut db).await?;
        codes.push(code);
    }
    Ok(Json(CreateInvitesResponse { codes }))
}

async fn unique_invite_code(db: &mut Db) -> ApiResult<String> {
    loop {
        let code = invite_code();
        if Invite::filter_by_code(&code).first().exec(&mut *db).await?.is_none() {
            return Ok(code);
        }
    }
}
