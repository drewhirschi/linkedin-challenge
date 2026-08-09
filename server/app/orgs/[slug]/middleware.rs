//! 404 for an org that doesn't exist.
//!
//! `/orgs/anything` matches the `[slug]` route, so without this the page renders with a 200 and a
//! polite "that organization doesn't exist" — which lies to crawlers, monitoring, and anyone
//! reading a status code. `not-found.tsx` only covers URLs that match no route at all; a bad
//! *value* in a route that does match has to be caught here.

use axum::response::IntoResponse;
use linkedin_challenge_server::dto::org_by_slug;
use linkedin_challenge_server::web::not_found_response;
use nextrs::conventions::MiddlewareResult;
use toasty::Db;

pub async fn handle(req: http::Request<axum::body::Body>) -> MiddlewareResult {
    let Some(mut db) = req.extensions().get::<Db>().cloned() else {
        return MiddlewareResult::response(
            (http::StatusCode::INTERNAL_SERVER_ERROR, "no database").into_response(),
        );
    };

    // `/orgs/{slug}` — the slug is the second path segment.
    let slug = req.uri().path().split('/').nth(2).unwrap_or_default().to_string();
    if org_by_slug(&mut db, &slug).await.is_err() {
        return MiddlewareResult::response(not_found_response("No such organization."));
    }

    MiddlewareResult::next(req)
}
