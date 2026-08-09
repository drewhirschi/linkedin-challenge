//! `POST /api/auth/join` — redeem an invite code into a real account.
//!
//! This is how participants get in. Everyone signs in to see anything, so a participant needs
//! credentials, not just an extension install: they redeem their invite here, and the response
//! carries the sync token to paste into the extension.

use axum::{Extension, Json};
use http::{HeaderMap, HeaderValue, header::SET_COOKIE};
use linkedin_challenge_server::auth::{establish_session, hash_password, member_by_email};
use linkedin_challenge_server::dto::enter_competition;
use linkedin_challenge_server::models::{Competition, Invite, Member, Org};
use linkedin_challenge_server::util::{new_bearer_token, now_unix};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct JoinRequest {
    pub invite_code: String,
    pub name: String,
    pub email: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct JoinResponse {
    pub ok: bool,
    pub org_slug: String,
    pub org_name: String,
    pub member_id: i64,
    /// Shown once, on the confirmation screen — paste it into the extension to start syncing.
    pub sync_token: String,
    pub is_admin: bool,
}

#[nextrs::api(
    operation_id = "joinWithInvite",
    responses(
        (status = 200, description = "Account created and signed in", body = JoinResponse),
        (status = 400, description = "Password too short", body = ApiError),
        (status = 404, description = "Invite code not found or already used", body = ApiError),
        (status = 409, description = "Email already registered", body = ApiError),
    ),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    Json(req): Json<JoinRequest>,
) -> ApiResult<(HeaderMap, Json<JoinResponse>)> {
    if req.password.len() < 8 {
        return Err(ApiError::bad_request(
            "password must be at least 8 characters",
        ));
    }

    let invite = Invite::filter_by_code(req.invite_code.trim())
        .first()
        .exec(&mut db)
        .await?
        .filter(|i| !i.redeemed)
        .ok_or_else(|| ApiError::not_found("invite code not found or already used"))?;

    let org = Org::filter_by_id(invite.org_id)
        .first()
        .exec(&mut db)
        .await?
        .ok_or_else(|| ApiError::not_found("organization not found"))?;

    let email = req.email.trim().to_lowercase();
    // Until the extension pairs a real LinkedIn identity, the unique URN column holds a placeholder
    // derived from the email — see `app/api/link/route.rs`, which swaps in the real URN.
    let urn = format!("pending:{email}");

    if member_by_email(&mut db, &email).await?.is_some() {
        return Err(ApiError::conflict(
            "an account with that email already exists",
        ));
    }

    let (secret, token_hash) = new_bearer_token();
    let member = toasty::create!(Member {
        org_id: org.id,
        display_name: req.name.trim(),
        linkedin_urn: &urn,
        public_identifier: "",
        profile_url: None,
        is_admin: invite.role == "admin",
        email: Some(email),
        password_hash: Some(hash_password(&req.password)),
        api_token_hash: token_hash,
        created_at: now_unix(),
    })
    .exec(&mut db)
    .await?;

    toasty::update!(Invite::filter_by_id(invite.id) { redeemed: true })
        .exec(&mut db)
        .await?;

    // Enter the org's live competitions, so a new joiner appears on the board without an admin
    // having to do anything. Finished ones are left alone — you can't retroactively compete.
    // Admins are entered too: they typically compete as well as organise.
    let comps = Competition::filter(Competition::fields().org_id().eq(org.id))
        .exec(&mut db)
        .await?;
    let now = now_unix();
    for c in comps.iter().filter(|c| c.is_active && c.end_at >= now) {
        enter_competition(&mut db, c.id, member.id).await?;
    }

    let cookie = establish_session(&mut db, member.id).await?;
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        headers.insert(SET_COOKIE, value);
    }

    Ok((
        headers,
        Json(JoinResponse {
            ok: true,
            org_slug: org.slug,
            org_name: org.name,
            member_id: member.id,
            sync_token: secret,
            is_admin: member.is_admin,
        }),
    ))
}
