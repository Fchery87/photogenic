# Photogenic

Cross-platform, AI-assisted photo editor (see `ARCHITECTURE.md` and `docs/adr/`).

## Current implementation slices
- Phase 0 viewport-proof contract + browser harness
- Edit Recipe + Catalog foundation seam
- Sidecar roundtrip + conflict-policy seam
- Preset + Batch Sync persistence/apply seam
- Deterministic preview/proxy + preview/export parity foundation seam
- Local License vs cloud Credit entitlement seam
- Ordered local issue breakdown in `.scratch/photogenic-foundation/issues/`
- Tauri workflow prep via `npm run tauri:attempt`, `npm run tauri:dev`, and `npm run tauri:build`

## Tauri shell next step
On a Cargo-capable machine, restore or regenerate the real `src-tauri/` scaffold and commit the source/config subset:
- `src-tauri/.gitignore`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/build.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/**/*.rs`
- `src-tauri/icons/*`

Keep generated outputs ignored and out of commits:
- `src-tauri/target/`
- `src-tauri/gen/schemas/`

## Scope honesty
- In this repo checkout, the real `src-tauri/` scaffold is now present as untracked/generated project files on the local machine and should be reviewed before commit.
- `npm run tauri:attempt` is the honesty gate for whether the local machine can actually run Tauri work.
- `npm run tauri:dev` and `npm run tauri:build` are the standard workflow once the scaffold is present.
- The browser harness gradient remains a placeholder and does not count as the real GPU→webview gate from ADR-0004.
