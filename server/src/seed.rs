//! Optional demo data so a fresh install shows a populated leaderboard. Enabled with `SEED_DEMO=1`.
//! Idempotent: does nothing if an org with slug `demo` already exists.

use toasty::Db;

use crate::models::{Competition, Member, Org, Post, PostSnapshot, ProfileSnapshot};
use crate::scoring::ScoringConfig;
use crate::auth::hash_password;
use crate::util::{new_bearer_token, now_unix};

/// Shared password for every seeded demo account.
pub const DEMO_PASSWORD: &str = "demopassword";

/// (display_name, follower_start, follower_now, views_start, views_now, posts)
/// posts: (day_offset_from_start, reactions, comments, reposts, impressions)
type Person = (
    &'static str,
    i64,
    i64,
    i64,
    i64,
    &'static [(i64, i64, i64, i64, i64)],
);

const PEOPLE: &[Person] = &[
    (
        "Ada Ortiz",
        4200,
        4460,
        900,
        1180,
        &[
            (2, 320, 44, 21, 18500),
            (9, 210, 30, 12, 12200),
            (16, 540, 88, 40, 31000),
            (17, 90, 8, 3, 6400), // 4th post in week 3 — should be dropped by top-3/week
        ],
    ),
    (
        "Ben Cho",
        820,
        980,
        140,
        260,
        &[(3, 190, 26, 9, 5400), (11, 240, 33, 15, 7100), (20, 160, 20, 8, 4300)],
    ),
    (
        "Carmen Diaz",
        15200,
        15380,
        2400,
        2620,
        &[(1, 610, 90, 55, 78000), (12, 430, 61, 33, 51000)],
    ),
    (
        "Dev Patel",
        2600,
        2760,
        410,
        560,
        &[(4, 150, 18, 6, 9100), (10, 300, 40, 19, 15400), (19, 220, 28, 11, 10200)],
    ),
    (
        "Erin Wong",
        320,
        520,
        60,
        190,
        &[(5, 110, 22, 14, 3800), (13, 180, 35, 20, 5200), (21, 260, 51, 33, 7400)],
    ),
];

pub async fn seed_demo(db: &mut Db) -> toasty::Result<()> {
    if Org::filter_by_slug("demo")
        .first()
        .exec(&mut *db)
        .await?
        .is_some()
    {
        return Ok(());
    }

    let now = now_unix();
    let start = now - 25 * 86400;
    let end = now + 65 * 86400;

    let org = toasty::create!(Org {
        slug: "demo",
        name: "Demo Corp",
        created_at: now,
    })
    .exec(&mut *db)
    .await?;

    let cfg = ScoringConfig::default();
    toasty::create!(Competition {
        org_id: org.id,
        name: "Autumn Posting Sprint",
        start_at: start,
        end_at: end,
        max_posts_per_week: cfg.max_posts_per_week as i64,
        per_reaction: cfg.per_reaction,
        per_comment: cfg.per_comment,
        per_repost: cfg.per_repost,
        per_send: cfg.per_send,
        per_save: cfg.per_save,
        per_impression: cfg.per_impression,
        per_follower_gained: cfg.per_follower_gained,
        per_profile_view: cfg.per_profile_view,
        normalize_by_followers: cfg.normalize_by_followers,
        follower_baseline: cfg.follower_baseline,
        is_active: true,
        created_at: now,
    })
    .exec(&mut *db)
    .await?;

    // An admin for the demo org — without one the dashboard is unreachable now that the admin
    // role, not a separate login, is what unlocks it.
    let (_unused, admin_token) = new_bearer_token();
    toasty::create!(Member {
        org_id: org.id,
        display_name: "Demo Admin",
        linkedin_urn: "pending:admin@demo.test",
        public_identifier: "",
        profile_url: None,
        is_admin: true,
        email: Some("admin@demo.test".to_string()),
        password_hash: Some(hash_password(DEMO_PASSWORD)),
        api_token_hash: admin_token,
        created_at: now,
    })
    .exec(&mut *db)
    .await?;

    for (idx, person) in PEOPLE.iter().enumerate() {
        let (name, f_start, f_now, v_start, v_now, posts) = *person;
        let slug = name.to_lowercase().replace(' ', "-");
        let (_unused, token_hash) = new_bearer_token();

        let member = toasty::create!(Member {
            org_id: org.id,
            display_name: name,
            linkedin_urn: format!("urn:li:member:demo{idx}"),
            public_identifier: slug.clone(),
            profile_url: Some(format!("https://www.linkedin.com/in/{slug}/")),
            is_admin: false,
            // Everyone signs in, so seeded participants need real credentials or the demo is
            // unusable: <first-name>@demo.test / demopassword.
            email: Some(format!("{}@demo.test", slug.split('-').next().unwrap_or(&slug))),
            password_hash: Some(hash_password(DEMO_PASSWORD)),
            api_token_hash: token_hash,
            created_at: now,
        })
        .exec(&mut *db)
        .await?;

        // Two profile snapshots so there's an in-window follower/view delta.
        toasty::create!(ProfileSnapshot {
            member_id: member.id,
            captured_at: start + 86400,
            follower_count: Some(f_start),
            profile_views: Some(v_start),
        })
        .exec(&mut *db)
        .await?;
        toasty::create!(ProfileSnapshot {
            member_id: member.id,
            captured_at: now,
            follower_count: Some(f_now),
            profile_views: Some(v_now),
        })
        .exec(&mut *db)
        .await?;

        for (i, (day, reactions, comments, reposts, impressions)) in posts.iter().enumerate() {
            let created = start + day * 86400;
            let post = toasty::create!(Post {
                member_id: member.id,
                urn: format!("urn:li:activity:demo{idx}-{i}"),
                permalink: format!("https://www.linkedin.com/feed/update/urn:li:activity:demo{idx}-{i}/"),
                created_at: created,
                text_preview: Some(format!("{name}'s post #{}", i + 1)),
            })
            .exec(&mut *db)
            .await?;

            toasty::create!(PostSnapshot {
                post_id: post.id,
                captured_at: now,
                impressions: Some(*impressions),
                reactions: Some(*reactions),
                comments: Some(*comments),
                reposts: Some(*reposts),
            })
            .exec(&mut *db)
            .await?;
        }
    }

    Ok(())
}
