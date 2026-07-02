# 0002 — The Rust/wgpu engine is owned by a dedicated graphics specialist

**Status:** accepted

The image Pipeline and its WGSL shaders (see ADR-0001) are owned by a dedicated
Rust/`wgpu` graphics specialist, **with at least one additional engine-capable backup or
peer on the critical path**. The existing JS/TS team owns the UI, catalog, IPC, cloud
client, and product layer.

**Why:** ADR-0001 makes Rust the deepest, most performance-critical part of the system,
which invalidates the original "Rust stays thin, shielding the JS/TS team" principle.
Rather than pretend the engine is thin, we staff it honestly. Phase 0's bar (a 60fps
GPU RAW pipeline) is too high-risk as a JS/TS team's first Rust project.

**Revised principle:** *The Rust core is owned by a graphics specialist; the app/product
layer stays JS/TS.* (Replaces §1 Design Principle #1 in ARCHITECTURE.md.)

**Consequences:**
- A single specialist is **not** sufficient mitigation for this architecture; minimum safe
  staffing is one owner + one backup/peer who can review, pair, and take over critical
  engine work if needed.
- Hiring/contracting dependency gates Phase 0 start.
- Schedule estimates assuming a lone specialist are too optimistic.
