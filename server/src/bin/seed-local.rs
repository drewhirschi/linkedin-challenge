//! Seed the empty local development account and exit.

use linkedin_challenge_server::{models, seed};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let mut db = models::connect().await;
    models::migrate(&mut db).await;
    seed::seed_local_account(&mut db)
        .await
        .expect("failed to seed local account");
    println!(
        "local account ready: {} / {}",
        seed::LOCAL_EMAIL,
        seed::LOCAL_PASSWORD
    );
}
