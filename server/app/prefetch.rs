//! Seeds the landing page's org list so the first paint has the leaderboard links already.

include!(concat!(env!("OUT_DIR"), "/nextrs_seeds.rs"));

pub async fn prefetch(req: http::Request<axum::body::Body>) -> nextrs::QuerySeed {
    nextrs::QuerySeed::new()
        .seed(get_api_orgs(req.extensions()))
        .await
}
