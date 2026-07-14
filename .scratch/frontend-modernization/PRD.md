# PRD — Frontend React/TypeScript Modernization + Codebase Hardening

Status: ready-for-agent

## Goal

Bring the shipped UI back in line with the project's locked architecture decision
(React + TypeScript, `ARCHITECTURE.md` lines 44/86), replacing the hand-rolled
vanilla-JS editor shell (`app/main.js`) with a typed, componentized React frontend.
Also close the concrete security, reliability, and CI gaps found in the same review,
without touching ADR-0001's single Rust/wgpu pixel pipeline.

## Plan reference

Full implementation plan:
`docs/plans/2026-07-14-frontend-react-typescript-modernization.md`

ADR-0011 records the correction decision: `docs/adr/0011-frontend-react-typescript-correction.md`

## Issue index

| Issue | Milestone(s) | Summary |
|-------|-------------|---------|
| [01-toolchain-foundation](issues/01-toolchain-foundation.md) | M2 (Tasks 2.1, 2.3) | TypeScript + Vite + React + component-test infrastructure |
| [02-typed-ipc-bindings](issues/02-typed-ipc-bindings.md) | M2 (Task 2.2) | Generated tauri-specta typed command bindings |
| [03-panel-migration](issues/03-panel-migration.md) | M3 (Tasks 3.1–3.8) | Strangler-fig migration of every panel to React |
| [04-accessibility-pass](issues/04-accessibility-pass.md) | M4 (Tasks 4.1–4.2) | Keyboard nav, ARIA, automated axe regression check |
| [05-security-hardening](issues/05-security-hardening.md) | M1 (Tasks 1.1–1.5) | CSP, capabilities, panic-path fixes, clippy lints, dropped Result |
| [06-ci-dependency-hardening](issues/06-ci-dependency-hardening.md) | M1 (Tasks 1.6–1.7), M5 (Tasks 5.1–5.3) | Lint/clippy CI gates, packaging gate, Dependabot, auto-update, telemetry |
| [07-seam-layer-audit](issues/07-seam-layer-audit.md) | M6 (Task 6.1) | Resolve unused dashboard seam layers after React migration |

## Dependency order

1. Record decision (ADR-0011) — done.
2. Connect git remote (plan Task 0.3) — gates all CI verification.
3. Security/reliability hardening (issue 05) — independent, cheap, de-risk first.
4. Toolchain foundation (issues 01, 02) — nothing in issue 03 can start without this.
5. Panel-by-panel migration (issue 03) — strangler-fig.
6. Accessibility pass (issue 04) — on the now-componentized panels.
7. CI/dependency hardening (issue 06) — can run in parallel with 03/04.
8. Seam-layer audit (issue 07) — deliberately last.

## Out of scope

- Pixel math, WGSL shaders, or the native Pipeline (`src-tauri/src/core/**`).
- New product features (AI masking, generative cloud, DNG export).
- State-management library or component/UI kit (unless a specific task hits a wall).
- Rewriting the Node-side seam layer (`src/catalog`, `src/export`, etc.) — audit is issue 07.
