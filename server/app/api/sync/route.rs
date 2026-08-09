//! `POST /api/sync` — ingest a snapshot batch from the extension. Bearer-authenticated.
//! Server stamps its own capture time (clients can be skewed). See `docs/sync-protocol.md`.

use axum::{Extension, Json};
use http::HeaderMap;
use linkedin_challenge_server::auth::member_from_bearer;
use linkedin_challenge_server::models::{Post, PostSnapshot, ProfileSnapshot};
use linkedin_challenge_server::util::{now_unix, parse_iso8601};
use linkedin_challenge_server::web::{ApiError, ApiResult};
use serde::{Deserialize, Serialize};
use toasty::Db;
use utoipa::ToSchema;

const NEXT_SYNC_SECONDS: i64 = 6 * 3600;

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncRequest {
    pub captured_at: Option<String>,
    pub profile: ProfilePayload,
    pub posts: Vec<PostPayload>,
}

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePayload {
    pub follower_count: Option<i64>,
    pub profile_views: Option<i64>,
}

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PostPayload {
    pub urn: String,
    pub permalink: String,
    pub created_at: Option<String>,
    pub text_preview: Option<String>,
    pub metrics: Metrics,
}

#[derive(Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub impressions: Option<i64>,
    pub reactions: Option<i64>,
    pub comments: Option<i64>,
    pub reposts: Option<i64>,
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SyncResponse {
    pub ok: bool,
    pub posts_ingested: usize,
    pub next_sync_after_seconds: i64,
}

#[nextrs::api(
    post,
    operation_id = "pushSync",
    responses(
        (status = 200, description = "Snapshot batch ingested", body = SyncResponse),
        (status = 401, description = "Invalid or missing sync token", body = ApiError),
    ),
)]
pub async fn post(
    Extension(mut db): Extension<Db>,
    headers: HeaderMap,
    Json(req): Json<SyncRequest>,
) -> ApiResult<Json<SyncResponse>> {
    let Some(member) = member_from_bearer(&mut db, &headers).await else {
        return Err(ApiError::unauthorized("invalid or missing sync token"));
    };

    let captured_at = now_unix(); // server clock is authoritative for windowing

    // One profile snapshot per sync.
    toasty::create!(ProfileSnapshot {
        member_id: member.id,
        captured_at,
        follower_count: req.profile.follower_count,
        profile_views: req.profile.profile_views,
    })
    .exec(&mut db)
    .await?;

    // Upsert each post by URN, then append a metric snapshot.
    let mut ingested = 0usize;
    for p in &req.posts {
        let post_id = match Post::filter_by_urn(&p.urn).first().exec(&mut db).await? {
            Some(post) => {
                // Don't let a post URN be claimed by a different member.
                if post.member_id != member.id {
                    continue;
                }
                // Backfill a creation time we didn't have before. Posts ingested while the
                // extension couldn't determine one are stored with 0 and fall back to "first
                // snapshot", which reads as "posted today"; a later sync repairs them in place.
                if post.created_at == 0
                    && let Some(created_at) = p.created_at.as_deref().and_then(parse_iso8601)
                    && created_at > 0
                {
                    toasty::update!(Post::filter_by_id(post.id) { created_at })
                        .exec(&mut db)
                        .await?;
                }
                post.id
            }
            None => {
                let created_at = p.created_at.as_deref().and_then(parse_iso8601).unwrap_or(0);
                let post = toasty::create!(Post {
                    member_id: member.id,
                    urn: &p.urn,
                    permalink: &p.permalink,
                    created_at,
                    text_preview: p.text_preview.clone(),
                })
                .exec(&mut db)
                .await?;
                post.id
            }
        };

        toasty::create!(PostSnapshot {
            post_id,
            captured_at,
            impressions: p.metrics.impressions,
            reactions: p.metrics.reactions,
            comments: p.metrics.comments,
            reposts: p.metrics.reposts,
        })
        .exec(&mut db)
        .await?;
        ingested += 1;
    }

    Ok(Json(SyncResponse {
        ok: true,
        posts_ingested: ingested,
        next_sync_after_seconds: NEXT_SYNC_SECONDS,
    }))
}
