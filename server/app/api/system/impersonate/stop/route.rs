//! `POST /api/system/impersonate/stop` — return to the operator's own account.
//!
//! Authenticated by the impersonation session itself (the operator's original cookie is gone —
//! the browser holds one cookie), so the guard is "this session HAS an impersonator", and
//! `session_from_token` has already verified that impersonator still holds the system flag.

use axum::{Extension, Json};
use http::{HeaderMap, HeaderValue, header::SET_COOKIE};
use linkedin_challenge_server::auth::{current_session, establish_session};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StopImpersonationResponse {
    pub ok: bool,
    pub display_name: String,
}

#[nextrs::api(
    operation_id = "stopImpersonation",
    responses(
        (status = 200, description = "Back to the operator's own session", body = StopImpersonationResponse),
        (status = 400, description = "This session is not an impersonation", body = ApiError),
    ),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> ApiResult<(HeaderMap, Json<StopImpersonationResponse>)> {
    let session = current_session(&mut db, &headers)
        .await
        .ok_or_else(|| ApiError::unauthorized("sign-in required"))?;
    let operator = session
        .impersonator
        .ok_or_else(|| ApiError::bad_request("this session is not an impersonation"))?;

    let cookie = establish_session(&mut db, operator.id).await?;
    let mut out = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        out.insert(SET_COOKIE, value);
    }

    Ok((
        out,
        Json(StopImpersonationResponse {
            ok: true,
            display_name: operator.display_name,
        }),
    ))
}
