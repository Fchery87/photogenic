# Issue 14 — Offline License activation

Status: done

## Progress (offline license activation, 2026-07-12)
Closed all six acceptance criteria:
- **Ed25519 license signing/verification** (`src/licensing/license-key.js`): `generateLicenseKeyPair()`, `signLicense(payload, privateKey)`, `verifyLicense(signedLicense, publicKey)` with canonical JSON serialization for deterministic signatures.
- **Activation flow** (`src/licensing/activation.js`): `activateLicense()` verifies signature → checks status → checks expiry (offlineValidUntil + validUntil) → caches verified license as offline snapshot.
- **Cloud credits never enable local features**: `checkLocalAccess()` always sets `creditsIgnored: true` and never allows local-export based on credit balance.
- **Offline reload**: `checkLocalAccess()` works with only the cached license (no re-verification, no network) and naturally expires when the grace window passes.
- **Non-blocking export state**: `describeExportLicensingState()` returns active/inactive/expired/no-license with a human-readable reason, never throws.
Verified: `npm test` 429/429 (+17 activation tests), `cargo test` 73/73, `npm run build` ok.

All six acceptance criteria verified:
1. ✅ Valid signed License enables local edit/export while offline
2. ✅ Expired License denies local licensed features
3. ✅ Invalid signature denies local licensed features (tampered, wrong key, missing signature)
4. ✅ Cloud Credit balance never enables local export
5. ✅ Offline reload uses the cached License snapshot
6. ✅ Export controls explain state without blocking library workflows

Note: the application's public key is not yet embedded in the Tauri config — that wiring awaits Issue 12 (app UI bootstrap). The activation API is complete and tested independently.

## Progress (Ed25519 signature verification in Rust + public key embedding, 2026-07-13)
Closed the Rust-side license verification gap:
- Added `ed25519-compact = "2"` and `base64 = "0.22"` crates for Ed25519 signature verification.
- Created `src-tauri/src/licensing/` module with `verification.rs`: implements canonical JSON serialization (sorted keys, excluding the `signature` field), Ed25519 signature verification against an embedded public key, and proper error reporting for invalid/missing/tampered signatures.
- `check_license` Tauri command now performs real Ed25519 signature verification instead of merely checking for the presence of a `signature` field.
- Public key embedded in Rust as a compile-time constant (`e548f635...`) and added to `tauri.conf.json` under `plugins.license.publicKey`.
- Canonical JSON message computation matches the JS-side `canonicalJson()` function for signature interoperability.
Verified: `cargo test` 107/107 (+4 licensing tests: canonical JSON, hex key validation, signature exclusion), `npm test` 454/454, `npm run smoke` 10/10.

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
