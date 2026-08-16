//! `GET /api/challenges` — the viewer's org's challenges, newest first, plus the default one.
//! Backs the Challenges page and the sidebar's challenge switcher.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::dto::{ChallengeList, challenge_list, org_of, require_member};
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(operation_id = "getChallenges")]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> Result<Json<ChallengeList>, ApiError> {
    let member = require_member(&mut db, &headers).await?;
    let org = org_of(&mut db, &member).await?;
    Ok(Json(challenge_list(&mut db, &org).await?))
}
