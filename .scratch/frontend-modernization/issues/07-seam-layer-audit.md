# Issue 07 — Seam-layer audit (defer until React migration has real consumers)

Status: done

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

## Comments

### Audit date: 2026-07-15

### Method

Ran `grep -rn 'import.*dashboard' scripts/ src/ app/src src-tauri/src` to find all
consumers of dashboard-layer modules across the codebase.

### Finding: Zero production consumers

**No React component, Rust command, or script imports any dashboard-layer module.**

The dashboard modules form internal dependency chains (dashboard-workflow imports
dashboard-foundation) that are consumed **exclusively by their own dedicated test files**.

Consumer map:

| Module | Frontend caller | Rust caller | Script caller | Test file(s) |
|--------|----------------|-------------|---------------|-------------|
| catalog/dashboard-workflow | none | none | none | 1 file, 20 tests |
| catalog/sidecar-dashboard-workflow | none | none | none | 2 files, 7 tests |
| export/dashboard-workflow | none | none | none | 2 files, 37 tests |
| licensing/dashboard-workflow | none | none | none | 2 files, 7 tests |
| preview/dashboard-workflow | none | none | none | 2 files, 16 tests |
| viewport-proof/dashboard-workflow | none | none | none | 2 files, 7 tests |
| internal-alpha/dashboard-workflow | none | none | none | 3 files, 5 tests |

Total: 99 tests across 14 test files.

### Decision: Keep as forward-looking scaffolding (Phase 2 target)

These modules aggregate and summarize catalog/export/licensing/preview/viewport data
for a future admin/monitoring dashboard UI. They were built during Phase 0/1 as
forward-looking scaffolding.

**Rationale for keeping rather than deleting:**
1. They contribute 99 tests of executable contract coverage that documents the
   intended data shapes and aggregation logic.
2. A Phase 2 admin/settings panel will consume them — deleting and rewriting would
   waste the design decisions already encoded in the test suite.
3. They are pure Node-side modules with no webview impact (zero bundle size, zero
   runtime cost when the dashboard UI doesn't exist).
4. The smoke test uses the *non-dashboard* variants (e.g. `export/workflow.js`,
   `export/foundation.js`) which are separate and have real consumers.

**Target milestone:** Phase 2 admin/settings panel will wire these into a real
Tauri command surface (e.g. `get_catalog_dashboard`, `get_export_dashboard`).

### Non-dashboard foundation/workflow modules (confirmed real consumers)

These modules ARE consumed by production code (smoke test, Rust commands, other
workflow modules) and require no action:

- `src/catalog/foundation.js` — consumed by import-workflow, recipe-store
- `src/catalog/import-workflow.js` — consumed by smoke.mjs
- `src/export/foundation.js` — consumed by smoke.mjs
- `src/export/workflow.js` — consumed by smoke.mjs
- `src/licensing/foundation.js` — consumed by licensing modules
- `src/preview/foundation.js` — consumed by preview modules
- `src/viewport-proof/foundation.js` — consumed by viewport-proof modules
