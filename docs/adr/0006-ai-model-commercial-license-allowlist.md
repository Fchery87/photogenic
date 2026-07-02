# 0006 — AI models require a verified commercial-use license (allowlist gate)

**Status:** accepted

No AI model ships in the product without a recorded, verified license that permits
**commercial** use (MIT / BSD / Apache-2.0, or a paid commercial grant). Every model is
tracked in `MODELS.md` with its source, license, and clearance status. A model with a
non-commercial / research-only clause is **banned from the build** until relicensed,
replaced, or retrained.

**Why:** The product is a **paid** app (ADR-0003). Several popular open weights are
non-commercial and would make the app legally unshippable if included silently:
- Permissive / OK: BiRefNet (MIT), Real-ESRGAN (BSD-3), RetinaFace & MediaPipe (Apache).
- Restricted / NOT OK as-is: RMBG-1.4/2.0 (BRIA — non-commercial without a paid license),
  GFPGAN / CodeFormer (contain non-commercial / NVIDIA-derived restrictions in parts),
  BiSeNet face-parsing (license varies by weights repo — must verify provenance).

**Decisions forced by this gate:**
- Matting uses **BiRefNet (MIT)**, not RMBG.
- Face restoration uses Apache/MIT weights, or we **train/fine-tune our own** on licensed
  data (never on user images — see privacy stance).
- BiSeNet weights must have provenance verified before use.

**Consequences:**
- A dedicated license-clearance research pass runs **before** Phase 2 begins.
- `MODELS.md` is a required, maintained artifact; CI/release checklist references it.
