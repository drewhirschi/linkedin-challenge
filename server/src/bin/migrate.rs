//! Apply the schema to the database at `DATABASE_URL` and exit.
//!
//! The one place DDL runs against production: `just migrate-prod`, or the deploy script before it
//! uploads a build. Every statement is idempotent, so re-running is safe. Serverless instances
//! never migrate — see `models::connect`.

use linkedin_challenge_server::models;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let url = models::database_url();
    let mut db = models::connect().await;
    models::migrate(&mut db).await;
    println!("schema is current: {}", redact(&url));
}

/// Connection string with any password removed, for the log line.
fn redact(url: &str) -> String {
    match (url.find("://"), url.rfind('@')) {
        (Some(scheme_end), Some(at)) if at > scheme_end => {
            let creds_start = scheme_end + 3;
            let user = url[creds_start..at].split(':').next().unwrap_or("");
            format!("{}{}@{}", &url[..creds_start], user, &url[at + 1..])
        }
        _ => url.to_string(),
    }
}
