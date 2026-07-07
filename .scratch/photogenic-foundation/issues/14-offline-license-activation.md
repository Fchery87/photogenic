# Issue 14 — Offline License activation

Status: ready-for-agent

## Goal
Add signed offline License validation and internal-alpha activation UI while keeping local editing/export entitlements separate from future cloud Credits.

## In Scope
- Signed local License validation using public verification material in the app.
- Offline cached License snapshot for local edit/export availability.
- Workflow updates that deny expired or invalid Licenses.
- License panel for entering/storing local activation state.
- UI messaging for inactive or expired License states that affect export availability.

## Out of Scope
- Requiring an online activation service for the internal alpha. If a signed License file is missing, the app may guide the user to provide one but must not silently require network activation for normal offline use.
- Cloud Credits enabling local editing or local export.
- Billing UI, account management, or generative cloud entitlement work.

## Acceptance Criteria
- Valid signed License enables local edit/export while offline.
- Expired License denies local licensed features.
- Invalid signature denies local licensed features.
- Cloud Credit balance never enables local export.
- Offline reload uses the cached License snapshot.
- Export controls explain inactive or expired License state without blocking unrelated library workflows.

## Verification
- `cargo test --manifest-path src-tauri/Cargo.toml licensing`
- `npm test -- test/entitlements.test.js test/licensing-workflow.test.js`
- `npm test -- test/internal-alpha-license-ui.test.js test/licensing-session-workflow.test.js test/licensing-dashboard-workflow.test.js`
- `npm run build`
