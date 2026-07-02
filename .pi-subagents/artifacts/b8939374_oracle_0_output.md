## Verdict

**Most important risk:** the plan treats **Tauri/webview as locked** while also admitting the **rendering model may need to change all the way to native UI** if Phase 0 fails. That is not a clean de-risk sequence; it is a contradiction at the heart of the architecture.

- `ARCHITECTURE.md:5` says **Tauri** is a locked decision.
- `docs/adr/0004-gpu-surface-webview-compositing-is-phase0-keystone.md:14-20` says if the path fails, the fallback can end at **native UI instead of webview**.
- `ARCHITECTURE.md:247` still frames the Phase-0 spike as something to prove **after** the Tauri commitment is already made.

If the keystone spike is truly keystone, **the shell/rendering decision is not locked yet**.

---

## A) Severity-graded findings

### P0 — Core architectural contradiction: “locked Tauri” vs “maybe abandon webview”
**Evidence**
- `ARCHITECTURE.md:5` — “Locked decisions: Tauri...”
- `docs/adr/0004-gpu-surface-webview-compositing-is-phase0-keystone.md:11-20` — if 60fps compositing fails, “the rendering model must change,” with fallback #3 being **render UI natively**.
- `ARCHITECTURE.md:217` — the team already recognizes this path may be unachievable.

**Why this matters**
This is more than a spike risk. It means:
- the UI ownership split in ADR-0002 may collapse,
- the staffing plan changes materially,
- the “primarily web/JS/TS team” assumption may stop being valid,
- Phase 0 is not just validation; it is a potential platform pivot.

**Assessment**
As written, the roadmap understates how much of the product is contingent on this one result.

---

### P1 — Phase-0 spike is under-scoped and may produce a false positive
**Evidence**
- `docs/adr/0004-gpu-surface-webview-compositing-is-phase0-keystone.md:3-6` — success is defined around a **trivial gradient shader** at 60fps.
- `ARCHITECTURE.md:164-169` — Phase 0 moves from gradient → RAW decode → one exposure adjustment.
- `docs/adr/0008-scene-referred-linear-float-working-space.md:17-19` — a correct **output/display transform is mandatory** before pixels reach screen/file.

**Concern**
A gradient proves very little about the real viewport path. It does **not** validate:
- color-managed display transform,
- real texture sizes / memory pressure,
- zoom/pan at arbitrary scales,
- overlay compositing for masks/crops/brushes,
- JS/native event sync,
- HiDPI behavior,
- platform-specific transparency/input quirks if using a child surface,
- latency under continuous parameter updates.

A gradient-in-webview can pass while the real editor viewport still fails.

---

### P1 — ADR-0002 underestimates staffing risk; one specialist is too thin for this architecture
**Evidence**
- `docs/adr/0002-engine-owned-by-graphics-specialist.md:1-19` — engine owned by **one team member**, with bus-factor mitigated by “pairing and documented shaders.”
- `ARCHITECTURE.md:49-77` — the engine scope includes decode, linear float pipeline, WGSL compute, display path, and CPU fallback.
- `ARCHITECTURE.md:240` — Phases 0–2 estimated at **~5–7 months** with a small focused team.

**Concern**
This is not just “shader ownership.” The specialist is implicitly carrying:
- GPU architecture,
- cross-platform surface/compositing,
- performance profiling,
- color pipeline correctness,
- memory behavior,
- CPU fallback design,
- likely engine review for every UI feature that touches the viewport.

“Pairing + docs” is not an adequate mitigation when that person owns the most failure-prone subsystem and also gates the whole schedule.

---

### P1 — The roadmap still commits too much before discovery is complete
**Evidence**
- `ARCHITECTURE.md:161-169` — Phase 0 is the critical de-risk step.
- `ARCHITECTURE.md:171-182` — Phase 1 scope is already broad: import, library, develop panel, export, sidecars, licensing, parity CI.
- `ARCHITECTURE.md:240` — total Phases 0–2 in **5–7 months**.
- `ARCHITECTURE.md:29` — Linux support described as making this “cheap.”

**Concern**
This sequencing is better than many plans, but still optimistic in two ways:
1. It assumes the viewport result will be clear and portable quickly.
2. It assumes Linux + Tauri + wgpu + ONNX + packaging are close to free once the engine works.

That is unlikely. Linux is not cheap here; it is a multiplier on the exact surfaces that are least stable.

---

### P2 — Hidden coupling between proxy-only editing and later AI/retouch quality
**Evidence**
- `ARCHITECTURE.md:148-151` — “Full RAW is pulled only at export.”
- `CONTEXT.md` defines Preview as reduced/proxy resolution.
- `ARCHITECTURE.md:184-191` — Phase 2 depends on face/skin retouch, masking, culling.

**Concern**
“Full RAW only at export” is too strong for a portrait editor. It likely breaks:
- 1:1 inspection,
- fine mask edges,
- skin texture judgments,
- sharpening/noise-reduction decisions,
- confidence in AI retouch before export.

A serious editor usually needs **tile-based full-res preview** or at least selective full-res inspection before export.

---

