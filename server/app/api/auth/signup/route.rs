//! `POST /api/auth/signup` — create an independent user account, then sign them in.

use axum::{Extension, Json};
use http::{HeaderMap, HeaderValue, header::SET_COOKIE};
use linkedin_challenge_server::auth::{
    account_validation_error, establish_session, hash_password, member_by_email,
};
use linkedin_challenge_server::models::{Member, Org};
use linkedin_challenge_server::util::{new_bearer_token, now_unix};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignupRequest {
    pub name: String,
    pub email: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignupResponse {
    pub ok: bool,
    pub org_slug: String,
}

#[nextrs::api(
    operation_id = "signup",
    responses(
        (status = 200, description = "Organization created; session cookie set", body = SignupResponse),
        (status = 400, description = "Password too short", body = ApiError),
        (status = 409, description = "Email already registered", body = ApiError),
    ),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    Json(req): Json<SignupRequest>,
) -> ApiResult<(HeaderMap, Json<SignupResponse>)> {
    if let Some(error) = account_validation_error(&req.name, &req.email, &req.password) {
        return Err(ApiError::bad_request(error));
    }

    let email = req.email.trim().to_lowercase();
    // Placeholder for the unique LinkedIn URN column until the extension pairs a real identity;
    // the same shape join uses, so one prefix covers every un-linked member.
    let urn = format!("pending:{email}");

    if member_by_email(&mut db, &email).await?.is_some() {
        return Err(ApiError::conflict(
            "an account with that email already exists",
        ));
    }

    // `org_id` remains a required legacy storage column during the migration, but it is no longer
    // an ownership or authorization boundary. Every new independent account uses this inert row.
    let org = match Org::filter_by_slug("users").first().exec(&mut db).await? {
        Some(org) => org,
        None => toasty::create!(Org { slug: "users", name: "Users", created_at: now_unix() })
            .exec(&mut db)
            .await?,
    };

    // Admins get a unique placeholder api_token_hash (never handed out) so the column stays unique.
    let (_unused, token_hash) = new_bearer_token();
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

    let cookie = establish_session(&mut db, member.id).await?;
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        headers.insert(SET_COOKIE, value);
    }

    Ok((
        headers,
        Json(SignupResponse {
            ok: true,
            org_slug: String::new(),
        }),
    ))
}
