//! Challenge-management pages are available to every signed-in user; API handlers enforce that
//! mutations target challenges the user created.

use axum::response::{IntoResponse, Redirect};
use linkedin_challenge_server::auth::current_member;
use nextrs::conventions::MiddlewareResult;
use toasty::Db;

pub async fn handle(req: http::Request<axum::body::Body>) -> MiddlewareResult {
    let Some(db) = req.extensions().get::<Db>().cloned() else {
        return MiddlewareResult::response(
            (http::StatusCode::INTERNAL_SERVER_ERROR, "no database").into_response(),
        );
    };

    let mut db = db;
    if current_member(&mut db, req.headers()).await.is_none() {
        return MiddlewareResult::response(Redirect::to("/").into_response());
    }
    MiddlewareResult::next(req)
}
