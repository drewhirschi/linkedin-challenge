//! Seeds one entrant's detail for this competition, so their posts paint without a round-trip.

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
    let id: i64 = params
        .get("id")
        .and_then(|v| v.parse().ok())
        .unwrap_or_default();
    nextrs::QuerySeed::new()
        .seed(get_api_orgs_by_slug_competitions_by_cid_members_by_id(
            (slug, cid, id),
            req.extensions(),
        ))
        .await
}
