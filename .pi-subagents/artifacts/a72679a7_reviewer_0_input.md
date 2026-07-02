# Task for reviewer

Review the newly added Phase 0 scaffold in this repo (uncommitted changes). Focus on the viewport-proof implementation and its tests. Files:
- src/viewport-proof/gates.js
- test/viewport-proof.test.js
- app/index.html, app/main.js
- scripts/build.mjs, scripts/lint.mjs
- package.json, README.md

Context: this is the first implementation slice from .scratch/photogenic-foundation/PRD.md, honoring ADR-0004 (gradient is necessary but not sufficient; shell decision stays provisional until all viewport gates pass). cargo is unavailable so the Rust/wgpu engine is intentionally not implemented; this slice implements the highest testable seam (the proof contract) in JS.

Return severity-graded P0-P3 findings for correctness bugs, missing edge-case tests, and any way the code could let a gradient-only pass be mistaken for a solved viewport (which would violate ADR-0004). Keep it scoped to the diff.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```