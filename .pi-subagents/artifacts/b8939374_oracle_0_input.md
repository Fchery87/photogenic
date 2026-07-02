# Task for oracle

Review the revised architecture and ADR set in this repo as an unbiased second opinion. Focus specifically on stress-testing:

1. the specialist-dependency decision (ADR-0002: dedicated graphics specialist owns the Rust/wgpu engine), and
2. the wgpu->Tauri webview rendering bet / Phase-0 keystone spike (ADR-0004).

Primary files to audit:
- ARCHITECTURE.md
- CONTEXT.md
- MODELS.md
- docs/adr/0001-single-rust-wgpu-image-pipeline.md
- docs/adr/0002-engine-owned-by-graphics-specialist.md
- docs/adr/0003-paid-local-license-cloud-addon.md
- docs/adr/0004-gpu-surface-webview-compositing-is-phase0-keystone.md
- docs/adr/0005-phase1-internal-alpha-launch-at-phase2.md
- docs/adr/0006-ai-model-commercial-license-allowlist.md
- docs/adr/0007-edit-recipe-persistence-catalog-plus-sidecar.md
- docs/adr/0008-scene-referred-linear-float-working-space.md
- docs/adr/0009-cloud-generative-proxy-and-ephemeral-privacy.md

Please do NOT defer to the current plan. Challenge it.

Return:
A) severity-graded findings (P0-P3) with file/section evidence,
B) the top 3 assumptions most likely to break the project,
C) concrete recommendations: keep / revise / replace for the two focus areas,
D) whether you would approve proceeding to Phase 0 as-is, approve with conditions, or reject pending redesign.

Be especially alert to:
- whether the webview/display path is being under- or over-estimated,
- whether the staffing plan actually matches the architecture risk,
- whether any ADRs conflict or create hidden coupling,
- whether the roadmap realistically sequences discovery vs commitment.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

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