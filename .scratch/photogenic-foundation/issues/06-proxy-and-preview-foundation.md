# Issue 06 — Proxy and preview foundation

Status: done

## Goal
Create a deterministic preview/proxy seam without pretending the real RAW/GPU engine already exists.

## Scope
- Define proxy identity and invalidation inputs.
- Define a preview request lifecycle.
- Produce deterministic preview artifacts for fixed source+recipe+viewport inputs.
- Keep viewport-proof honesty intact: preview foundation status must never be mistaken for a passed GPU gate.

## Acceptance Criteria
- Proxy keys change when source identity, recipe fingerprint, or viewport changes.
- Preview requests move from `queued` to `ready` with deterministic artifacts.
- Harness UI shows preview foundation status separately from viewport-proof status.
- The viewport verdict remains provisional.

## Verification
- `npm test`
- `test/preview-foundation.test.js`
- `npm run build`
