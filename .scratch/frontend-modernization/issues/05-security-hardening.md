# Issue 05 — Security & reliability hardening

Status: needs-triage

Plan reference: Milestone 1, Tasks 1.1–1.5.

## Goal

Close the concrete security and reliability gaps found in the review. Independent of
the frontend migration — do this first since it's cheap and de-risks everything downstream.

## In Scope

- **Task 1.1:** Lock down webview CSP (`tauri.conf.json` currently `"csp": null`).
- **Task 1.2:** Author the missing Tauri capabilities file (`src-tauri/capabilities/default.json`).
- **Task 1.3:** Fix the two real production panic paths in `src-tauri/src/lib.rs` (catalog-DB-open `.expect` at startup, export output-format `.unwrap()`).
- **Task 1.4:** Add clippy guard lints (`#![cfg_attr(not(test), warn(clippy::unwrap_used, clippy::expect_used))]`) to keep production code panic-free mechanically.
- **Task 1.5:** Stop silently dropping the recipe-fingerprint write result (propagate with `?`).

## Out of Scope

- CI gate wiring (Issue 06).
- Frontend changes.

## Acceptance Criteria

- `tauri.conf.json` has an explicit CSP policy (not `null`).
- `src-tauri/capabilities/default.json` exists, scoped to exactly the commands the webview uses.
- The two production panic paths in `lib.rs` are resolved.
- Clippy `unwrap_used`/`expect_used` lints are active for non-test builds with zero findings.
- Recipe-fingerprint write failures surface as export errors, not silent drops.
- `cargo test`, `cargo clippy -D warnings`, `npm test`, `npm run tauri:build` all green.

## Verification

- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`
- `npm test`
- `npm run tauri:dev` (verify all bridge calls still work)
