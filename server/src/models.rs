//! The Toasty data model. Timestamps are unix seconds (`i64`) to avoid a datetime dependency.
//! Scores are never stored — they are derived from snapshots at read time (see `scoring.rs`).

use toasty::Db;

/// Connect, creating the schema on a fresh database.
///
/// Toasty's `push_schema()` issues plain `CREATE TABLE` — there is no create-if-missing, and the
/// only other option (`reset_db()`) drops everything. Calling it unconditionally therefore makes
/// the server startable exactly once per database file, so we probe first and only push when the
/// tables aren't there.
///
/// It still does NOT alter existing tables: after changing a model, delete the DB file (or point
/// `DATABASE_URL` at a fresh one) to recreate.
///
/// The handle is installed as an Axum `Extension`; handlers extract it with `Extension(db)`.
/// Cloning `Db` is cheap (an Arc'd pool handle); Toasty statements need `&mut Db`.
pub async fn connect() -> Db {
    let url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "turso:linkedin.db".to_string());

    let mut db = Db::builder()
        .models(toasty::models!(crate::*))
        .connect(&url)
        .await
        .expect("failed to connect to the database");

    // Cheapest possible read against a table every schema version has. Success means the schema is
    // already present; failure means an empty database (or one we cannot use anyway).
    if Org::all().first().exec(&mut db).await.is_err() {
        db.push_schema()
            .await
            .expect("failed to create database schema");
    }

    // Toasty creates fresh schemas but does not yet evolve existing ones. Keep the tiny additive
    // migrations here so a development database and a deployed PostgreSQL database retain their
    // accounts and sync history as optional analytics fields are introduced.
    add_column(
        &mut db,
        "ALTER TABLE posts ADD COLUMN is_repost BOOLEAN NOT NULL DEFAULT FALSE",
    )
    .await;
    add_column(
        &mut db,
        "ALTER TABLE post_snapshots ADD COLUMN members_reached BIGINT",
    )
    .await;
    add_column(
        &mut db,
        "ALTER TABLE competitions ADD COLUMN creator_id BIGINT NOT NULL DEFAULT 0",
    )
    .await;
    add_column(
        &mut db,
        "ALTER TABLE invites ADD COLUMN challenge_id BIGINT NOT NULL DEFAULT 0",
    )
    .await;
    add_column(&mut db, "ALTER TABLE invites ADD COLUMN email TEXT").await;
    execute_migration(
        &mut db,
        "CREATE TABLE IF NOT EXISTS challenge_memberships (id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id BIGINT NOT NULL, member_id BIGINT NOT NULL, joined_at BIGINT NOT NULL)",
    )
    .await;
    execute_migration(
        &mut db,
        "CREATE UNIQUE INDEX IF NOT EXISTS challenge_memberships_challenge_member ON challenge_memberships (challenge_id, member_id)",
    )
    .await;
    add_column(
        &mut db,
        "ALTER TABLE challenge_memberships ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT FALSE",
    )
    .await;
    // Only rows predating challenge ownership have creator_id = 0. Backfill their former org
    // participants once; future challenges use explicit memberships and are never touched here.
    execute_migration(
        &mut db,
        "INSERT INTO challenge_memberships (challenge_id, member_id, joined_at) SELECT competitions.id, members.id, competitions.created_at FROM competitions JOIN members ON members.org_id = competitions.org_id WHERE competitions.creator_id = 0 AND NOT EXISTS (SELECT 1 FROM challenge_memberships existing WHERE existing.challenge_id = competitions.id AND existing.member_id = members.id)",
    )
    .await;
    execute_migration(
        &mut db,
        "UPDATE competitions SET creator_id = COALESCE((SELECT MIN(id) FROM members WHERE members.org_id = competitions.org_id AND members.is_admin = TRUE), 0) WHERE creator_id = 0",
    )
    .await;

    db
}

async fn execute_migration(db: &mut Db, sql: &str) {
    toasty::sql::statement(sql)
        .exec(db)
        .await
        .unwrap_or_else(|error| panic!("failed to apply database migration `{sql}`: {error}"));
}

async fn add_column(db: &mut Db, sql: &str) {
    if let Err(error) = toasty::sql::statement(sql).exec(db).await {
        let message = error.to_string().to_ascii_lowercase();
        if !message.contains("duplicate column") && !message.contains("already exists") {
            panic!("failed to apply database migration `{sql}`: {error}");
        }
    }
}

