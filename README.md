# Photogenic

Cross-platform, AI-assisted photo editor (see `ARCHITECTURE.md` and `docs/adr/`).

## Current implementation slices
- Phase 0 viewport-proof contract + browser harness
- Edit Recipe + Catalog foundation seam
- Ordered local issue breakdown in `.scratch/photogenic-foundation/issues/`

## Scope honesty
- `cargo` / `rustc` are unavailable here, so a real Tauri shell cannot be built in this environment.
- `npm run tauri:attempt` performs an honest blocked preflight instead of pretending slice 1 is complete.
- The browser harness gradient remains a placeholder and does not count as the real GPU→webview gate from ADR-0004.
