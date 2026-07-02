# 0001 — Single Rust/wgpu image pipeline owns all pixel math

**Status:** accepted

The authoritative image-processing Pipeline (every adjustment: white balance,
exposure, curves, HSL, masks, output transform) lives in the Rust core and runs on
GPU via `wgpu` compute shaders (WGSL). The web UI never processes pixels — it sends
edit parameters and blits the resulting texture for display.

**Why:** A professional editor must guarantee Preview↔Export **Parity** (pixel-identical
results at different resolutions). Splitting the pipeline across a web-WebGPU preview
and a separate Rust export path would mean maintaining two implementations of every
adjustment and fighting permanent parity bugs (the Darktable/RawTherapee failure mode).
One pipeline, one language, one source of truth.

**Considered and rejected:**
- *Web-WebGPU preview + Rust export* — fastest for a JS/TS team short-term, but
  guarantees double-maintenance and parity drift.
- *Shared pipeline compiled to native + WASM/WebGPU* — single source of truth, but
  bleeding-edge build tooling and a WASM/WebGPU perf ceiling on large images.

**Consequences:**
- Directly contradicts the original "Rust stays thin" principle — see ADR-0002.
- Requires GPU/graphics expertise on the team (WGSL shader authoring).
- Gives Linux the same pipeline as Win/Mac for free (portable `wgpu`).
