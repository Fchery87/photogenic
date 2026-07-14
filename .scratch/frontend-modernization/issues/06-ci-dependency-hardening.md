# Issue 06 — CI, dependency automation, auto-update, and telemetry hardening

Status: needs-triage

Plan reference: Milestone 1 (Tasks 1.6–1.7) + Milestone 5 (Tasks 5.1–5.3).

> **Blocking dependency:** requires a git remote (plan Task 0.3) for full verification.
> Config can be landed now; CI gates go live once the remote exists.

## Goal

Wire lint/clippy into CI as required gates, stop silently swallowing packaging failures,
add Dependabot, an auto-update plugin scaffold, and opt-in crash/error telemetry.

## In Scope

- **Task 1.6:** Add `npm run lint` and `cargo clippy --all-targets -D warnings` to `.github/workflows/ci.yml` before test steps.
- **Task 1.7:** Remove `continue-on-error: true` from the packaging job once a green baseline run confirms bundles succeed cross-platform.
- **Task 5.1:** Add `.github/dependabot.yml` for npm (`/`) and cargo (`/src-tauri`), weekly, grouped.
- **Task 5.2:** Add `tauri-plugin-updater` + config + release runbook.
- **Task 5.3:** Add opt-in crash/error telemetry (never on by default; ADR-0009 privacy stance).

## Out of Scope

- Enabling telemetry by default.
- Building the cloud backend for telemetry ingestion.

## Acceptance Criteria

- CI runs `npm run lint` and `cargo clippy -D warnings` as required gates (fail fast).
- Packaging job has no `continue-on-error` (or tracked issue for failing OS).
- Dependabot config covers npm + cargo.
- Updater plugin registered with documented signing/feed config.
- Telemetry is off by default, only activates after explicit consent.
- `cargo test`, `npm test` green.

## Verification

- `npm run lint`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm test`
- (CI verification requires git remote from Task 0.3)

## Comments

### CI baseline run (2026-07-14, run 29312518018)
First-ever CI run after connecting the remote. Result: **failures on all 3 OS** (ubuntu, macos, windows).

**Root cause:** `node:sqlite` is not available in Node.js 20 (CI uses `node-version: '20'`).
`node:sqlite` was introduced experimentally in Node 22. Two tests fail:
- `test/sqlite-catalog-backend.test.js` — entire file fails with `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module: node:sqlite`
- `smoke script runs and produces a valid report with all steps passing` — smoke script fails for the same reason

**Action needed before Task 1.6 can gate on `npm test`:** bump `node-version` in `.github/workflows/ci.yml` to `22` (or use `node-version-file` pointing at `.nvmrc`). This is a pre-existing issue, not introduced by this plan.
