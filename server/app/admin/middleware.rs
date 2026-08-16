//! Admin guard for `/admin/**`.
//!
//! The root middleware established a session exists; this narrows it to an org admin. It hits the
//! database — the role isn't knowable from the cookie — but only on admin page loads.

use axum::response::{IntoResponse, Redirect};
use linkedin_challenge_server::auth::current_admin;
use nextrs::conventions::MiddlewareResult;
use toasty::Db;

pub async fn handle(req: http::Request<axum::body::Body>) -> MiddlewareResult {
    let Some(db) = req.extensions().get::<Db>().cloned() else {
        return MiddlewareResult::response(
            (http::StatusCode::INTERNAL_SERVER_ERROR, "no database").into_response(),
        );
    };

    let mut db = db;
    if current_admin(&mut db, req.headers()).await.is_none() {
        // Home, not the sign-in page: they may well be signed in, just not as an admin.
        return MiddlewareResult::response(Redirect::to("/").into_response());
    }
    MiddlewareResult::next(req)
}
