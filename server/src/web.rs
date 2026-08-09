//! Shared HTTP plumbing for the `app/**/route.rs` adapters.

use axum::Json;
use axum::response::{IntoResponse, Response};
use http::StatusCode;
use serde::Serialize;
use utoipa::ToSchema;

/// A JSON error body. Every API route returns this shape on failure, so the generated client
/// and the extension can rely on `{ "error": "..." }` regardless of status.
#[derive(Debug, Serialize, ToSchema)]
pub struct ApiError {
    pub error: String,
    #[serde(skip)]
    pub status: StatusCode,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            error: message.into(),
            status,
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, message)
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::new(StatusCode::CONFLICT, message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status;
        (status, Json(self)).into_response()
    }
}

/// Toasty failures are our bug, not the caller's — surface them as 500 without leaking detail.
impl From<toasty::Error> for ApiError {
    fn from(e: toasty::Error) -> Self {
        eprintln!("database error: {e}");
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "database error")
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
