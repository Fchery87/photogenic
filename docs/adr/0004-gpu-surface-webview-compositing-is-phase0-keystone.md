# 0004 — GPU-texture → webview compositing is the Phase-0 keystone spike

**Status:** accepted

The very first thing Phase 0 must prove is that the chosen shell can support a
professional editor viewport driven by a `wgpu`-rendered GPU texture. The proof starts
with a trivial gradient shader inside the Tauri webview, but does **not** stop there:
it must then prove RAW-sized frame throughput, zoom/pan, overlay interaction,
color-managed display, and sustained 60fps — **before** RAW decode/adjustment work is
allowed to lock the shell decision. Everything in ADR-0001 rests on this path existing
and being fast.

**Why:** Tauri renders a web UI, but our authoritative Pipeline (ADR-0001) outputs a
GPU texture from Rust/`wgpu`. Getting that texture on screen at 60fps means either
compositing a native GPU surface with the webview, or moving frames into the page
(WebGPU/canvas) without a per-frame copy stall. This boundary is under-documented and
is the highest-novelty risk in the stack. If it can't hit 60fps, the rendering model
must change — so it is tested first, in isolation.

**Fallback ladder if the primary path fails:**
1. Native `wgpu` child window/surface positioned under a transparent webview region.
2. Shared-texture / zero-copy interop (platform-specific) into a WebGPU canvas.
3. Render UI natively (egui/native) instead of webview — last resort, large pivot.

**Interpretation rule:** a trivial gradient passing is **necessary but not sufficient**.
Do not treat it as "rendering solved" until the later viewport checks pass too.

**Current decision record:** ADR-0010 records the first post-native-frame shell decision
checkpoint. As of 2026-07-09, the Tauri path remains the preferred candidate but is not
locked because the required Windows/macOS/Linux viewport proof reports are incomplete.
Missing cross-platform proof is not a fallback trigger by itself; a hard gate failure on
a target OS activates this ADR's fallback ladder.

**Consequences:**
- Phase 0's exit criteria are reordered: gradient-in-webview @60fps → LibRaw FFI decode
  → adjustment shaders → cross-OS check. (Updates ARCHITECTURE.md §4 Phase 0.)
- A negative result here is a *good* early outcome: it invalidates cheaply.
