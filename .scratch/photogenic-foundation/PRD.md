# PRD — Photogenic Foundation: Cross-Platform RAW Editor and AI-Ready Engine

Status: ready-for-agent

## Problem Statement

Professional photographers who want a fast, modern, AI-assisted editing workflow are underserved when they need all of the following at once: cross-platform support including Linux, predictable pricing without per-image export Credits, strong privacy with offline-first editing, and a professional editing experience that preserves Preview↔Export Parity. Existing tools either meter exports, omit Linux, depend heavily on cloud processing, or force photographers into fragmented workflows across culling, RAW development, retouching, and export.

The immediate problem for this project is narrower but foundational: there is no implemented product yet, only an architecture and decision record. The team needs a first shippable foundation that proves the chosen Pipeline, validates the viewport strategy, and establishes the Edit Recipe, Catalog, Proxy, License, and Working Space behaviors that every later Recognition and Generative feature will depend on.

## Solution

Build the first foundation of Photogenic as an internal-alpha, offline-first, cross-platform RAW editor with a single authoritative Pipeline in Rust/wgpu, a Tauri-based shell treated as preferred-but-provisional until Phase 0 viewport proof passes, and a non-destructive Edit Recipe model persisted in the Catalog with optional Sidecars.

From the user's perspective, this foundation provides a fast and trustworthy way to import a shoot, Cull it, develop a hero image, Batch Sync edits across a set, and export finished files with predictable results and no per-export metering. It does not yet market itself as a Lightroom replacement or a full Evoto competitor; instead, it establishes the parity-correct, AI-ready engine on which later Recognition features can deliver the real differentiation.

## User Stories

