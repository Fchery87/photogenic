# Issue 01 — Phase 0 Tauri shell attempt around the viewport-proof harness

Status: ready-for-agent

## Goal
Host the existing Phase 0 viewport-proof harness inside a real Tauri shell without weakening ADR-0004 honesty constraints.

## Problem
The product currently has a browser harness and a shell-agnostic viewport-proof contract, but the preferred desktop shell is still unproven. We need a real Tauri wrapper that loads the existing harness while keeping the viewport verdict honest.

## In Scope
- verify Cargo, Rust, and Tauri CLI/toolchain availability
- scaffold the smallest viable Tauri app around the existing `app/index.html`
- keep `src/viewport-proof/gates.js` as the source of truth for shell-decision evaluation
- ensure the harness still reports a provisional verdict unless genuine viewport measurements are added
- preserve the existing Node/browser build and test path

## Out of Scope
- claiming any viewport gate has passed without real measurement
- replacing the browser harness with a second implementation
- implementing the Rust/`wgpu` image engine itself
- locking the shell decision as complete

## Acceptance Criteria
- on a Cargo-capable machine, a Tauri shell can be scaffolded and launched
- the existing harness UI loads inside Tauri
- the verdict remains provisional with the current placeholder measurement path
- `npm test` and `npm run build` still pass after the shell wiring
- the environment preflight fails clearly when Rust/Cargo is unavailable

## Verification
- `npm test`
- `npm run build`
- `npm run tauri:attempt`
- once `src-tauri/` is restored or regenerated: `npm run tauri:dev`

## Expected Commit Set
When the real scaffold is present, commit the source/config subset:
- `src-tauri/.gitignore`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/build.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`
- `src-tauri/src/**/*.rs`
- `src-tauri/icons/*`

Do not commit generated outputs:
- `src-tauri/target/`
- `src-tauri/gen/schemas/`

## Current State
Cargo/Tauri are now available on the target machine, and the next execution step is to review the generated `src-tauri/` scaffold, verify the harness loads inside Tauri, and then commit the file set above.

## Environment Note
This automated repo environment may still lack Cargo/Rust, so it can prepare scripts/docs and validate JS-side checks but may not be able to relaunch the Tauri runtime itself.
