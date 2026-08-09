//! `GET /api/health` — liveness only.
//!
//! Deliberately touches nothing: no database, no session, no work beyond serialising two bytes of
//! JSON. That makes it a floor measurement — what the framework costs per request — rather than a
//! measurement of our handlers. It is also what a load balancer should poll, for the same reason:
//! a health check that hits the database reports the database's health, not the process's.

use axum::Json;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Serialize, Deserialize, ToSchema)]
pub struct Health {
    pub ok: bool,
}

/// Liveness probe
#[nextrs::api(operation_id = "health")]
pub async fn get() -> Json<Health> {
    Json(Health { ok: true })
}
