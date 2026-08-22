//! `POST /api/auth/device/session` — turn an existing website session into a device sync token.
//!
//! Lets the extension notice you are already signed in on the site and link without asking for a
//! password again. The extension reads the session cookie out of the browser's jar with
//! `chrome.cookies` (it holds an explicit host permission for the server) and posts the value here.
//!
//! It arrives in the body rather than as a `Cookie` header because `fetch` cannot set that header
//! cross-origin, and the alternative — allowing credentialed cross-origin requests — would mean
//! reflecting arbitrary origins and opening a CSRF surface on every cookie-authed route.

use axum::{Extension, Json};
use linkedin_challenge_server::auth::member_from_session_token;
use linkedin_challenge_server::models::Member;
use linkedin_challenge_server::util::new_bearer_token;
use linkedin_challenge_server::web::ApiError;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionDeviceRequest {
    /// Value of the `session` cookie for this server.
    pub session_token: String,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionDeviceResponse {
    pub sync_token: String,
    pub display_name: String,
    pub org_name: String,
    pub org_slug: String,
    pub member_id: i64,
    /// True once a LinkedIn identity is bound; false means this is a first link.
    pub linked: bool,
}

#[nextrs::api(
    operation_id = "signInDeviceWithSession",
    responses(
        (status = 200, description = "Sync token issued for this device", body = SessionDeviceResponse),
        (status = 401, description = "No valid website session", body = ApiError),
    ),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    Json(req): Json<SessionDeviceRequest>,
) -> Result<Json<SessionDeviceResponse>, ApiError> {
    let Some(member) = member_from_session_token(&mut db, &req.session_token).await else {
        return Err(ApiError::unauthorized("not signed in"));
    };

    let (secret, token_hash) = new_bearer_token();
    toasty::update!(Member::filter_by_id(member.id) { api_token_hash: token_hash })
        .exec(&mut db)
        .await?;

    Ok(Json(SessionDeviceResponse {
        sync_token: secret,
        display_name: member.display_name,
        org_name: "Challenge Sync".into(),
        org_slug: String::new(),
        member_id: member.id,
        linked: !member.linkedin_urn.starts_with("pending:"),
    }))
}