/// A company running challenges.
#[derive(Debug, toasty::Model)]
pub struct Org {
    #[key]
    #[auto]
    pub id: i64,
    #[unique]
    pub slug: String,
    pub name: String,
    pub created_at: i64,

    #[has_many]
    pub members: toasty::Deferred<Vec<Member>>,
    #[has_many]
    pub invites: toasty::Deferred<Vec<Invite>>,
    #[has_many]
    pub competitions: toasty::Deferred<Vec<Competition>>,
}

/// A person in an org. Participants sync via the extension; admins manage the challenge.
#[derive(Debug, toasty::Model)]
pub struct Member {
    #[key]
    #[auto]
    pub id: i64,
    #[index]
    pub org_id: i64,
    #[belongs_to(key = org_id, references = id)]
    pub org: toasty::Deferred<Org>,

    pub display_name: String,
    /// LinkedIn member URN. Globally unique for MVP (a person joins one org's challenge).
    #[unique]
    pub linkedin_urn: String,
    pub public_identifier: String,
    pub profile_url: Option<String>,

    pub is_admin: bool,
    /// Operator of the product itself, across every org — unlocks the system panel and
    /// impersonation. Granted by seed or by hand, never through any API.
    pub is_system_admin: bool,
    /// Admin login email (None for participants). Uniqueness enforced in code at signup.
    pub email: Option<String>,
    /// Argon2 password hash for admins (None for participants).
    pub password_hash: Option<String>,

    /// SHA-256 (hex) of the extension's sync bearer token (None until linked).
    #[unique]
    pub api_token_hash: String,

    pub created_at: i64,

    #[has_many]
    pub posts: toasty::Deferred<Vec<Post>>,
    #[has_many]
    pub profile_snapshots: toasty::Deferred<Vec<ProfileSnapshot>>,
}

/// A single-use invite code that binds an extension install to a new `Member`.
#[derive(Debug, toasty::Model)]
pub struct Invite {
    #[key]
    #[auto]
    pub id: i64,
    #[index]
    pub org_id: i64,
    #[belongs_to(key = org_id, references = id)]
    pub org: toasty::Deferred<Org>,

    /// Challenge this invitation grants access to. `org_id` is retained only while old databases
    /// transition away from organization ownership.
    #[index]
    pub challenge_id: i64,

    #[unique]
    pub code: String,
    /// Intended recipient. Legacy generic codes have no recipient and remain redeemable.
    pub email: Option<String>,
    /// "participant" or "admin".
    pub role: String,
    pub redeemed: bool,
    pub created_at: i64,
}

/// A scored contest window with a JSON scoring config (see `scoring::ScoringConfig`).
#[derive(Debug, toasty::Model)]
pub struct Competition {
    #[key]
    #[auto]
    pub id: i64,
    #[index]
    pub org_id: i64,
    #[belongs_to(key = org_id, references = id)]
    pub org: toasty::Deferred<Org>,

    /// User who created and manages this challenge.
    #[index]
    pub creator_id: i64,

    pub name: String,
    pub start_at: i64,
    pub end_at: i64,

    // Scoring rules as first-class columns. These were once a single `config_json` blob; typed
    // columns mean the database can be queried and aggregated on them, and a malformed value is a
    // load error rather than a silent fall back to defaults. Mirrored by `scoring::ScoringConfig`,
    // which is the API shape.
    /// Posts beyond this many per week don't score (only the highest-scoring ones count).
    pub max_posts_per_week: i64,
    pub per_reaction: f64,
    pub per_comment: f64,
    pub per_repost: f64,
    pub per_send: f64,
    pub per_save: f64,
    pub per_impression: f64,
    pub per_follower_gained: f64,
    pub per_profile_view: f64,
    /// If true, post points are scaled by `follower_baseline / follower_count`.
    pub normalize_by_followers: bool,
    pub follower_baseline: i64,

    pub is_active: bool,
    pub created_at: i64,
}

/// A user's explicit agreement to let one challenge read and score their post data.
#[derive(Debug, toasty::Model)]
pub struct ChallengeMembership {
    #[key]
    #[auto]
    pub id: i64,
    #[index]
    pub challenge_id: i64,
    #[index]
    pub member_id: i64,
    pub is_favorite: bool,
    pub joined_at: i64,
}

