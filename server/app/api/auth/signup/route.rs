//! `POST /api/auth/signup` — create an organization and its first admin, then sign them in.

use axum::{Extension, Json};
use http::{HeaderMap, HeaderValue, header::SET_COOKIE};
use linkedin_challenge_server::auth::{establish_session, hash_password, member_by_email};
use linkedin_challenge_server::models::{Member, Org};
use linkedin_challenge_server::util::{new_bearer_token, now_unix};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignupRequest {
    pub org_name: String,
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
    post,
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
    if req.password.len() < 8 {
        return Err(ApiError::bad_request(
            "password must be at least 8 characters",
        ));
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

    let slug = unique_slug(&mut db, &slugify(&req.org_name)).await?;
    let org = toasty::create!(Org {
        slug: &slug,
        name: req.org_name.trim(),
        created_at: now_unix(),
    })
    .exec(&mut db)
    .await?;

    // Admins get a unique placeholder api_token_hash (never handed out) so the column stays unique.
    let (_unused, token_hash) = new_bearer_token();
    let member = toasty::create!(Member {
        org_id: org.id,
        display_name: req.name.trim(),
        linkedin_urn: &urn,
        public_identifier: "",
        profile_url: None,
        is_admin: true,
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
            org_slug: slug,
        }),
    ))
}

fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in s.trim().to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "org".to_string()
    } else {
        trimmed
    }
}

async fn unique_slug(db: &mut Db, base: &str) -> ApiResult<String> {
    let mut candidate = base.to_string();
    let mut n = 1;
    while Org::filter_by_slug(&candidate)
        .first()
        .exec(&mut *db)
        .await?
        .is_some()
    {
        n += 1;
        candidate = format!("{base}-{n}");
    }
    Ok(candidate)
}
