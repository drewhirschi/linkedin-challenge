//! `GET /api/orgs` — every org with a public leaderboard. Powers the landing page.

use axum::{Extension, Json};
use linkedin_challenge_server::dto::OrgSummary;
use linkedin_challenge_server::models::Org;
use linkedin_challenge_server::web::ApiError;
use toasty::Db;

#[nextrs::api(
    get,
    operation_id = "listOrgs",
    responses((status = 200, description = "Organizations", body = Vec<OrgSummary>)),
)]
pub async fn get(
    Extension(mut db): Extension<Db>,
) -> Result<Json<Vec<OrgSummary>>, ApiError> {
    let orgs = Org::all()
        .order_by(Org::fields().name().asc())
        .exec(&mut db)
        .await?;

    Ok(Json(
        orgs.into_iter()
            .map(|o| OrgSummary {
                slug: o.slug,
                name: o.name,
            })
            .collect(),
    ))
}
