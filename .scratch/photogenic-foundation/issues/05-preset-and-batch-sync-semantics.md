# Issue 05 — Preset and Batch Sync semantics

Status: done

## Goal
Define portable Preset semantics and explicit Batch Sync behavior at the Edit Recipe seam.

## Semantics
- Presets are source-independent subsets of an Edit Recipe.
- Presets may include: `exposure`, `contrast`, `highlights`, `shadows`, `temperature`, `tint`.
- Presets may not include source-dependent operations such as `crop`, `straighten`, or `mask`.
- Batch Sync copies an explicit subset of operation types from a source recipe onto a target recipe.
- Batch Sync replaces target operations of the included types while preserving all other target operations.

## Acceptance Criteria
- Preset persistence exists at the Catalog boundary.
- Invalid source-dependent Presets are rejected.
- Applying a Preset replaces only the Preset-covered operation types.
- Batch Sync preserves non-included target operations.
- Fingerprints remain deterministic for semantically identical results.

## Verification
- `npm test`
- `test/preset-store.test.js`
- `test/edit-recipe.test.js`
