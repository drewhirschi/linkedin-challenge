//! `POST /api/auth/logout` — drop the session row and clear the cookie.

use axum::{Extension, Json};
use http::{HeaderMap, HeaderValue, header::SET_COOKIE};
use linkedin_challenge_server::auth::end_session;
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, ToSchema)]
pub struct LogoutResponse {
    pub ok: bool,
}

/// Sign out
//
// The tuple return (headers + body) is what clears the cookie, and inference cannot see a body
// through it — so this response stays declared by hand.
#[nextrs::api(
    operation_id = "logout",
    responses((status = 200, body = LogoutResponse)),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> (HeaderMap, Json<LogoutResponse>) {
    let cookie = end_session(&mut db, &headers).await;

    let mut out = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        out.insert(SET_COOKIE, value);
    }
    (out, Json(LogoutResponse { ok: true }))
}
