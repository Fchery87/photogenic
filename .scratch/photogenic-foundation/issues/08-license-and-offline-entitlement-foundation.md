# Issue 08 — License and offline entitlement foundation

Status: done

## Goal
Lay the first local License foundation separate from cloud Credits.

## Semantics
- Local edit/export decisions are governed by local License state only.
- Cloud Credits remain a separate entitlement surface for future cloud/generative work.
- Offline use is allowed while a locally cached License snapshot remains valid.
- Expired or inactive Licenses deny local licensed features.

## Acceptance Criteria
- offline-capable local License semantics are explicit
- cloud Credits remain separate from License behavior
- local export decisions do not branch on Credit balances
- local/cloud entitlement evaluation uses separate APIs

## Verification
- `npm test`
- `test/entitlements.test.js`
