# Issue 07 — Seam-layer audit (defer until React migration has real consumers)

Status: needs-triage

Plan reference: Milestone 6, Task 6.1.

## Goal

After the React migration settles, audit the dashboard-foundation/dashboard-workflow
seam layers across `src/catalog`, `src/export`, `src/preview`, `src/licensing`, and
`src/viewport-proof`. For each module with zero real callers, decide explicitly: wire
it, scope-and-schedule it, or delete it. Do not leave any unanswered.

## In Scope

- Grep whether any React component (post-Issue-03) or Rust command calls each dashboard-layer module.
- For modules with zero real callers: wire, scope-and-schedule (with target milestone), or delete.
- Record findings under `## Comments` below.

## Out of Scope

- This audit runs only after Issue 03 is complete — the post-migration frontend confirms which seams have consumers.

## Acceptance Criteria

- Every dashboard-foundation/dashboard-workflow module has an explicit resolution (wired, scoped, or deleted).
- Test count only decreases if a module and its test file were deliberately deleted.
- `npm test`, `npm run build` green.

## Verification

- `grep -rln "dashboard-workflow\|dashboard-foundation" app/src src-tauri/src`
- `npm test`
- `npm run build`
