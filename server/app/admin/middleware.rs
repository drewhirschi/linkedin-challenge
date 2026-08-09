//! Admin guard. The root middleware already established that you are signed in; this narrows it
//! to the admin role, so a signed-in participant who guesses the URL is turned away rather than
//! shown an empty dashboard.
//!
//! Unlike the root guard this does hit the database — `is_admin` lives on the member row and there
//! is no way to know it from the cookie alone. It is one lookup on a handful of admin page loads.

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
        // Home, not /login: they may well be signed in, just not as an admin.
        return MiddlewareResult::response(Redirect::to("/").into_response());
    }

    MiddlewareResult::next(req)
}
