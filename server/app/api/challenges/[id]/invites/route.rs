//! `POST /api/challenges/{id}/invites` — invite users to a challenge the viewer created.

use axum::extract::Path;
use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::{InviteRow, require_member};
use linkedin_challenge_server::models::{Competition, Invite};
use linkedin_challenge_server::util::{invite_code, now_unix};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvitesRequest { pub emails: Vec<String> }

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateInvitesResponse { pub codes: Vec<String> }

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChallengeInvitesResponse { pub invites: Vec<InviteRow> }

#[nextrs::api(operation_id = "getChallengeInvites")]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<ChallengeInvitesResponse>, ApiError> {
    let creator = require_member(&mut db, &headers).await?;
    Competition::filter_by_id(id).first().exec(&mut db).await?
        .filter(|challenge| challenge.creator_id == creator.id)
        .ok_or_else(|| ApiError::not_found("challenge not found"))?;
    let mut invites = Invite::filter(Invite::fields().challenge_id().eq(id))
        .exec(&mut db).await?;
    invites.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(Json(ChallengeInvitesResponse {
        invites: invites.into_iter().map(|invite| InviteRow {
            code: invite.code,
            email: invite.email,
            role: invite.role,
            redeemed: invite.redeemed,
            created_at: invite.created_at,
        }).collect(),
    }))
}

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
    let mut emails: Vec<String> = req.emails.into_iter()
        .map(|email| email.trim().to_lowercase())
        .filter(|email| !email.is_empty())
        .collect();
    emails.sort();
    emails.dedup();
    if emails.is_empty() {
        return Err(ApiError::bad_request("enter at least one email address"));
    }
    if emails.len() > 100 {
        return Err(ApiError::bad_request("invite at most 100 people at a time"));
    }
    if let Some(email) = emails.iter().find(|email| !valid_email(email)) {
        return Err(ApiError::bad_request(format!("invalid email address: {email}")));
    }

    let existing = Invite::filter(Invite::fields().challenge_id().eq(challenge.id))
        .exec(&mut db).await?;
    let mut codes = Vec::new();
    for email in emails {
        if existing.iter().any(|invite| !invite.redeemed && invite.email.as_deref() == Some(&email)) {
            continue;
        }
        let code = unique_invite_code(&mut db).await?;
        toasty::create!(Invite {
            challenge_id: challenge.id,
            org_id: creator.org_id,
            code: &code,
            email: Some(email),
            role: "participant",
            redeemed: false,
            created_at: now_unix(),
        }).exec(&mut db).await?;
        codes.push(code);
    }
    Ok(Json(CreateInvitesResponse { codes }))
}

fn valid_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else { return false };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

async fn unique_invite_code(db: &mut Db) -> ApiResult<String> {
    loop {
        let code = invite_code();
        if Invite::filter_by_code(&code).first().exec(&mut *db).await?.is_none() {
            return Ok(code);
        }
    }
}