### P2 — Model/license risk still sits on the critical path to the first public launch
**Evidence**
- `MODELS.md:15-17` — critical face-related models are still `⚠️` / `🔎` (`GFPGAN`, `CodeFormer`, `BiSeNet` provenance unverified).
- `ARCHITECTURE.md:184-191` — Phase 2 depends on face/skin retouch.
- `docs/adr/0005-phase1-internal-alpha-launch-at-phase2.md:6-18` — public launch waits for Phase 2.

**Concern**
The plan says “launch when Phase 2 exists,” but a meaningful chunk of Phase 2 still depends on unresolved model provenance/replacement decisions.

This is manageable, but it is more schedule-critical than the docs imply.

---

### P3 — “First-class Linux support … cheap” is not credible in this stack
**Evidence**
- `ARCHITECTURE.md:29` — Linux support described as cheap.
- `ARCHITECTURE.md:77, 88, 165, 186` — Linux must share wgpu compute, Tauri viewport behavior, CPU fallback, and ONNX runtime routing.

**Concern**
Linux can be a differentiator, but in this architecture it increases QA and driver-path variance exactly where the project is weakest: GPU surfaces, webview composition, and inference backends.

I would treat Linux as strategic, not cheap.

---

## B) Top 3 assumptions most likely to break the project

1. **That a webview-hosted Tauri UI can reliably display the Rust/wgpu viewport cross-platform at production quality.**  
   Not just a gradient at 60fps — real image data, color transform, overlays, input routing, resize, HiDPI, and packaging.

2. **That one graphics specialist is enough to own the engine without creating a schedule and knowledge bottleneck.**  
   This architecture concentrates too much delivery risk in one person.

3. **That the Phase 0–2 scope fits in ~5–7 months with a small mostly JS/TS team.**  
   The estimate ignores integration drag between RAW/color/GPU/UI/AI/platform packaging.

---

## C) Recommendations for the two focus areas

### 1) Specialist-dependency decision (ADR-0002)

**Recommendation: REVISE, not keep as written.**

**Keep**
- Keep the honesty that this engine needs real graphics expertise.
- Keep the rejection of “thin Rust wrapper” thinking.

**Revise**
- Change from **single-owner specialist** to **engine lead + second maintainer**.
- Require a named backup who can:
  - review WGSL/Rust engine code,
  - ship basic fixes,
  - own build/test infra for the engine.
- Split responsibilities explicitly:
  - **graphics lead**: pipeline, shaders, perf, display path
  - **platform/integration engineer**: Tauri/native embedding, input, packaging, OS quirks
- Add hard artifacts, not just “pairing and docs”:
  - engine design docs,
  - shader conventions,
  - golden-image CI from Phase 0 onward,
  - profiling dashboards,
  - platform compatibility matrix.

**Replace if you cannot staff this**
- If you cannot field at least **two engine-capable people** for the critical path, I would replace this plan with a less novel rendering architecture or a heavier use of existing native components/SDKs. The current plan is too specialist-dependent for a single point of failure.

---

### 2) wgpu → Tauri webview rendering bet / Phase-0 keystone spike (ADR-0004)

**Recommendation: REPLACE as the “default architecture”; keep only as a hypothesis to test.**

**What I would do instead**
- Treat **webview compositing as provisional**, not accepted.
- Make the actual default assumption:
  - **native viewport surface first**, with the web UI acting as surrounding chrome if needed.
- Only preserve “texture into webview” if a production-like spike proves it.

**Revise the spike acceptance criteria**
A passing Phase 0 should prove, on all target OSes:
- one real image frame path, not just a gradient,
- display transform / color correctness for viewport output,
- pan/zoom and resize,
- UI overlay interaction alignment,
- sustained parameter scrubbing without hitching,
- HiDPI correctness,
- memory stability over several minutes,
- input/event behavior if using a native child surface,
- a documented fallback that does **not** invalidate staffing and product ownership assumptions.

**What not to do**
- Do not let a trivial gradient pass be interpreted as “the rendering problem is solved.”
- Do not keep Tauri marked “locked” until this proof exists.

---

## D) Approval call

**Reject pending redesign.**

Not because the whole architecture is bad — much of it is thoughtful — but because the two focal decisions are not yet aligned with their actual risk:

- ADR-0002 understates how dangerous the single-specialist dependency is.
- ADR-0004 is correctly identified as keystone risk, but the organization still behaves as if the outcome is mostly known.

### What would change my decision
I would move to **approve with conditions** if you revise the docs to:
1. mark Tauri/webview viewport strategy as **provisional** until Phase 0 passes,
2. strengthen Phase 0 acceptance criteria to test the **real viewport path**,
3. replace the single-specialist staffing model with a **minimum two-person engine/integration capability**,
4. remove or soften the “Linux is cheap” and “5–7 months small team” optimism,
5. define a contingency architecture that preserves product/UI ownership if webview compositing fails.

---

## What I would do differently

1. **Demote Tauri from locked decision to candidate.**
2. **Run a harsher Phase 0** that includes one real image, color-managed viewport output, overlays, zoom/pan, and cross-platform behavior.
3. **Staff an engine pod, not a hero engineer.**
4. **Assume full-res tile preview is needed before export** for a portrait editor.
5. **Use Phase 0 to decide the viewport architecture**, then lock the ADRs afterward.

Overall: the docs are unusually explicit about risk, which is good. But on the two areas you asked about, the current set still contains a planning contradiction and an underestimation of staffing/viewport complexity.