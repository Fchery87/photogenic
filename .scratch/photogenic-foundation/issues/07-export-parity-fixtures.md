# Issue 07 — Export parity fixtures and regression strategy

Status: done

## Goal
Create deterministic Preview↔Export parity fixtures at an externally visible boundary.

## Fixture strategy
- Fixed Source descriptor fixture(s)
- Fixed Edit Recipe fixture(s)
- Deterministic Preview artifact output
- Deterministic Export artifact output
- Shared behavior signature proving parity at the external artifact boundary

## Acceptance Criteria
- deterministic fixtures exist
- assertions operate at an externally visible boundary
- preview/export behavior signatures match for the same source+recipe input
- expected artifact snapshots are committed and testable

## Verification
- `npm test`
- `test/export-parity.test.js`
