//! `GET /api/me/competitions` — the competitions the signed-in member has entered, with their
//! standing in each. This is what the home page shows.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::auth::current_member;
use linkedin_challenge_server::dto::{MyCompetition, my_competitions};
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(
    get,
    operation_id = "getMyCompetitions",
    responses(
        (status = 200, description = "Competitions you have entered", body = Vec<MyCompetition>),
        (status = 401, description = "Not signed in", body = ApiError),
    ),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
) -> Result<Json<Vec<MyCompetition>>, ApiError> {
    let Some(member) = current_member(&mut db, &headers).await else {
        return Err(ApiError::unauthorized("sign-in required"));
    };
    Ok(Json(my_competitions(&mut db, &member).await?))
}
