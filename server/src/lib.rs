//! Domain layer. The `app/` convention files are thin adapters over these modules —
//! see `app/api/sync/route.rs` for the shape.

pub mod auth;
pub mod dto;
pub mod models;
pub mod scoring;
pub mod seed;
pub mod util;
pub mod web;
