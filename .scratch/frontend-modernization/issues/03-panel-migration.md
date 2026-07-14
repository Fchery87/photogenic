# Issue 03 — Migrate the editor UI to React (strangler-fig, one panel at a time)

Status: needs-triage

Plan reference: Milestone 3, Tasks 3.1–3.8.

## Goal

Port every panel currently in `app/main.js` / `app/index.html` into typed React
components with behavior-identical output, verified by component tests. Delete the
legacy imperative shell once all panels are migrated.

## In Scope

Port each panel in order, one commit per panel:
1. **Task 3.1:** React root + top bar (brand + pipeline/license badges).
2. **Task 3.2:** Library sidebar + grid (import, star ratings, flag/reject, color labels).
3. **Task 3.3:** Preview area + viewport-proof collector (pure-function gate evaluation typed first).
4. **Task 3.4:** Develop panel (19 recipe controls via a generic `DevelopControl` component).
5. **Task 3.5:** Batch sync panel (explicit operation-type checkbox selection).
6. **Task 3.6:** Preset panel (save/load/apply, rejection of invalid source-dependent ops).
7. **Task 3.7:** Export panel + licensing gate.
8. **Task 3.8:** Delete `app/main.js` and legacy bridge; single React entry point.

## Out of Scope

- Accessibility hardening (Issue 04 — runs after all panels are migrated).
- New product features.
- Pixel processing in the UI.

## Working rules

- Never let `app/main.js` and its React replacement both drive the same DOM element at once.
- All backend calls go through `app/src/bridge.ts` (typed wrapper over `app/bindings.ts`).
- Nothing under `app/` may import from `src/` (Node-only modules).
- Every interactive control ships with `label[for]`/`id` or explicit `aria-label`.

## Acceptance Criteria

- `app/main.js` no longer exists; every panel is a tested React component.
- Every Tauri command call goes through generated bindings, not hand-written string literals.
- `npm test`, `npm run build`, `npm run tauri:dev`, `npm run smoke` all pass.
- Viewport-proof gate evaluation is byte-for-byte equivalent to the current implementation.

## Verification

- `npm run test:components`
- `npm test` (full suite including existing seam tests)
- `npm run build`
- `npm run smoke`
