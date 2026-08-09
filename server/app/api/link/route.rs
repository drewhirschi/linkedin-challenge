//! `POST /api/link` — bind a LinkedIn identity to an already-registered member.
//!
//! The pairing secret is the member's **sync token**, issued at `/api/auth/join` and shown once on
//! the confirmation screen. It used to be the invite code, but invites now create the web account
//! (everyone signs in), so the invite is spent before the extension ever runs. Authenticating with
//! the sync token also means this endpoint no longer creates accounts — it only fills in the
//! LinkedIn identity of an account that already exists.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::auth::member_from_bearer;
use linkedin_challenge_server::dto::org_slug;
use linkedin_challenge_server::models::{Member, Org};
use linkedin_challenge_server::web::ApiError;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkRequest {
    pub member: MemberInfo,
}

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MemberInfo {
    pub member_urn: String,
    pub public_identifier: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub profile_url: Option<String>,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkResponse {
    pub org_name: String,
    pub display_name: String,
    pub member_id: i64,
    pub org_slug: String,
}

#[nextrs::api(
    operation_id = "linkIdentity",
    responses(
        (status = 200, description = "LinkedIn identity bound to this account", body = LinkResponse),
        (status = 401, description = "Invalid or missing sync token", body = ApiError),
        (status = 409, description = "That LinkedIn account is linked to someone else", body = ApiError),
    ),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Json(req): Json<LinkRequest>,
) -> Result<Json<LinkResponse>, ApiError> {
    let Some(member) = member_from_bearer(&mut db, &headers).await else {
        return Err(ApiError::unauthorized("invalid or missing sync token"));
    };

    // The URN is globally unique, so refuse to steal it from another account. Re-linking the same
    // LinkedIn profile to the same member stays idempotent.
    if let Some(existing) = Member::filter_by_linkedin_urn(&req.member.member_urn)
        .first()
        .exec(&mut db)
        .await?
        && existing.id != member.id
    {
        return Err(ApiError::conflict(
            "this LinkedIn account is already linked to another member",
        ));
    }

    let name = display_name(&req.member).unwrap_or_else(|| member.display_name.clone());

    toasty::update!(Member::filter_by_id(member.id) {
        linkedin_urn: &req.member.member_urn,
        public_identifier: req.member.public_identifier.as_deref().unwrap_or(""),
        profile_url: req.member.profile_url.clone(),
        display_name: &name,
    })
    .exec(&mut db)
    .await?;

    let org = Org::filter_by_id(member.org_id)
        .first()
        .exec(&mut db)
        .await?
        .ok_or_else(|| ApiError::not_found("organization not found"))?;

    Ok(Json(LinkResponse {
        org_name: org.name,
        display_name: name,
        member_id: member.id,
        org_slug: org_slug(&mut db, member.org_id).await?,
    }))
}

/// Prefer the LinkedIn name, then the public identifier; `None` means keep what we already have.
fn display_name(m: &MemberInfo) -> Option<String> {
    let full = format!(
        "{} {}",
        m.first_name.as_deref().unwrap_or(""),
        m.last_name.as_deref().unwrap_or("")
    )
    .trim()
    .to_string();
    if !full.is_empty() {
        Some(full)
    } else {
        m.public_identifier.clone().filter(|s| !s.is_empty())
    }
}
