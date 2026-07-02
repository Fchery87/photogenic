# Photogenic

Cross-platform, AI-assisted photo editor (see `ARCHITECTURE.md`, `docs/adr/`).

## Phase 0 — viewport-proof harness (this scaffold)

This is the first implementation slice from `.scratch/photogenic-foundation/PRD.md`:
the **viewport-proof gate ladder** (ADR-0004) plus a runnable browser harness.

It encodes ADR-0004's rule as executable, tested code: **a trivial gradient passing
is necessary but not sufficient.** The shell decision (Tauri, per `ARCHITECTURE.md`)
stays *provisional* until every gate passes.

### Scope honesty
- `cargo` is not available in this environment, so the Rust/`wgpu` engine and the
  real GPU→webview measurement are **not** implemented here. This slice implements the
  highest testable seam — the proof *contract* — in JS, so later shells (Tauri-preferred
  or a fallback) feed real `GateResult` measurements into `evaluateViewportProof`.
- The harness (`app/`) currently wires only the `gradient` gate to a real measurement;
  the remaining gates are intentionally UNPROVEN.

### Commands
- `npm test`   — run the viewport-proof contract tests (`node --test`)
- `npm run lint`  — dependency-free hygiene lint
- `npm run build` — emit the runnable harness to `dist/`
- `npm run typecheck` — `tsc --noEmit` if TypeScript is installed (optional at this stage)

### Layout
- `src/viewport-proof/gates.js` — the gate ladder + `evaluateViewportProof` (the seam)
- `test/viewport-proof.test.js` — behavior tests at that seam
- `app/` — browser harness that renders the gradient gate and the verdict
- `scripts/` — minimal build + lint
