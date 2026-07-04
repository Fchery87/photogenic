# Issue 04 — Sidecar roundtrip and conflict policy

Status: done

## Goal
Make the Sidecar contract explicit and verify that roundtrip/import/export behavior matches ADR-0007.

## Policy
- The Catalog remains the authoritative source of truth.
- Sidecars are portable copies of an image's Edit Recipe plus export metadata.
- If a Sidecar recipe differs from the Catalog recipe, the default import result is `conflict` and the Catalog wins.
- Replacing the Catalog from a Sidecar is explicit/manual via `replace-catalog`.
- Semantically identical recipes must not create false conflicts when object key order differs.

## Sidecar schema
- `sidecarVersion`
- `imageId`
- `exportedAt`
- `catalogRevision`
- `recipe`

## Acceptance Criteria
- Sidecar files serialize and parse deterministically.
- Exporting a Sidecar preserves recipe semantics and revision metadata.
- Importing a matching Sidecar reports `in-sync`.
- Importing a different Sidecar reports `conflict` unless `replace-catalog` is chosen.
- Catalog-wins conflict semantics are explicit in both docs and tests.

## Verification
- `npm test`
- direct file roundtrip checks in `test/sidecar.test.js`
- conflict-path coverage in `test/catalog-recipe-store.test.js`
