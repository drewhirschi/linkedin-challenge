//! Framework-owned OpenAPI extraction helper.
//!
//! `cargo nextrs client generate` invokes this binary. Application code belongs in `src/` and
//! `app/`; developers should not need to edit this file.
//!
//! The route registry is `include!`d rather than reached through the library because this crate's
//! `src/lib.rs` is the domain layer — the generated router lives in the `main.rs` binary. Including
//! it here compiles the `app/` tree a second time but keeps the entry-point layout untouched.

include!(concat!(env!("OUT_DIR"), "/nextrs_routes.rs"));

fn main() {
    let spec = generated_openapi();
    let json = spec.to_pretty_json().expect("serialize OpenAPI document");
    let out = concat!(env!("CARGO_MANIFEST_DIR"), "/.nextrs/openapi.json");
    std::fs::write(out, json).expect("write .nextrs/openapi.json");
    eprintln!("wrote {out}");
}
