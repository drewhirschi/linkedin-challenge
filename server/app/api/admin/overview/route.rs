//! `GET /api/admin/overview` — everything the dashboard shows: aggregate totals across all
//! participants, the competitions, the standings, and the invite list.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::auth::current_admin;
use linkedin_challenge_server::dto::{AdminOverview, admin_overview};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use toasty::Db;

#[nextrs::api(
    get,
    operation_id = "getAdminOverview",
    responses(
        (status = 200, description = "Org-wide admin view", body = AdminOverview),
        (status = 401, description = "Not signed in as an admin", body = ApiError),
    ),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> ApiResult<Json<AdminOverview>> {
    // Guarded here as well as in app/admin/middleware.rs: the middleware protects the page, this
    // protects the data. An API that trusts a page guard is one refactor away from leaking.
    let Some(admin) = current_admin(&mut db, &headers).await else {
        return Err(ApiError::unauthorized("admin session required"));
    };
    Ok(Json(admin_overview(&mut db, &admin).await?))
}
