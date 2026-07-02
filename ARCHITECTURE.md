# Cross-Platform AI Photo Editor — Technical Architecture & Roadmap

> **Product goal:** A professional-grade, lightweight, Windows/Mac/**Linux** AI photo editor in the spirit of Evoto.ai — batch-oriented, RAW-first, AI-assisted portrait/event editing.
>
> **Current posture:** Tauri is the **preferred** shell (not fully locked until the Phase-0 viewport proof passes) · Hybrid AI (local detection/retouch, cloud generative) · MVP = solid RAW editor + presets first, AI later · Team = primarily web/JS/TS.
>
> **Decisions of record (ADRs).** This document is the overview; the binding, hard-to-reverse decisions live in `docs/adr/` and the domain glossary in `CONTEXT.md`. Where they conflict, the ADRs win.
>
> | ADR | Decision |
> |---|---|
> | [0001](docs/adr/0001-single-rust-wgpu-image-pipeline.md) | One Rust/wgpu pipeline owns all pixel math (preview = export) |
> | [0002](docs/adr/0002-engine-owned-by-graphics-specialist.md) | Engine owned by a dedicated graphics specialist (not the JS/TS team) |
> | [0003](docs/adr/0003-paid-local-license-cloud-addon.md) | Paid local license; cloud generative is a separate metered add-on |
> | [0004](docs/adr/0004-gpu-surface-webview-compositing-is-phase0-keystone.md) | GPU-texture→webview @60fps is the first Phase-0 spike |
> | [0005](docs/adr/0005-phase1-internal-alpha-launch-at-phase2.md) | Phase 1 is an internal alpha; public launch gated on Phase 2 |
> | [0006](docs/adr/0006-ai-model-commercial-license-allowlist.md) | AI models require verified commercial-use licenses (see `MODELS.md`) |
> | [0007](docs/adr/0007-edit-recipe-persistence-catalog-plus-sidecar.md) | Edit Recipe: catalog is source of truth + optional sidecars |
> | [0008](docs/adr/0008-scene-referred-linear-float-working-space.md) | Pipeline works in scene-referred linear 32-bit float, wide gamut |
> | [0009](docs/adr/0009-cloud-generative-proxy-and-ephemeral-privacy.md) | Cloud generative proxies a 3rd-party API with an ephemeral privacy contract |

---

## 0. Strategic Positioning (why we win)

Evoto's four biggest, verified weaknesses become our differentiators:

| Evoto weakness | Our answer |
|---|---|
| **No Linux** | First-class Linux support (strategic differentiator, but **not cheap** — it increases GPU/display/packaging complexity) |
| **Punitive credit metering** (pay per exported image) | **Unlimited local exports.** Credits/cloud only for optional generative features |
| **RAW flattened on export; no DNG/PSD** | Proper DNG/TIFF/PSD export + Lightroom-friendly round-trip |
| **Cloud dependence for many features** | Fully-offline mode for the entire core editor + local AI |

**Red line we will NOT cross at launch:** from-scratch generative "replace the photographer" features (Evoto's Headshotgate backlash). Our AI *assists* real photos, never fabricates subjects.

---

## 1. System Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│  UI LAYER  (Web tech — JS/TS team owns this)                   │
│  React + TypeScript — sends edit params, blits result texture  │
│  - Library/grid, filmstrip, develop panels, masking UI         │
│  - Does NOT process pixels (ADR-0001). Displays engine output. │
└───────────────▲───────────────────────────────────────────────┘
                │ Tauri IPC (params in) + GPU texture (frame out)
┌───────────────┴───────────────────────────────────────────────┐
│  RUST CORE  (specialist-owned engine + app services)           │
│  App services: command router, job queue, cancellation,        │
│    catalog/DB (SQLite), offline license, file I/O              │
│  ── engine owned by graphics specialist (ADR-0002) ───────────  │
│  IMAGE ENGINE = the single authoritative Pipeline (ADR-0001):  │
│    LibRaw decode → linear float → WB/demosaic/denoise →        │
│    color/curves/HSL/masks (WGSL compute) → output transform.   │
│    Same pipeline @ proxy (Preview) and full-res (Export).      │
└───────┬───────────────────────┬───────────────────────┬───────┘
        │                       │                       │
┌───────▼────────┐   ┌──────────▼─────────┐   ┌─────────▼────────┐
│ GPU DISPLAY    │   │ AI INFERENCE       │   │ CLOUD CLIENT     │
│ path (ADR-0004)│   │ (local, on-device) │   │ (optional, Ph.3) │
│ wgpu texture → │   │ - ONNX Runtime EP: │   │ - Generative via │
│ Tauri webview  │   │   CUDA/CoreML/     │   │   proxied API    │
│ @60fps — FIRST │   │   DirectML/Vulkan  │   │ - Credits (only  │
│ thing to prove;│   │ - Recognition:     │   │   here)          │
│ CPU fallback   │   │   matting/face/    │   │ - Ephemeral opt- │
│ adapter floor  │   │   skin/culling     │   │   in (ADR-0009)  │
└────────────────┘   └────────────────────┘   └──────────────────┘
```

### Design principles
1. **One pipeline owns all pixel math — the Rust core is *not* thin (ADR-0001, ADR-0002).** The authoritative image Pipeline lives in Rust and runs on GPU via `wgpu`/WGSL. Preview and Export run the *same* pipeline (proxy vs full resolution) to guarantee **Parity**. The web UI never touches pixels — it sends edit parameters and blits the resulting texture.
   > ⚠️ This **replaces** the original "Rust stays thin, shields the JS/TS team" principle. It doesn't hold: the engine is the deepest, most performance-critical part of the system. Revised principle: *the Rust/wgpu engine is owned by a graphics specialist; the JS/TS team owns UI, catalog, IPC, cloud client, and product.*
2. **Non-destructive editing (ADR-0007).** Original file never mutated; edits are an ordered **Edit Recipe** applied on render/export. Recipe lives in the SQLite catalog (source of truth) with optional portable **sidecars**. Foundation for Batch Sync and Presets.
3. **Scene-referred linear float (ADR-0008).** The pipeline computes in linear-light 32-bit float, wide gamut; the display/output transform is applied only at the end. Non-negotiable for highlight latitude and correct blending.
4. **Local-first.** Everything in the core editor works offline, including license validation (ADR-0003). Cloud is strictly opt-in for **Generative** extras.
5. **GPU everywhere, with a CPU floor.** One portable compute path (`wgpu`: Vulkan/Metal/DX12) so Linux gets parity — but a software/CPU fallback adapter must let the app *launch and edit* (degraded) on integrated GPUs and weak drivers. Only AI is gated on a real GPU. "Lightweight" means it still runs on modest hardware.

---

## 2. Technology Choices (with rationale & alternates)

| Concern | Primary choice | Alternate / escape hatch |
|---|---|---|
| App shell | **Tauri 2.x** | (locked) |
| UI framework | **React + TypeScript** | Svelte for lighter bundle |
| Image pipeline | **Rust + `wgpu`/WGSL compute** — single authoritative pipeline (ADR-0001) | — (parity requirement rules out a separate web pipeline) |
| Viewport display | **`wgpu` texture composited into the Tauri webview** (ADR-0004) | fallback ladder in ADR-0004; **CPU fallback adapter** is the min-spec floor |
| RAW decode | **LibRaw** via Rust FFI (`libraw` bindings) or sidecar | `rawler` (pure-Rust) for common formats |
| Working space | **scene-referred linear 32-bit float, wide gamut** (ADR-0008) | — |
| Color management | **`lcms2`** (ICC in/out transforms) | — |
| Local AI runtime | **ONNX Runtime** (`ort` crate) with execution-provider routing | `ncnn`/`ggml` sidecar for mobile-class models |
| Catalog DB | **SQLite** (`rusqlite`/`sqlx`) | — |
| Async/jobs | **Tokio** + bounded worker pool | — |
| Edit persistence | **SQLite catalog = source of truth + optional XMP-style sidecars** (ADR-0007) | — |
| Licensing | **Offline-validating signed license keys** (ADR-0003), designed in Phase 1 | periodic online re-check at most |
| Cloud backend (Phase 3) | **Our backend proxying a 3rd-party GPU inference API** (ADR-0009) | self-host later if volume justifies |
| Packaging | Tauri bundler: `.msi/.exe` (Win), `.dmg` (Mac, notarized), `.AppImage/.deb/.rpm` (Linux) | — |

### Local AI model shortlist (open weights, on-device)
> ⚠️ **Every model must pass the commercial-license gate (ADR-0006). Tracked in `MODELS.md`.**
> Some popular weights are non-commercial and are excluded from a *paid* product.

- **Matting / background:** **BiRefNet (MIT — chosen)**. ~~RMBG~~ excluded (non-commercial).
- **Face detect + landmarks:** RetinaFace / MediaPipe-class (Apache) — OK
- **Face/skin parsing:** BiSeNet face-parsing — **verify weights provenance first** (🔎)
- **Skin retouch:** frequency-separation classical + light learned model (ours)
- **Restore/enhance:** Real-ESRGAN (BSD-3, upscale) OK; ~~GFPGAN/CodeFormer~~ have non-commercial parts — find permissive weights or **train our own**
- **Denoise:** learned RAW denoiser or classical (wavelet/NLM) on the RAW linear data
- **Culling:** blur/exposure/eyes-closed classifiers (lightweight CNNs, ours)

**Distribution (Q10):** lean installer bundles only the smallest essential model; heavier
models **download on first use** and cache locally for offline reuse. Provide a
"download all models" action for air-gapped/offline-guarantee users.

All shipped as **quantized ONNX** and routed to the best available EP per machine, with CPU fallback.
**Training data:** licensed/commissioned only — **never** user images (ADR-0006).

---

## 3. The Core: Non-Destructive Edit Pipeline

Everything hinges on this. An image's state = **source file + Edit Recipe (JSON)**. One
pipeline (ADR-0001) renders both Preview and Export — same code, different resolution.

```
RAW/JPEG file
   → decode (LibRaw) → scene-referred linear float, wide gamut (ADR-0008)
   → white balance → demosaic → denoise
   → color pipeline: exposure, contrast, tone curve, HSL, color grading, LUT
   → local adjustments (masks: linear/radial/AI-subject/brush)
   → AI ops (retouch/bg/etc.) as recipe nodes
   → output/display transform (ICC via lcms2, sharpening, resize)  ← end of pipeline
   → Preview (proxy res) OR Export (full res)   — SAME pipeline → Parity guaranteed
```

**Why this matters:**
- **Batch Sync** = copy recipe (or a subset of nodes) from hero image to N others.
- **Presets** = a saved recipe with source-independent nodes.
- **Undo/redo** = recipe history; instant, free.
- **Parity** = Preview and Export are pixel-identical because they share the pipeline.

**Persistence (ADR-0007):** the Edit Recipe is stored in the SQLite catalog (source of
truth, fast for library-wide Batch Sync) and can be exported/imported as **XMP-style
sidecars** next to originals for portability and disaster recovery. Originals are never
modified.

**Proxy strategy (Q11):** generate ~4000px **Proxy** copies lazily on import/first-view,
stored in a user-configurable cache dir with an **LRU size cap**; invalidate when the
source or upstream demosaic params change. Never block the UI on proxy build. Full RAW
is pulled only at export.

**Parity guard (Q14):** golden-image pixel-regression tests in CI — a fixed set of RAWs +
recipes rendered at proxy and full res, asserted against committed reference PNGs within
tolerance. Drift fails the build. This protects the single most important guarantee (ADR-0001).

---

## 4. Phased Roadmap

### Phase 0 — Foundations (spike / de-risk)  ·  ~2–3 wks
**Goal:** prove the riskiest integration FIRST (ADR-0004), before building anything on it.
**Ordered so a negative result invalidates cheaply:**
1. [ ] **Keystone spike (ADR-0004):** `wgpu`-rendered GPU texture → Tauri webview at 60fps, using a **trivial gradient shader**. No RAW, no adjustments yet. If this fails, walk the ADR-0004 fallback ladder before proceeding.
2. [ ] Tauri app skeleton, cross-compile & run on Win/Mac/Linux
3. [ ] LibRaw FFI decode of a real Canon/Nikon/Sony RAW → into a GPU texture
4. [ ] One live adjustment (exposure) via a WGSL compute shader, in scene-referred linear float
5. [ ] **CPU fallback adapter** path launches on a machine with no discrete GPU
- **Exit criteria:** gradient-in-webview @60fps proven first; then open a RAW on all 3 OSes and drag exposure at 60fps on a 4000px Proxy; app still launches (degraded) with no GPU.

### Phase 1 — Foundation RAW Editor (no AI) — **internal alpha, not a public launch** (ADR-0005)  ·  ~8–12 wks
**Goal:** a solid, parity-correct foundation to build AI on and dogfood internally. **Not** marketed — public launch is gated on Phase 2 (see ADR-0005), so we don't fight Lightroom head-on without differentiators.
- [ ] **Import:** folder ingest, RAW + JPEG/TIFF/PNG, EXIF, catalog in SQLite
- [ ] **Library:** grid + filmstrip, ratings/flags/color labels, filtering
- [ ] **Develop panel:** WB, exposure, contrast, highlights/shadows/whites/blacks, tone curve, HSL, sharpening, noise reduction, vignette, crop/rotate/straighten
- [ ] **Color management:** scene-referred linear float working space + ICC in/out (ADR-0008)
- [ ] **Edit Recipe** engine + undo/redo; **catalog + sidecar persistence** (ADR-0007)
- [ ] **Presets:** save/apply/manage; **Batch Sync** recipe across selection
- [ ] **Export:** JPEG / PNG / **TIFF-16bit** (DNG deferred to Phase 4 — needs Adobe DNG SDK + license review); resize, sharpen-on-output, ICC embed, filename templates, parallel batch export
- [ ] **Offline license activation** designed in now (ADR-0003) — signed keys, validates offline
- [ ] **Parity CI** golden-image tests (Q14)
- **Exit criteria:** parity-correct RAW develop; cull → develop → Batch Sync → export a 300-image set fully offline; internal alpha cohort dogfooding. (Beating Lightroom is *not* the bar — being a solid AI foundation is.)

### Phase 2 — Local AI (detection & retouch)  ·  ~10–14 wks
**Goal:** the "hours → minutes" magic, all on-device.
- [ ] ONNX Runtime integration + EP routing (CUDA/CoreML/DirectML/Vulkan) + graceful CPU fallback
- [ ] **AI masking:** subject/background/sky auto-masks feeding local adjustments
- [ ] **Background remover/replacer** (BiRefNet/RMBG) + sky replacement
- [ ] **Face/skin pipeline:** detect → parse → skin retouch (texture-preserving), teeth whiten, eye enhance, blemish/stray-hair removal, glasses-glare
- [ ] **AI culling:** blur/exposure/closed-eyes/duplicate detection with sensitivity
- [ ] **Batch AI:** run face/skin retouch across a selection with per-image recognition
- **Exit criteria:** batch-retouch a 50-portrait set locally, natural skin, no cloud, on a mid-range GPU.

### Phase 3 — Hybrid Cloud (generative, optional)  ·  ~8–10 wks
**Goal:** premium generative extras without breaking the offline promise (ADR-0009).
- [ ] Cloud client + auth + **Credit/billing** (only here; separate from local License)
- [ ] Generative gen-fill / object removal (large), outpaint/extend, heavy upscale, old-photo restore, AI color-match
- [ ] **Proxy a 3rd-party GPU inference API behind our backend** (ADR-0009); vendor due-diligence on no-retention/no-training
- [ ] Ephemeral processing (delete-after), explicit per-op "this uploads your image" consent UX
- [ ] **Never** fabricate a subject from scratch (product red line — Evoto "Headshotgate")
- **Exit criteria:** a generative op runs cloud-side, billed transparently via Credits, while the rest of the app stays fully local/offline.

### Phase 4 — Pro Workflow & Polish  ·  ongoing
- [ ] **DNG export** via Adobe DNG SDK (C++ sidecar) + license review (deferred from Phase 1)
- [ ] Tethered capture (Win/Mac), hot-folder auto import/export
- [ ] Lightroom `.lrcat` import + friendlier round-trip
- [ ] PSD export, plugin/preset marketplace, cloud sync (opt-in)
- [ ] Performance: tiling, GPU memory mgmt, caching, multi-GPU

---

## 5. Key Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Engine is Rust/wgpu, team is JS/TS** | High | **Dedicated graphics specialist owns the engine (ADR-0002)**; JS/TS team owns UI/catalog/IPC/product. Mitigate bus-factor via pairing + documented shaders |
| **GPU-texture→webview @60fps may not be achievable** | High | **First Phase-0 spike (ADR-0004)**; fallback ladder defined (native surface → zero-copy interop → native UI). Fail cheap, early |
| **AI model licensing (non-commercial weights in a paid app)** | High | **Commercial-license allowlist (ADR-0006)** + `MODELS.md` register; default-deny; BiRefNet/Real-ESRGAN chosen; clearance pass before Phase 2 |
| **RAW engine breadth** (new cameras, color accuracy) | High | Stand on **LibRaw** (industry standard, huge camera coverage) rather than rolling our own demosaic initially |
| **Phase-1 competes with Lightroom without differentiators** | High | **Phase 1 is internal alpha; public launch gated on Phase 2 (ADR-0005)** |
| **"Lightweight" broken on integrated/weak GPUs** | Medium | **CPU fallback adapter is the min-spec floor**; app launches + edits (degraded) with no discrete GPU; only AI gated on real GPU |
| **Preview≠Export parity drift** | Medium | Single pipeline (ADR-0001) + **golden-image parity CI (Q14)** |
| **DNG export scope/licensing** | Medium | **Deferred to Phase 4**; TIFF-16bit covers round-trip in MVP; Adobe DNG SDK + license review done deliberately |
| **Retrofitting licensing into a shipped "no-login" app** | Medium | **Offline-validating license designed in Phase 1 (ADR-0003)** |
| **Cloud generative privacy backlash ("Headshotgate")** | Medium | **Explicit ephemeral contract + per-op consent + no-fabricated-subjects (ADR-0009)** |
| **Color accuracy / ICC correctness** | Medium | `lcms2`; scene-referred linear float working space (ADR-0008); test against known targets |

---

## 6. Effort & Sequencing Summary

| Phase | Focus | Rough duration | Ships value? |
|---|---|---|---|
| 0 | De-risk spikes | 2–3 wks | Internal confidence |
| 1 | RAW editor MVP | 8–12 wks | **Yes — usable product** |
| 2 | Local AI | 10–14 wks | **Yes — core differentiator** |
| 3 | Hybrid cloud generative | 8–10 wks | Premium upsell |
| 4 | Pro workflow/polish | ongoing | Retention |

> Total to a competitive local-AI product (Phases 0–2): **more than 5–7 months is plausible** unless Phase 0 de-risks cleanly and the team includes at least two engine-capable contributors. Treat the original 5–7 month estimate as optimistic, not a planning commitment.

---

## 7. Immediate Next Steps
1. **Approve this architecture + the ADRs** in `docs/adr/` (they are the binding decisions).
2. **Staff the engine with two engine-capable contributors** (one owner + one backup/peer) — not a single point of failure; this gates Phase 0.
3. **Phase 0 keystone spike (ADR-0004)** — prove `wgpu`-texture→viewport viability with progressively harder checks: trivial shader → RAW-sized frame throughput → zoom/pan → overlay interaction → color-managed display → sustained 60fps, on all 3 OSes, *before* anything else.
4. **AI model license-clearance pass (ADR-0006)** — finalize `MODELS.md` before Phase 2 begins.
5. Define and document the **fallback viewport architecture** if Tauri-webview compositing fails (native child surface → shared-texture interop → native UI fallback).
6. Lock the **Phase 1 develop-panel feature list** (which adjustments ship in the internal alpha).

---

## 8. Decision Records & Domain Model
- **ADRs:** `docs/adr/0001`–`0009` — the binding, hard-to-reverse decisions. This doc is the overview; ADRs win on conflict.
- **Glossary:** `CONTEXT.md` — ubiquitous language (Edit Recipe, Pipeline, Parity, Proxy, Recognition, Generative, License, Credit, Working Space, Sidecar…).
- **Model register:** `MODELS.md` — per-model license clearance (ADR-0006).
