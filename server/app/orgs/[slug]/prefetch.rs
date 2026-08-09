//! Seeds the leaderboard so a shared link paints ranked standings with no client fetch.

include!(concat!(env!("OUT_DIR"), "/nextrs_seeds.rs"));

pub async fn prefetch(
    req: http::Request<axum::body::Body>,
    params: nextrs::Params,
) -> nextrs::QuerySeed {
    let slug = params.get("slug").unwrap_or_default().to_string();
    nextrs::QuerySeed::new()
        .seed(get_api_orgs_by_slug(slug, req.extensions()))
        .await
}
