//! Seeds one competition's leaderboard so a shared link paints ranked standings with no fetch.

include!(concat!(env!("OUT_DIR"), "/nextrs_seeds.rs"));

pub async fn prefetch(
    req: http::Request<axum::body::Body>,
    params: nextrs::Params,
) -> nextrs::QuerySeed {
    let slug = params.get("slug").unwrap_or_default().to_string();
    let cid: i64 = params
        .get("cid")
        .and_then(|v| v.parse().ok())
        .unwrap_or_default();
    nextrs::QuerySeed::new()
        .seed(get_api_orgs_by_slug_competitions_by_cid((slug, cid), req.extensions()))
        .await
}
