# Task for researcher

Research Evoto.ai (AI photo editing desktop app for professional photographers) comprehensively and return sourced findings with URLs. I need a detailed teardown to inform building a competing cross-platform desktop app. Cover:

1. FULL FEATURE LIST — every AI tool and editing capability. Specifically: portrait retouching (skin, blemish, teeth whitening, eye enhancement, makeup, body reshape/liquify), background removal/replacement, sky replacement, color grading / presets / LUTs, culling, tethering, batch/bulk editing, style matching / sync presets, RAW processing, masking, relighting, upscaling, denoise, object/blemish removal, headshot generation, expression/eye-open AI, film grain, etc. Group by category.

2. WORKFLOW — how a professional uses it end to end (import RAW → cull → batch style → face detection → retouch → export). What formats it imports/exports (RAW types, DNG, JPEG, TIFF, PSD).

3. TECH / SYSTEM — supported OS (Windows/Mac — is there Linux?), system requirements (CPU, RAM, GPU, disk), whether AI runs locally (on-device GPU) or in the cloud, credit system implications (which features cost cloud credits vs free local edits), offline capability.

4. PRICING & BUSINESS MODEL — subscription tiers, credit system, what a credit buys, free trial.

5. STRENGTHS & WEAKNESSES — from reviews (amateurphotographer, petapixel, reddit, youtube reviews). Performance, quality, complaints, what pros love, what's missing.

6. UNDERLYING TECH SIGNALS — any hints about what framework the desktop app is built with (Qt, Electron, native), what AI models power it, GPU acceleration (CUDA/Metal/DirectML).

Return organized findings with source URLs for each claim, and clearly separate VERIFIED facts from INFERRED. Be thorough — this is the primary research artifact for a build decision.

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