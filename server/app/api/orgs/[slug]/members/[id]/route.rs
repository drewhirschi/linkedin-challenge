//! `GET /api/orgs/{slug}/members/{id}` — one participant's posts, bucketed by scoring week.
//!
//! Serves two screens: an admin looking at someone's stats, and a participant looking at their
//! own standing. Same payload; the difference is only who navigates to it.

use axum::extract::Path;
use axum::{Extension, Json};
use linkedin_challenge_server::dto::{MemberDetail, member_detail};
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(
    get,
    operation_id = "getMemberDetail",
    responses(
        (status = 200, description = "The member's standing and posts by week", body = MemberDetail),
        (status = 404, description = "No such organization or member", body = ApiError),
    ),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
    Path((slug, id)): Path<(String, i64)>,
) -> Result<Json<MemberDetail>, ApiError> {
    Ok(Json(member_detail(&mut db, &slug, id).await?))
}
