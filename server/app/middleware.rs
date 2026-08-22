//! Root guard: you must be signed in to see anything.
//!
//! Composes root-to-leaf, so it runs before every page and API handler. The allow-list below is
//! the complete set of things reachable while signed out — everything else redirects to /login.

use axum::response::{IntoResponse, Redirect};
use linkedin_challenge_server::auth::{SESSION_COOKIE, cookie};
use nextrs::conventions::MiddlewareResult;

/// Reachable without a session:
///  * the login page, which is the only account entry point for now;
///  * the auth API those surfaces post to;
///  * the extension protocol, which authenticates with a bearer sync token instead of the cookie.
fn is_public(path: &str) -> bool {
    path == "/auth/login"
        || path.starts_with("/api/auth/")
        // Liveness must answer without a session, or a load balancer sees a redirect.
        || path == "/api/health"
        || path == "/api/link"
        || path == "/api/sync"
        // Bundles, stylesheet, favicons. Blocking these would break the login page itself.
        || path.starts_with("/dist/")
        || path.starts_with("/favicon.")
        || path == "/style.css"
}

pub async fn handle(req: http::Request<axum::body::Body>) -> MiddlewareResult {
    let path = req.uri().path().to_string();
    // Account creation and invite redemption are intentionally dormant during the login-only
    // phase. Keep their implementations for later, but do not expose parallel entry points.
    if matches!(path.as_str(), "/auth/join" | "/auth/signup") {
        return MiddlewareResult::response(Redirect::to("/auth/login").into_response());
    }
    if is_public(&path) {
        return MiddlewareResult::next(req);
    }

    // Presence check only — verifying the session here would add a database round-trip to every
    // request, and each handler authenticates properly anyway. A forged cookie gets past this and
    // is then rejected with a 401 by the API it tries to read.
    if cookie(req.headers(), SESSION_COOKIE).is_none() {
        // API callers get a 401 they can act on; page loads get sent to the sign-in screen.
        if path.starts_with("/api/") {
            return MiddlewareResult::response(
                (http::StatusCode::UNAUTHORIZED, "sign-in required").into_response(),
            );
        }
        return MiddlewareResult::response(Redirect::to("/auth/login").into_response());
    }

    MiddlewareResult::next(req)
}
