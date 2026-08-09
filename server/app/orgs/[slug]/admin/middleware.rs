//! Org-admin guard for `/orgs/{slug}/admin`.
//!
//! The root middleware established that you are signed in; this narrows it to *an admin of this
//! org*. Checking only `is_admin` would let an admin of one org open another org's dashboard by
//! editing the URL — the role belongs to a membership, not to a person.
//!
//! Unlike the root guard this hits the database: neither `is_admin` nor the org is knowable from
//! the cookie alone. It is one lookup on a handful of admin page loads.

use axum::response::{IntoResponse, Redirect};
use linkedin_challenge_server::auth::current_admin;
use linkedin_challenge_server::dto::org_by_slug;
use nextrs::conventions::MiddlewareResult;
use toasty::Db;

pub async fn handle(req: http::Request<axum::body::Body>) -> MiddlewareResult {
    let Some(db) = req.extensions().get::<Db>().cloned() else {
        return MiddlewareResult::response(
            (http::StatusCode::INTERNAL_SERVER_ERROR, "no database").into_response(),
        );
    };

    let mut db = db;
    let Some(admin) = current_admin(&mut db, req.headers()).await else {
        // Home, not the sign-in page: they may well be signed in, just not as an admin.
        return MiddlewareResult::response(Redirect::to("/").into_response());
    };

    // `/orgs/{slug}/admin` — the slug is the second path segment.
    let slug = req.uri().path().split('/').nth(2).unwrap_or_default().to_string();
    match org_by_slug(&mut db, &slug).await {
        Ok(org) if org.id == admin.org_id => MiddlewareResult::next(req),
        _ => MiddlewareResult::response(Redirect::to("/").into_response()),
    }
}
