# 0008 — Pipeline works in scene-referred linear 32-bit float, wide gamut

**Status:** accepted

The image **Pipeline** processes in **scene-referred, linear-light, 32-bit float** in a
wide working space (linear Rec.2020 or ACEScg). ICC input transform happens on decode;
the display/output transform (and gamut mapping) happens at the **end** of the pipeline,
via `lcms2`.

**Why:** Editing in display-referred sRGB/8-bit clips highlights and produces the
over-saturated "cheap HDR" look under strong adjustments. Scene-referred linear float is
the modern, physically-correct foundation, preserves highlight latitude, makes exposure
and blending behave correctly, and future-proofs for HDR output. This is a foundational
choice — getting it wrong later is a full pipeline rewrite, so it is decided up front.

**Consequences:**
- Higher memory/compute per pixel (float) — acceptable given the GPU pipeline (ADR-0001).
- All adjustment shaders are authored to operate in linear light, not gamma-encoded.
- A correct output/display transform is mandatory before pixels reach the screen or file.
- Enables wide-gamut and HDR export later without rearchitecting.
