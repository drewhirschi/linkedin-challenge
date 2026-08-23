//! Pending challenge invitations addressed to the signed-in account.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::require_member;
use linkedin_challenge_server::models::{Competition, Invite, Member};
use linkedin_challenge_server::web::ApiError;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PendingChallengeInvite {
    pub code: String,
    pub challenge_id: i64,
    pub challenge_name: String,
    pub invited_by: String,
    pub start_at: i64,
    pub end_at: i64,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MyInvitesResponse { pub invites: Vec<PendingChallengeInvite> }

#[nextrs::api(operation_id = "getMyInvites")]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> Result<Json<MyInvitesResponse>, ApiError> {
    let member = require_member(&mut db, &headers).await?;
    let email = member.email.as_deref().unwrap_or_default().to_lowercase();
    let mut rows = Vec::new();
    for invite in Invite::all().exec(&mut db).await?.into_iter()
        .filter(|invite| !invite.redeemed && invite.email.as_deref() == Some(email.as_str()))
    {
        let Some(challenge) = Competition::filter_by_id(invite.challenge_id).first().exec(&mut db).await? else { continue };
        let invited_by = Member::filter_by_id(challenge.creator_id).first().exec(&mut db).await?
            .map(|creator| creator.display_name)
            .unwrap_or_else(|| "Challenge organizer".to_string());
        rows.push(PendingChallengeInvite {
            code: invite.code,
            challenge_id: challenge.id,
            challenge_name: challenge.name,
            invited_by,
            start_at: challenge.start_at,
            end_at: challenge.end_at,
        });
    }
    rows.sort_by(|a, b| b.start_at.cmp(&a.start_at));
    Ok(Json(MyInvitesResponse { invites: rows }))
}