1. As a professional photographer, I want a desktop editor that runs on Windows, macOS, and Linux, so that my workflow is not tied to one operating system.
2. As a Linux photographer, I want a serious photo editor built for my platform, so that I am not excluded from modern professional tooling.
3. As a privacy-conscious photographer, I want local editing to work offline, so that sensitive client images do not need to leave my machine.
4. As a studio owner, I want predictable pricing for local editing and export, so that I am not charged per image I deliver.
5. As a photographer, I want Preview and Export to match, so that I can trust what I see before delivering work to clients.
6. As a portrait photographer, I want a non-destructive workflow, so that I can revise edits without damaging the Source file.
7. As a high-volume event photographer, I want to import an entire shoot quickly, so that I can begin Culling without waiting on slow ingestion.
8. As a wedding photographer, I want a fast Grid and filmstrip experience, so that I can review large sets efficiently.
9. As a photographer, I want Ratings, Flags, and filtering, so that I can narrow a shoot down to keepers.
10. As a photographer, I want to Cull before editing, so that I spend time only on images worth keeping.
11. As a photographer, I want a smooth hero-edit workflow, so that I can perfect one image and reuse those decisions.
12. As a photographer, I want Batch Sync across selected images, so that I can apply one Edit Recipe to a set.
13. As a photographer, I want Presets that are source-independent, so that I can reuse my look across different shoots.
14. As a photographer, I want White Balance controls, so that I can correct color temperature and tint precisely.
15. As a photographer, I want exposure controls, so that I can recover under- or over-exposed images.
16. As a photographer, I want tone controls for highlights, shadows, whites, and blacks, so that I can shape contrast with precision.
17. As a photographer, I want a tone curve, so that I can build nuanced contrast and color moods.
18. As a photographer, I want HSL controls, so that I can fine-tune individual colors.
19. As a photographer, I want sharpening and noise reduction, so that I can improve image quality without leaving the app.
20. As a photographer, I want crop, rotate, and straighten tools, so that I can complete common finishing steps in one place.
21. As a photographer, I want color-managed editing, so that my display and exported files behave predictably.
22. As a photographer, I want a wide-gamut, scene-referred Working Space under the hood, so that strong edits preserve highlight latitude and color quality.
23. As a photographer, I want the app to preserve image quality through a 16-bit TIFF export path, so that I can round-trip into other professional tools if needed.
24. As a photographer, I want JPEG and PNG export, so that I can deliver final images in common formats.
25. As a photographer, I want export sharpening, ICC embedding, and resize controls, so that I can target print, web, and client delivery correctly.
26. As a photographer, I want file naming templates during export, so that I can keep deliveries organized.
27. As a photographer, I want parallel batch export, so that large deliveries finish faster.
28. As a power user, I want the Catalog to persist my edits reliably, so that my work survives across sessions.
29. As a power user, I want optional Sidecars next to originals, so that my Edit Recipe is portable and recoverable outside the Catalog.
30. As a photographer, I want my original RAW files left untouched, so that I always retain the Source file.
31. As a laptop user, I want the app to launch even on weaker integrated GPUs, so that I am not blocked entirely by hardware limits.
32. As a user on weaker hardware, I want degraded-but-working editing rather than a crash, so that I can still use the product.
33. As a user on stronger hardware, I want GPU acceleration, so that interactive editing feels immediate.
34. As a product team member, I want Phase 0 to prove the viewport architecture honestly, so that the team does not build on a false positive.
35. As a product team member, I want the shell decision treated as provisional until the viewport is proven, so that the plan stays honest about risk.
36. As a developer, I want a single authoritative Pipeline for Preview and Export, so that Parity bugs are minimized.
37. As a developer, I want the highest possible testing seam to be the Pipeline boundary, so that most behavior can be verified through one external interface.
38. As a developer, I want Edit Recipe application tested as external behavior, so that tests do not couple to internal shader implementation details.
39. As a developer, I want the viewport proof to include real image-sized frames, so that a trivial gradient is not mistaken for production readiness.
40. As a developer, I want viewport validation to include zoom, pan, overlays, and color-managed display, so that the hard parts are proven early.
41. As a developer, I want golden-image Parity tests, so that Preview↔Export regressions are caught automatically.
42. As a developer, I want the Edit Recipe schema to be stable and versioned, so that Catalog and Sidecar persistence stay compatible over time.
43. As a developer, I want Batch Sync to operate on the highest seam possible, so that synchronization is a recipe-level concern rather than scattered tool-specific logic.
44. As a developer, I want Presets and Batch Sync to share the same Recipe semantics, so that users get consistent results.
45. As a studio team, I want offline License validation, so that the local editor remains usable without a cloud dependency.
46. As a paying customer, I want local editing entitlements to be clearly separate from cloud Credits, so that billing stays understandable.
47. As a future user of Recognition features, I want the foundation to support masks, face-aware adjustments, and culling later, so that the product can grow without rewriting the engine.
48. As a future user of Generative features, I want cloud uploads to be explicit and opt-in, so that I know when images leave my machine.
49. As a future enterprise customer, I want a clear privacy stance now, so that later AI capabilities do not undermine trust.
50. As an engineering lead, I want the first implementation to establish the right seams and contracts, so that later Recognition and Generative work composes cleanly on the same Pipeline.
51. As a QA engineer, I want Proxy behavior to be deterministic, so that cache invalidation and preview behavior can be tested reliably.
52. As a QA engineer, I want the app to behave consistently across Windows, macOS, and Linux, so that platform support is genuine rather than nominal.
53. As a user, I want Proxy generation to happen lazily and not freeze the interface, so that large imports stay responsive.
54. As a user, I want Catalog-backed state to reopen exactly as I left it, so that long editing sessions can span multiple days.
55. As a user, I want my exported image to reflect the exact Edit Recipe I approved in Preview, so that I can deliver with confidence.
56. As a product stakeholder, I want Phase 1 treated as an internal alpha rather than a premature public launch, so that the product reaches the market only once its differentiators exist.
57. As a product stakeholder, I want the project to avoid promising DNG in the foundation phase, so that scope remains honest and achievable.
58. As a product stakeholder, I want Linux positioned as a strategic differentiator but not an assumed free win, so that planning reflects real complexity.
59. As an engineer, I want the engine staffing model to include both an owner and a backup/peer, so that delivery risk is not concentrated in one person.
60. As an engineer, I want fallback viewport architectures documented before implementation begins, so that failure in the preferred shell path does not stall the whole product.
61. As a future portrait retouch user, I want full-quality inspection paths later, so that texture-critical decisions are trustworthy even when Proxies are used broadly.
62. As a maintainer, I want the PRD to align with the glossary and ADRs, so that future implementation uses the same language and honors prior decisions.

## Implementation Decisions

