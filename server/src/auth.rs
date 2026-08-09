//! Auth as plain functions over a `Db` handle and the request headers.
//!
//! **Everyone signs in.** Participants and admins are both `Member` rows with an email and an
//! Argon2 password hash; `is_admin` is a role on top, not a separate kind of account. A session is
//! a random token whose SHA-256 we store, handed back as an `HttpOnly` cookie.
//!
//! The extension is the one exception: it authenticates with a bearer sync token instead of the
//! cookie, because it acts on the member's behalf from a different origin.
//!
//! Topcoat supplied cookie sessions; on nextrs we mint the token ourselves and store only its
//! hash, which is the same trust model with one fewer framework dependency.

use argon2::password_hash::{PasswordHash, SaltString, rand_core::OsRng};
use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use http::HeaderMap;
use toasty::Db;

use crate::models::{AdminSession, Member};
use crate::util::{hash_bearer_token, new_bearer_token, now_unix};

/// Session lifetime (30 days), applied to both the cookie and the stored row.
const SESSION_SECS: i64 = 30 * 86400;

pub const SESSION_COOKIE: &str = "session";

// --- passwords -------------------------------------------------------------------------------

pub fn hash_password(pw: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pw.as_bytes(), &salt)
        .map(|h| h.to_string())
        .unwrap_or_default()
}

pub fn verify_password(pw: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(pw.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

// --- cookies ---------------------------------------------------------------------------------

/// Read one cookie value out of the `Cookie` header.
pub fn cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(http::header::COOKIE)?.to_str().ok()?;
    raw.split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.to_string())
}

/// `Set-Cookie` value that establishes the session. `HttpOnly` keeps it away from page scripts;
/// `SameSite=Lax` is enough: every mutation goes through fetch with a JSON content type.
fn set_cookie(token: &str) -> String {
    format!(
        "{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_SECS}"
    )
}

/// `Set-Cookie` value that clears the session.
pub fn clear_cookie() -> String {
    format!("{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
}

/// Find a member by login email, case-insensitively (emails are stored lowercased).
///
/// Login used to look up a synthetic `admin:<email>` URN, which only admins had — participants
/// could never sign in. Email is the login identifier for everyone, so it is also the uniqueness
/// check at signup and join: two different URN prefixes let the same address register twice.
pub async fn member_by_email(db: &mut Db, email: &str) -> toasty::Result<Option<Member>> {
    let email = email.trim().to_lowercase();
    Ok(
        Member::filter(Member::fields().email().eq(Some(email.clone())))
            .first()
            .exec(&mut *db)
            .await?,
    )
}

// --- sessions --------------------------------------------------------------------------

/// Resolve a raw session token to its member, honouring expiry.
///
/// Split out from `current_member` because the extension holds the session token itself (read from
/// the cookie jar with `chrome.cookies`) rather than sending a `Cookie` header — `fetch` cannot set
/// one cross-origin, and allowing credentialed cross-origin requests would mean reflecting origins
/// and opening a CSRF surface on every cookie-authed route.
pub async fn member_from_session_token(db: &mut Db, token: &str) -> Option<Member> {
    let key = hash_bearer_token(token);
    let sess = AdminSession::filter_by_token_hash(&key)
        .first()
        .exec(&mut *db)
        .await
        .ok()??;
    if sess.expires_at <= now_unix() {
        return None;
    }
    Member::filter_by_id(sess.admin_id)
        .first()
        .exec(&mut *db)
        .await
        .ok()
        .flatten()
}

/// The signed-in member for this request, or None. Everyone signs in — participants included —
/// so this is the general case and `current_admin` is the narrowing.
pub async fn current_member(db: &mut Db, headers: &HeaderMap) -> Option<Member> {
    let token = cookie(headers, SESSION_COOKIE)?;
    member_from_session_token(db, &token).await
}

/// The signed-in member, but only if they administer their org.
pub async fn current_admin(db: &mut Db, headers: &HeaderMap) -> Option<Member> {
    current_member(db, headers).await.filter(|m| m.is_admin)
}

/// Start a session for a member: persist the hash, return the `Set-Cookie` value for the response.
pub async fn establish_session(db: &mut Db, member_id: i64) -> toasty::Result<String> {
    let (secret, hash) = new_bearer_token();
    toasty::create!(AdminSession {
        token_hash: hash,
        admin_id: member_id,
        expires_at: now_unix() + SESSION_SECS,
    })
    .exec(&mut *db)
    .await?;
    Ok(set_cookie(&secret))
}

/// End the current session (server record + cookie). Returns the clearing `Set-Cookie` value.
pub async fn end_session(db: &mut Db, headers: &HeaderMap) -> String {
    if let Some(token) = cookie(headers, SESSION_COOKIE) {
        let key = hash_bearer_token(&token);
        let _ = AdminSession::delete_by_token_hash(&mut *db, key).await;
    }
    clear_cookie()
}

// --- extension bearer token ------------------------------------------------------------------

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

/// The member whose sync token authenticates this request, or None.
pub async fn member_from_bearer(db: &mut Db, headers: &HeaderMap) -> Option<Member> {
    let raw = bearer_token(headers)?;
    let hash = hash_bearer_token(raw);
    Member::filter_by_api_token_hash(&hash)
        .first()
        .exec(&mut *db)
        .await
        .ok()
        .flatten()
}
