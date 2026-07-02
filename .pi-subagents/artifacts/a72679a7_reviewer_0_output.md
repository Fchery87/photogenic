I have full context now. Let me finalize my analysis of the ADR-0004 contract, the harness, and the tooling.

## Review Summary

**Verdict: approve-with-nits.** The core contract in `gates.js` is sound: `shellDecisionUnlocked` requires *every* gate (including a genuine `sustained_60fps ≥ 60`) to pass, so there is **no false-positive path** where gradient-only unlocks the shell decision. ADR-0004's "necessary but not sufficient" rule is correctly encoded and well tested. No P0/P1 correctness bugs found. The most important issue is that the browser harness proves the gradient gate with a **CPU 2D-canvas fill**, which does not exercise the GPU-texture→webview compositing path that ADR-0004 actually cares about — a "PASS" there is weaker than even ADR's gradient gate.

---

### Findings

**P2 — `app/main.js:5-13` (+`index.html`): gradient gate "PASS" uses 2D canvas, not the GPU→webview path ADR-0004 protects.**
`drawGradient` calls `canvas.getContext("2d")` and fills a `createLinearGradient`. ADR-0004 defines the gradient gate as "a trivial gradient **shader** inside the Tauri webview" driven by a `wgpu`-rendered GPU texture — the entire keystone risk is *GPU-texture compositing into the webview*, which a 2D canvas fill never touches. The harness then renders `gradient → PASS`, which can let a reader conclude the gradient gate is proven when the actual compositing seam has not been exercised at all. This is the closest thing in the diff to the ADR-0004 violation the task warns about.
*Mitigation (why not P1):* README explicitly discloses "the real GPU→webview measurement are not implemented here" and "only the `gradient` gate is wired to a real measurement." 
*Fix:* Either (a) relabel the harness gate as `gradient (2D-canvas placeholder — NOT GPU path)` / use a distinct non-ladder status so it can't read as the ADR gradient gate, or (b) attempt a WebGPU/`getContext("webgpu")` path and mark the gate unproven when unavailable, rather than passing on the 2D fallback.

**P2 — `src/viewport-proof/gates.js:106`: `gradientOnly` is a misleading name/semantic; true for *any* incomplete pass, not only gradient-only.**
`gradientOnly = gradientPassed && !allPassed` is `true` even when gradient + raw_frame + zoom_pan have passed. A consumer reading `verdict.gradientOnly === true` as "literally only the gradient passed" would be wrong, and `gradientOnly === false` is ambiguous (means either *nothing/gradient-not-passed* or *fully solved*). The authoritative field (`shellDecisionUnlocked`) is safe, but this field invites misuse.
*Fix:* Rename to `gradientPassedButIncomplete` (or `provisional`), or make it strictly `passedGates.length === 1 && gradientPassed`. Add a test pinning its value in the multi-gate-partial case (see below).

**P2 — `src/viewport-proof/gates.js:88-133`: documented "order matters" invariant is not enforced or tested; inconsistent gate states are silently accepted.**
The header comment says "Order matters… each gate must pass before the shell decision may be locked," but nothing rejects an impossible/inconsistent report such as `gradient:false` while `raw_frame:true, zoom_pan:true…`. The unlock stays correctly locked (safe direction), but such a state yields the misleading reason "Gradient gate not yet passed — begin the proof at the gradient gate" while later gates are marked passed. Consider validating ladder monotonicity (a gate can't be genuinely passed if an earlier gate isn't) or explicitly documenting that ordering is not enforced. No test covers this.

**P3 — `package.json:9`: `typecheck` script can never fail.**
`"tsc --noEmit || echo 'tsc not installed; skipping…'"` swallows *real* type errors, not just a missing binary — the `echo` exits 0 regardless. Also, `gates.js` has no `// @ts-check` and there's no `tsconfig`/`checkJs`, so the rich JSDoc types are never actually verified even when `tsc` is present. Consider distinguishing "tsc absent" from "tsc failed," and enabling `checkJs` so the JSDoc contract is enforced.

**P3 — Missing edge-case tests (`test/viewport-proof.test.js`).** The suite is good but omits several boundaries that guard the ADR-0004 seam:
- `fps` exactly at floor (`60`) counts as genuine (`>= 60` boundary).
- `fps: NaN` / `Infinity` behavior for `sustained_60fps` (`NaN >= 60` is `false`, `Infinity` passes — worth pinning).
- Non-numeric `fps` (e.g. `"62"`) does not genuinely pass (currently handled by `isGenuinePass` but untested).
- `assertWellFormed` rejection paths: non-array input (`TypeError`), and a `null`/non-object element ("each result must be an object") — both untested.
- `gradientOnly === true` assertion in the multi-gate partial case (line 95 test asserts everything *except* `gradientOnly`).
- `reason` string content for the all-passed and empty cases.

**P3 — `scripts/build.mjs:25`: `manifest.files` lists only top-level `app/` entries.** `readdir(dist/app)` is non-recursive, so nested harness assets wouldn't appear in the manifest. Cosmetic for the current flat layout; will silently under-report if the harness grows subdirectories.

---

### Residual risks
- The contract is shell-agnostic and trusts supplied `GateResult`s; it cannot detect a *fabricated* `sustained_60fps` pass or verify that a reported fps is truly *sustained* vs. a momentary peak (single scalar, `>= 60`). This is inherent to the seam design and acknowledged, but means integrity depends entirely on the (not-yet-implemented) shell measurement layer.
- Because `cargo`/`wgpu` is unavailable, zero of the actual GPU-compositing risk is exercised anywhere in this slice; the "proof" is presently a data-shape contract only. That is disclosed and appropriate for the slice, but the keystone risk remains entirely unmitigated by running code.