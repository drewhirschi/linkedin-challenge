//! `GET /api/admin/overview` — the admin dashboard payload for the viewer's own org.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::{AdminOverview, admin_overview, require_admin};
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(operation_id = "getAdminOverview")]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> Result<Json<AdminOverview>, ApiError> {
    let admin = require_admin(&mut db, &headers).await?;
    Ok(Json(admin_overview(&mut db, &admin).await?))
}
