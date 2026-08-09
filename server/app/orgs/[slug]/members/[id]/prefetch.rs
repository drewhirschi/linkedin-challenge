//! Seeds one participant's detail so their posts paint without a client round-trip.

include!(concat!(env!("OUT_DIR"), "/nextrs_seeds.rs"));

pub async fn prefetch(
    req: http::Request<axum::body::Body>,
    params: nextrs::Params,
) -> nextrs::QuerySeed {
    let slug = params.get("slug").unwrap_or_default().to_string();
    let id: i64 = params
        .get("id")
        .and_then(|v| v.parse().ok())
        .unwrap_or_default();
    nextrs::QuerySeed::new()
        .seed(get_api_orgs_by_slug_members_by_id((slug, id), req.extensions()))
        .await
}