/// A post authored by a member. Deduped by LinkedIn URN.
#[derive(Debug, toasty::Model)]
pub struct Post {
    #[key]
    #[auto]
    pub id: i64,
    #[index]
    pub member_id: i64,
    #[belongs_to(key = member_id, references = id)]
    pub member: toasty::Deferred<Member>,

    #[unique]
    pub urn: String,
    pub permalink: String,
    /// LinkedIn post creation time (unix secs); 0 when unknown — bucket by first snapshot then.
    pub created_at: i64,
    pub text_preview: Option<String>,
    pub is_repost: bool,

    #[has_many]
    pub snapshots: toasty::Deferred<Vec<PostSnapshot>>,
    #[has_many]
    pub comments_seen: toasty::Deferred<Vec<PostComment>>,
}

/// A time-series metric reading for a post. Append-only; latest-in-window wins when scoring.
#[derive(Debug, toasty::Model)]
pub struct PostSnapshot {
    #[key]
    #[auto]
    pub id: i64,
    #[index]
    pub post_id: i64,
    #[belongs_to(key = post_id, references = id)]
    pub post: toasty::Deferred<Post>,

    pub captured_at: i64,
    pub impressions: Option<i64>,
    pub reactions: Option<i64>,
    /// LinkedIn's own comment total. `PostComment` rows are what we actually read, and scoring
    /// uses those so a member's own comments can be excluded.
    pub comments: Option<i64>,
    pub reposts: Option<i64>,
    /// Shares sent privately (LinkedIn's "sends").
    pub sends: Option<i64>,
    pub saves: Option<i64>,

    // Impression breakdown and downstream effects, from the author-only post analytics page.
    // All optional: a sync that couldn't read them stores None rather than a misleading zero.
    pub impressions_in_network: Option<i64>,
    pub impressions_out_of_network: Option<i64>,
    pub members_reached: Option<i64>,
    pub profile_viewers_from_post: Option<i64>,
    pub followers_from_post: Option<i64>,
}

/// One comment on a post, with its author — so a member's own comments can be excluded from
/// scoring, and so reciprocal-comment rings stay visible later.
///
/// Not a snapshot: a comment is a fact that happened once, so rows are upserted by `urn` rather
/// than appended per sync. `PostSnapshot.comments` keeps LinkedIn's own total; these rows are what
/// we actually saw, and the two can differ when a sync only reads the first page.
#[derive(Debug, toasty::Model)]
pub struct PostComment {
    #[key]
    #[auto]
    pub id: i64,
    #[index]
    pub post_id: i64,
    #[belongs_to(key = post_id, references = id)]
    pub post: toasty::Deferred<Post>,

    /// LinkedIn's comment URN. Unique, so a re-sync updates rather than duplicates.
    #[unique]
    pub urn: String,
    /// LinkedIn member URN of whoever wrote it.
    pub commenter_urn: String,
    pub commenter_name: Option<String>,
    /// True when the commenter is the post's own author — these don't score.
    pub is_self: bool,
    /// Comment creation time (unix secs), 0 when unknown.
    pub created_at: i64,
    /// When we first recorded it.
    pub captured_at: i64,
}

/// A time-series reading of a member's profile-level metrics.
#[derive(Debug, toasty::Model)]
pub struct ProfileSnapshot {
    #[key]
    #[auto]
    pub id: i64,
    #[index]
    pub member_id: i64,
    #[belongs_to(key = member_id, references = id)]
    pub member: toasty::Deferred<Member>,

    pub captured_at: i64,
    pub follower_count: Option<i64>,
    pub profile_views: Option<i64>,
}

/// A web session: hex(token_hash) -> member id + expiry (unix secs).
///
/// ("Admin" in the name is historical — everyone signs in now; renaming the model would orphan
/// existing session tables for no behavioral gain.)
#[derive(Debug, toasty::Model)]
pub struct AdminSession {
    #[key]
    pub token_hash: String,
    pub admin_id: i64,
    pub expires_at: i64,
    /// When set, this session was started by a system admin impersonating `admin_id`; the value is
    /// the system admin's own member id. Lets the UI show who is really acting, and lets "stop
    /// impersonating" return to the operator's own account.
    pub impersonator_id: Option<i64>,
}