- The first implementation targets the **foundation** of the product, not the complete Evoto-like feature set. It covers the internal-alpha RAW editor and AI-ready engine that later Recognition features will build on.
- The product uses one authoritative **Pipeline** for both Preview and Export. This is the highest-value architectural seam and the primary behavior boundary for implementation and testing.
- The preferred shell is **Tauri**, but it is not treated as irrevocably locked until the viewport proof passes. The implementation must preserve the ability to fall back to a native child surface, shared-texture interop, or a native UI path if needed.
- The first implementation must prove the viewport path progressively: trivial shader, RAW-sized frame throughput, zoom/pan, overlay interaction, color-managed display, and sustained 60fps. A gradient-only result is insufficient.
- The **Edit Recipe** is the authoritative representation of user edits. It must be non-destructive, ordered, source-preserving, and reusable across Presets and Batch Sync.
- The **Catalog** is the source of truth for Edit Recipe persistence. Optional **Sidecars** mirror recipe state for portability and disaster recovery.
- The Source file is never modified.
- The internal **Working Space** is scene-referred, linear-light, 32-bit float, wide gamut. Display and output transforms happen at the end of the Pipeline.
- The first implementation includes import, library navigation, Culling primitives, core develop controls, Presets, Batch Sync, and export.
- The first export contract includes JPEG, PNG, and TIFF-16bit. DNG is explicitly out of scope for this foundation PRD.
- Local editing is covered by an offline-validating **License**. Cloud **Credits** are a separate entitlement surface reserved for future Generative features.
- The implementation must support degraded-but-functional launch behavior on weaker hardware via a CPU fallback path, while preserving GPU acceleration as the preferred performance path.
- The model strategy for future Recognition work must respect the commercial-license allowlist and `MODELS.md`, but the foundation PRD does not require shipping full AI retouch features yet.
- The implementation should establish the minimum module seams needed to keep the codebase coherent:
  - a Pipeline seam that accepts a Source file plus Edit Recipe and yields Preview/Export behavior,
  - a Catalog seam that persists and retrieves Edit Recipes, Presets, Ratings, Flags, and exportable Sidecars,
  - a viewport seam that displays Pipeline output and user interaction overlays without becoming a second image-processing implementation.
- Existing and future features should compose through these seams rather than introducing per-feature pixel pipelines or duplicated persistence behaviors.
- The first release governed by this PRD is an **internal alpha**, not a public launch. Public launch remains gated on later Recognition differentiation.

## Testing Decisions

- A good test verifies **external behavior**, not implementation details. For this product, that means testing what Preview and Export do for a given Source file and Edit Recipe, rather than testing shader internals, storage internals, or UI implementation details.
- The preferred highest seam is the **Pipeline boundary**. Most image-behavior tests should exercise the Pipeline as a black box given an input image and Edit Recipe.
- The next highest seam is the **Catalog persistence boundary**. Tests should verify that saving and reopening an Edit Recipe, Preset, Rating, Flag, or Sidecar preserves expected user-visible behavior.
- The viewport proof should be tested as an integration seam: can the chosen shell display real Pipeline output with the required responsiveness and interaction characteristics?
- Prior art already exists in the architecture and ADR set in the form of **golden-image Parity tests**. The foundation implementation should adopt this as the main regression strategy for image behavior.
- The most valuable tests for the first implementation are:
  - Preview↔Export Parity tests using fixed Source files and fixed Edit Recipes,
  - persistence round-trip tests for Catalog and Sidecars,
  - Batch Sync and Preset application tests at the Edit Recipe seam,
  - viewport validation tests covering real image-sized frames, overlays, zoom/pan, and color-managed output,
  - degraded hardware launch tests for the CPU fallback path,
  - cross-platform smoke tests on Windows, macOS, and Linux.
- Tests should prefer stable fixtures and assertions on externally visible image results, metadata outcomes, and workflow behavior.
- Tests should avoid coupling to WGSL implementation details, intermediate buffers, or private storage layout, except where a very narrow conformance test is required at a boundary.

## Out of Scope

- Full public launch positioning as a Lightroom or Evoto replacement.
- Recognition features such as production-ready skin retouch, face parsing, glasses-glare removal, AI masking, or AI culling.
- Generative cloud features such as gen-fill, outpaint, old-photo restore, or heavy upscale.
- DNG export in the foundation phase.
- Tethered capture, hot-folder automation, PSD export, marketplace features, cloud sync, and multi-GPU polish.
- Final provider choices and operational implementation for cloud Generative infrastructure.
- Full-resolution portrait-retouch inspection design beyond what is required to keep the foundation extensible.

## Further Notes

- This PRD intentionally aligns with the glossary in `CONTEXT.md` and the ADRs already recorded for the project. Those decisions are not reopened here; this PRD translates them into a coherent product increment.
- The biggest implementation risk remains the viewport path. If the preferred Tauri/webview route fails the stricter viewport proof, the fallback architecture must be activated without creating a second image-processing implementation.
- Linux support remains an explicit differentiator, but it must be treated as a real engineering commitment rather than a cheap extra.
- Because this is a foundation PRD, success is measured by architectural honesty, Parity, persistence, and extensibility — not by headline AI features yet.
