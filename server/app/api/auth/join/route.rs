//! `POST /api/auth/join` — redeem an invite code into a real account.
//!
//! This is how participants get in. Everyone signs in to see anything, so a participant needs
//! credentials, not just an extension install: they redeem their invite here, and the response
//! carries the sync token to paste into the extension.

use axum::{Extension, Json};
use http::{HeaderMap, HeaderValue, header::SET_COOKIE};
use linkedin_challenge_server::auth::{establish_session, hash_password, member_by_email, verify_password};
use linkedin_challenge_server::models::{ChallengeMembership, Competition, Invite, Member, Org};
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

    let challenge = Competition::filter_by_id(invite.challenge_id)
        .first()
        .exec(&mut db)
        .await?
        .ok_or_else(|| ApiError::not_found("challenge not found"))?;
    let org = Org::filter_by_id(invite.org_id)
        .first().exec(&mut db).await?
        .ok_or_else(|| ApiError::not_found("account storage unavailable"))?;

    let email = req.email.trim().to_lowercase();
    if invite.email.as_deref().is_some_and(|recipient| recipient != email) {
        return Err(ApiError::bad_request(
            "this invitation was issued to a different email address",
        ));
    }
    // Until the extension pairs a real LinkedIn identity, the unique URN column holds a placeholder
    // derived from the email — see `app/api/link/route.rs`, which swaps in the real URN.
    let urn = format!("pending:{email}");

    let (member, secret) = match member_by_email(&mut db, &email).await? {
        Some(member) => {
            if !member.password_hash.as_deref().is_some_and(|hash| verify_password(&req.password, hash)) {
                return Err(ApiError::unauthorized("invalid email or password"));
            }
            (member, String::new())
        }
        None => {
            let (secret, token_hash) = new_bearer_token();
            let member = toasty::create!(Member {
                org_id: org.id,
                display_name: req.name.trim(),
                linkedin_urn: &urn,
                public_identifier: "",
                profile_url: None,
                is_admin: false,
                is_system_admin: false,
                email: Some(email),
                password_hash: Some(hash_password(&req.password)),
                api_token_hash: token_hash,
                created_at: now_unix(),
            })
            .exec(&mut db)
            .await?;
            (member, secret)
        }
    };

    let already_joined = ChallengeMembership::filter(
        ChallengeMembership::fields().challenge_id().eq(challenge.id),
    )
    .exec(&mut db)
    .await?
    .into_iter()
    .any(|membership| membership.member_id == member.id);
    if !already_joined {
        toasty::create!(ChallengeMembership {
            challenge_id: challenge.id,
            member_id: member.id,
            is_favorite: false,
            joined_at: now_unix(),
        })
        .exec(&mut db)
        .await?;
    }

    toasty::update!(Invite::filter_by_id(invite.id) { redeemed: true })
        .exec(&mut db)
        .await?;

    // Enter the org's live competitions, so a new joiner appears on the board without an admin
    // having to do anything. Finished ones are left alone — you can't retroactively compete.
    // Admins are entered too: they typically compete as well as organise.
    let cookie = establish_session(&mut db, member.id).await?;
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        headers.insert(SET_COOKIE, value);
    }

    Ok((
        headers,
        Json(JoinResponse {
            ok: true,
            org_slug: challenge.id.to_string(),
            org_name: challenge.name,
            member_id: member.id,
            sync_token: secret,
            is_admin: challenge.creator_id == member.id,
        }),
    ))
}
