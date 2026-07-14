# Issue 04 — Accessibility hardening pass

Status: needs-triage

Plan reference: Milestone 4, Tasks 4.1–4.2.

## Goal

Build accessibility into the migrated React components: keyboard navigation, ARIA
roles, and an automated axe regression check wired into `npm test`.

## In Scope

- Arrow-key navigation between image cards in `LibraryGrid` (`role="grid"`/`role="gridcell"`).
- `aria-label` fallback on `DevelopControl` when visible label is abbreviated.
- Focus trapping for dialog-like sections in `BatchSyncPanel`, `PresetPanel`.
- `axe-core` or `jest-axe` + node:test adapter.
- `test/components/accessibility.test.js` running axe against the rendered `App` tree.

## Out of Scope

- Retroactive a11y fixes on the old `app/main.js` (it will be deleted by Issue 03).

## Acceptance Criteria

- Every interactive control has a proper accessible name (`label[for]` or `aria-label`).
- Controls are reachable via accessible role/label in `@testing-library/react` queries.
- Automated axe check runs as part of `npm test` (not a separate optional job).

## Verification

- `npm test`
- `npm run test:components`
