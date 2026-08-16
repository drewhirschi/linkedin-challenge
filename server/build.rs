fn main() {
    nextrs::build::emit_registry("app", "src/main.rs", "nextrs_routes.rs")
        .expect("nextrs::build::emit_registry failed");

    // Typed seed companions for prefetch.rs — the scaffold omits this call because `--adopt`
    // ships no prefetch example, but every seeded page needs it.
    nextrs::build::emit_seeds("app", "nextrs_seeds.rs").expect("nextrs::build::emit_seeds failed");

    nextrs::bundle::bundle_pages(&nextrs::bundle::BundleConfig {
        app_dir: "app",
        project_dir: Some("."),
        client_dir: ".nextrs/client",
        client_alias: "@linkedin-challenge/client",
        public_dist: "public/dist",
        ..Default::default()
    })
    .expect("nextrs::bundle::bundle_pages failed");
}
