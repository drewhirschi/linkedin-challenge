//! 404 for a competition that doesn't exist, or belongs to a different org.
//!
//! The org-level middleware has already established the org is real. This checks the id in the URL
//! names one of *its* competitions — otherwise `/orgs/a/c/{id-belonging-to-b}` would render B's
//! board under A's slug.

use axum::response::IntoResponse;
use linkedin_challenge_server::dto::org_by_slug;
use linkedin_challenge_server::models::Competition;
use linkedin_challenge_server::web::not_found_response;
use nextrs::conventions::MiddlewareResult;
use toasty::Db;

pub async fn handle(req: http::Request<axum::body::Body>) -> MiddlewareResult {
    let Some(mut db) = req.extensions().get::<Db>().cloned() else {
        return MiddlewareResult::response(
            (http::StatusCode::INTERNAL_SERVER_ERROR, "no database").into_response(),
        );
    };

    // `/orgs/{slug}/c/{cid}` — segments 2 and 4.
    let mut segments = req.uri().path().split('/').skip(2);
    let slug = segments.next().unwrap_or_default().to_string();
    let cid: Option<i64> = segments.nth(1).and_then(|v| v.parse().ok());

    let Ok(org) = org_by_slug(&mut db, &slug).await else {
        return MiddlewareResult::response(not_found_response("No such organization."));
    };

    let exists = match cid {
        Some(cid) => Competition::filter_by_id(cid)
            .first()
            .exec(&mut db)
            .await
            .ok()
            .flatten()
            .is_some_and(|c| c.org_id == org.id),
        None => false,
    };

    if !exists {
        return MiddlewareResult::response(not_found_response(
            "No such competition in this organization.",
        ));
    }

    MiddlewareResult::next(req)
}
