# Issue 02 — Typed Tauri command bindings via tauri-specta

Status: needs-triage

Plan reference: Milestone 2, Task 2.2.

## Goal

Replace the hand-maintained string-literal IPC wrapper (`app/tauri-bridge.js`) with
generated typed bindings (`tauri-specta`) so a Rust command rename becomes a compile
error in the frontend instead of a silent runtime failure.

## In Scope

- Add `tauri-specta` + `specta` as Rust dependencies in `src-tauri/Cargo.toml`.
- Annotate each `#[tauri::command]` for specta collection in `src-tauri/src/lib.rs`.
- Create `src-tauri/src/bin/export-bindings.rs` to generate `app/bindings.ts`.
- Generate `app/bindings.ts` covering all 19 registered commands.
- Add CI check that regenerates bindings and fails on diff.

## Out of Scope

- Migrating any panel to use the bindings (Issue 03).
- Deleting `app/tauri-bridge.js` (done in plan Task 3.8).

## Acceptance Criteria

- `app/bindings.ts` covers all 19 commands: `list_library`, `get_recipe`, `save_recipe`,
  `render_pipeline`, `pipeline_capabilities`, `import_sources`, `list_presets`,
  `save_preset`, `get_workspace_state`, `save_workspace_state`, `batch_sync`,
  `apply_preset`, `check_license`, `update_culling`, `list_culling`, `export_image`,
  `import_images`, `viewport_proof_results`, `save_viewport_proof`.
- A `.ts` file calling a command with the wrong argument shape fails `tsc --noEmit`.
- CI includes a binding-regeneration diff check (inert until a remote exists per Task 0.3).

## Verification

- `npx tsc --noEmit`
- `npm test`
- `cargo run --manifest-path src-tauri/Cargo.toml --bin export-bindings && git diff --exit-code app/bindings.ts`
