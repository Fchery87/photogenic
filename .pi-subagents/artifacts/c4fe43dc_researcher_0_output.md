I have comprehensive coverage across all six areas, plus resolved a critical local-vs-cloud conflict. Here are the findings.

---

# Evoto.ai — Competitive Teardown (Research Artifact)

**Vendor:** Truesight Technology Inc. (California-based) [VERIFIED — inkl/Digital Camera World review: https://www.inkl.com/news/evoto-ai-review-a-portrait-retouching-speed-demon-with-a-pay-as-you-go-model]
**Current desktop version at research date:** Stable 7.0.5 / 7.1 highlights published; 6.x was the "full Lightroom-alternative" leap (Oct 2025). [VERIFIED — https://www.evoto.ai/download/previous, https://support.evoto.ai/evoto-desktop-7-1-updates/, https://www.behindtheshutter.com/evoto-6-review-all-the-new-ai-editing-features-you-need-to-know/]

> **⚠️ Most important finding for a build decision (a genuine source conflict, resolved below):** Evoto is NOT purely local. The **Desktop app** processes locally on GPU; the **Web Editor and "AI Lab" generative features** upload to cloud servers. Evoto's own homepage says *"Most Evoto features require images to be uploaded to our cloud servers for analysis and processing."* See §3.

---

## 1. FULL FEATURE LIST (grouped by category)

Evoto markets **"100+ AI Tools."** [VERIFIED — https://www.evoto.ai/ai-photo-editor] The feature index groups them as Portrait (39 tools), Background (17), Color Adjustment, Clothing Adjustment, Editing Toolkit, Pet Retouching. [VERIFIED — https://www.evoto.ai/features]

### Portrait Retouching (39 tools)
[VERIFIED — https://www.evoto.ai/features/portrait-retouching]
- **AI Skin Retouching** — removes blemishes, facial spots, acne, pimples, dark circles; preserves natural pore texture ("Invisible Retouching")
- **Skin Tone Correction / Skin Tone Changer**, oily-skin glare reduction
- **Advanced Face Contouring** — reshape lips, jawline, face slimming ("Slim Face")
- **Eye enhancement** — adjust eye shape, sharpen, add catchlights, reduce red veins; **Red Eye Remover**
- **Glasses Glare Remover** (repeatedly cited by reviewers as a standout)
- **AI Open Eyes** (opens closed eyes) and **Smile Generation** (fix awkward expressions) [VERIFIED — https://blog.evoto.ai/all-in-one-photo-workflow-end-photographer-burnout/]
- **Hair Color Changer**, **Stray Hair Remover** (flyaway removal)
- **Makeup** — AI makeup editor, makeup presets, natural→full makeover
- **Teeth Fixer** (whitening/straightening)
- **AI Tattoo Remover**, **AI Skin Tone Changer**
- **Body Editor / AI Liquify** — full body reshape

### Background & Scene (17 tools)
[VERIFIED — https://www.evoto.ai/features, https://blog.evoto.ai/image-editor-with-background/]
- **AI Background Remover** (pixel-perfect masking incl. complex hair), **Background Replacer**, **Background Generator**
- **AI Sky Changer / Sky Replacement** — 100+ sky materials (blue/sunset/starry), Tint slider, blur/opacity, cloud position control [VERIFIED — https://www.evoto.ai/features/sky-replacement]
- **AI Studio Backdrop** — classic B&W, fabric textures, gradients, solid colors, custom upload
- **AI Shadow Maker** (Soft/Hard/Drop presets), **Green-screen Remove Spill**
- **AI Background Blur**, **Background Color Changer**, **Clean Background/Solid Backdrop**, **Background Distraction Removal**, **Color Banding Removal**, **AI People Remover**, object edge refinement

### Color / Grading
[VERIFIED — https://blog.evoto.ai/photo-workflow/, https://support.evoto.ai/feature-page-pricing-faqs/]
- **AI Color Match** (reference-image color transfer), **AI Color Looks**, **AI Color Consistency** (unify tones across a set), **Camera Profile Matching**, presets/LUT-style looks, basic color adjustments (exposure/tone/color panels — Lightroom-familiar)

### Editing Toolkit / Enhance & Restore
[VERIFIED — https://support.evoto.ai/feature-page-pricing-faqs/, https://support.evoto.ai/ai-lab/]
- **AI Object Remover**, **AI Image Denoiser** (native RAW demosaic + denoise), **AI Photo Sharpener**, **Add Grain / Film Grain**, **AI Photo Enhancer (upscaler)** 2K/4K, **AI Image Extender** (outpainting), **AI Old Photo Restoration**, **AI B&W Colorize**, **RAW Converter**, **AI Image Cropper**, auto vertical-line/perspective correction (v6)

### Clothing & Pet
[VERIFIED — https://support.evoto.ai/feature-page-pricing-faqs/]
- Clothes Wrinkle Remover, Lint Remover, Clothes Color Changer, Outfit Extractor; Pet Leash Remover, Stray Fur Remover

### Workflow features (not "AI tools" but core)
[VERIFIED — https://www.behindtheshutter.com/..., https://support.evoto.ai/auto-import-and-export/]
- **AI Culling** (Smart Culling: blur, closed/red eyes, over/under-exposure, duplicates; sensitivity sliders, auto-tag/rating/flag)
- **Tethered Shooting** (wired + wireless; Win/Mac/iPadOS)
- **Batch Edits / Sync presets / Smart Presets**
- **Auto Import & Export (hot folders)**
- **Masking** (AI Masking Editor), **Cloud Sync**

**⚠️ Removed feature:** AI **Headshot Generator** (generative from-scratch) — permanently pulled Jan 2026 after backlash (§5).

---

## 2. WORKFLOW (end-to-end) & FORMATS

**Pipeline** [VERIFIED — https://blog.evoto.ai/workflow-for-photographers-gregory-k/, https://blog.evoto.ai/wedding-photography-workflow-customer-story/]:
1. **Ingest** — tethered capture (JPEG for speed / RAW for latitude) OR drag folder OR import Lightroom `.lrcat` catalog.
2. **Cull** — Library/Grid view; manual star/color labels + **Smart Culling** AI pass.
3. **Hero edit** → **Sync/Batch** — build one edit, sync chosen categories (retouch/color/cleanup) across matching images; or apply saved preset to whole batch without waiting for full render.
4. **Face detection → retouch** — auto face/body recognition (all ages/genders, works in 20-person group shots per reviewers).
5. **Export** — Quick or Custom export; back to Lightroom catalog, or to folder; sync to **Evoto Instant** for client delivery/sales.

Vendor claims **12hrs→2hrs** wedding workflow; **78% faster editing / 64% faster batch**. [VENDOR CLAIM — https://blog.evoto.ai/wedding-photography-workflow-customer-story/, https://shotkit.com/evoto-ai-review/]

**Import formats:** JPEG, TIFF, PNG, most camera **RAW** (proprietary RAW engine, no resolution reduction), **Lightroom `.lrcat` catalogs**. [VERIFIED — https://support.evoto.ai/how-to-use-import-export/]
**Export formats:** JPEG, PNG (with alpha/transparency), TIFF; back to `.lrcat`. **Note: RAW exports are flattened to JPEG** (not RAW/DNG out); transparent-background outputs → PNG. [VERIFIED — same]
**Gaps for a competitor:** No **DNG** or **PSD** export mentioned anywhere; no direct rendered-file sync back into Lightroom (reviewers confirm this friction). [VERIFIED — https://maketecheasier.com/evoto-ai-review/]

---

## 3. TECH / SYSTEM

**OS supported** [VERIFIED — https://support.evoto.ai/getting-started/, https://help.evoto.ai/product-tour/about-evoto]:
- Windows 7 x64, Windows 10 x64, Windows 11 x64
- macOS 10.13+ (Mac 2015 or later, Intel or Apple Silicon)
- iPadOS (tethering + iPad app); mobile app exists
- **No Linux.** (Not listed anywhere — a clear gap.)

**Minimum specs:** 64-bit x64 CPU ≥1.2 GHz; **8 GB RAM (Windows hard-requires ≥8 GB; Mac not restricted).** [VERIFIED — https://support.evoto.ai/getting-started/, https://support.evoto.ai/how-to-use-setting/]
**Recommended:** Mac mini 32 GB RAM + 1 TB SSD; Windows with **NVIDIA RTX 4060 Ti 16 GB** class GPU. [VERIFIED — https://support.evoto.ai/getting-started/]
**GPU support list (VERIFIED — same page):**
- NVIDIA GeForce GTX 10/16 series, RTX 20/30/40/**50** series, plus T-series, Quadro RTX, Titan, Tesla P4
- **AMD Radeon** RX 580, 5000/6000/7000 series
- Apple Silicon GPUs (Metal, implied) — "Apple Silicon and modern Nvidia GPUs deliver near-real-time results" [VERIFIED — https://whatif-ai.com/tools/evoto-ai]

**Local vs Cloud — the critical, conflicting picture:**
- **Desktop app = local GPU processing.** Evoto's own official statement (during controversy): *"Evoto Desktop, our core product, runs and processes all images locally on your computer."* [VERIFIED — PetaPixel: https://petapixel.com/2026/01/15/evoto-alienated-photographers-by-releasing-a-tool-designed-to-replace-them/] Reviewers concur images "never leave the machine." [VERIFIED — https://whatif-ai.com/tools/evoto-ai]
- **BUT the homepage/web editor = cloud.** *"Most Evoto features require images to be uploaded to our cloud servers for analysis and processing. However, your data is not stored — all images are deleted immediately once processing is complete."* [VERIFIED — https://www.evoto.ai/ and https://www.evoto.ai/?_uuid=...]
- **AI Lab (generative) features are cloud/compute-billed** — People Remover, Image Extender, Clothes Color Changer, Old Photo Restoration, B&W Colorize, Photo Enhancer bill per "Generate" action. [VERIFIED — https://support.evoto.ai/feature-page-pricing-faqs/, https://support.evoto.ai/ai-lab/]
- Cloud features requiring upload+storage (with consent): Cloud Sync/Storage, **AI Color Match**, ID-Photo cropping. [VERIFIED — https://www.evoto.ai/]

**[INFERRED, high confidence]:** The desktop app runs the deterministic "AI Recognition" pipeline (detection/segmentation/retouch) locally on CUDA/Metal/likely DirectML-or-ROCm for AMD; the newer **generative "AI Lab"** tools call cloud APIs (Evoto admitted the pulled Headshot Generator "was powered by a third-party API generative system"). [Basis: PetaPixel statement + AI Lab per-generation billing.] **This split is the single most important architectural takeaway for a competitor: local detection/retouch is feasible on-device; generative gen-fill likely needs cloud/GPU-server or a bundled diffusion model.**

**Smart Preview:** cloud projects generate 4000px previews (<2 MB) for fast culling; originals downloaded only on export. [VERIFIED — https://support.evoto.ai/cloud-space/]
**Offline capability [INFERRED]:** Local desktop editing/retouch/RAW works offline; culling too. AI Lab generative + cloud sync + AI Color Match require connectivity. Login/license validation is online. Not explicitly documented as "offline mode."

---

## 4. PRICING & BUSINESS MODEL

**Model:** Credit-based. **1 credit ≈ 1 exported edited image** (watermark-free). Editing/previewing is free; unedited exports are free; re-exporting the same edited image = charged once. [VERIFIED — https://support.evoto.ai/credit/, https://help.evoto.ai/product-tour/credits-purchase-and-packages/credits]

**Free trial:** Up to **15 free credits** for completing profile (some sources cite 30 via referral). [VERIFIED — https://support.evoto.ai/credit/, https://www.simonsonghurst.com/evoto-ai-review]

**Two purchase paths** [VERIFIED — https://news.evoto.ai/evoto-price-announce-en, https://support.evoto.ai/pay-as-you-go-package/]:

*Annual Subscription (billed yearly; credits roll over up to 5× while subscribed):*
| Plan | Credits | Price | Devices |
|---|---|---|---|
| Starter | 800 | **$89** | 1–2 |
| Basic | 1,600 | **$149** | 2–3 |
| Basic Plus (popular) | 3,600 | **$269** (also cited $242) | 4 |
| Standard | 9,000 | — (adds dedicated acct mgr) | 5 |
| Standard Plus | 24,000 | — (adds 1:1 onboarding) | 6 |
[VERIFIED prices — https://support.evoto.ai/understanding-evoto-credits-and-pricing/; $242/Basic-Plus & $0.08/credit — https://alternatives.co/software/evoto-ai/pricing/. **Price variance across sources noted — treat as approximate/changing.**]

*Pay-As-You-Go (no subscription):* 200 / 500 / 1,200 / 3,600 credit packs; **valid 2 years**, no rollover, 2 devices. [VERIFIED — https://support.evoto.ai/pay-as-you-go-package/]
*Enterprise:* ≥75,000 images/yr, custom. [VERIFIED — https://news.evoto.ai/evoto-price-announce-en]

**Credit-Free Features** (paid-plan users): certain Color Adjustments, Manual Tools, Crop & Rotate export free; Background Remover/Replacer free; Object Remover free. [VERIFIED — https://support.evoto.ai/how-can-i-use-credit-free-exports/, https://support.evoto.ai/feature-page-pricing-faqs/]
**Web editor billing:** AI Recognition = 1 credit per Max-quality export (low-quality free); AI Lab = per-generation (0.1–5 credits). [VERIFIED — https://support.evoto.ai/feature-page-pricing-faqs/, https://support.evoto.ai/ai-lab/]

---

## 5. STRENGTHS & WEAKNESSES (from reviews)

**Strengths (VERIFIED across multiple reviewers):**
- **Speed on high-volume portrait/wedding batches** — "hours→minutes"; handles hundreds–thousands without breaking. [https://shotkit.com/evoto-ai-for-high-volume-portrait-and-wedding-studios/]
- **Natural skin results** preserving pore texture; "no indication AI altered the image." [https://basic-tutorials.com/reviews/software-reviews/evoto-ai-review/]
- **Accurate face/body detection** even in 20-person group shots. [https://maketecheasier.com/evoto-ai-review/]
- **Sky replacement + backdrop** praised (clean hair edges). [same]
- **Glasses-glare & stray-hair removal** singled out as time-savers. [https://www.evoto.ai/features]
- **AI Culling ~95% accurate** out of the gate. [https://www.behindtheshutter.com/...]
- **Low learning curve** (Lightroom-style sliders); Lightroom-catalog import.
- **Fstoppers head-to-head:** Evoto beats Retouch4me on quality/potential/blemish results. [https://fstoppers.com/reviews/evoto-vs-retouch4me-one-better-other-683858]

**Weaknesses / complaints (VERIFIED):**
- **Credit economics punish whole-gallery retouchers.** Fstoppers: retouching every image could "eat through $500 of credits in about four weddings" — Retouch4me plugins cheaper for that use. [https://fstoppers.com/reviews/evoto-vs-retouch4me-one-better-other-683858]
- **Not for high-end/fine-art finishing** — pros still finish hero shots manually in Photoshop. [multiple: simonsonghurst, janakukebal, declom]
- **Face detection fails** on extreme close-ups / faces not fully visible; weak for product/high-end skin-texture & product retouching. [https://www.janakukebal.com/blog/evoto-ai-review-workflow-retouching]
- **Over-editing easy** if presets not dialed back; some digital makeup looks unnatural. [https://maketecheasier.com/evoto-ai-review/]
- **No direct rendered-file sync back to Lightroom** (TIFF round-trip workaround). [same]
- **Desktop-centric**; per one reviewer "no iPad/mobile" (though vendor now markets iPad/mobile — verify). [https://whatif-ai.com/tools/evoto-ai]
- **Requires modern GPU** for good performance. [same]
- **"Headshotgate" trust damage** — see below.

**Controversy (VERIFIED — reputation risk to learn from):** At Imaging USA (Jan 2026) Evoto launched a web **AI Headshot Generator** creating headshots from scratch → photographer backlash → public apology, permanent removal. Evoto claimed it "was powered by a third-party API generative system," was an SEO page, and that FAQ text implying training on user photos was "included in error." Ironclad promise: never trains on customer images; training data from licensed/commissioned imagery only. [https://petapixel.com/2026/01/15/..., https://news.evoto.ai/official-statement-hg0113, https://fstoppers.com/software/did-evoto-betray-photographers-their-new-software-721915]

---

## 6. UNDERLYING TECH SIGNALS

**Framework:** **[INFERRED / UNVERIFIED]** No definitive public statement. Evoto ships **native-labeled apps for macOS (separate Intel + Apple Silicon builds) and Windows** with separate binaries per arch [VERIFIED build list — https://www.evoto.ai/download/previous], which is consistent with a **native C++/Qt-style** stack rather than Electron (Electron typically ships universal/single-arch web bundles; heavy real-time GPU RAW editing argues against Electron). Reviewers repeatedly call it a **"native application"** for both OSes [https://declom.com/evoto-ai, https://whatif-ai.com/tools/evoto-ai] — but this is marketing language, not a confirmed toolkit. **To confirm, a competitor should run a tool like `buildby` (https://github.com/wavever/desktop-app-build-by) against the installed .app/.exe** — I could not execute binaries (read-only). **My best inference: native C++ core (likely Qt or custom UI) with a bespoke RAW engine — NOT Electron.**

**GPU acceleration [INFERRED, high confidence]:** Explicit NVIDIA (CUDA), AMD Radeon (DirectML or ROCm/Vulkan on Windows), and Apple Silicon (Metal) GPU support lists → multi-backend GPU inference. [Basis: GPU support list https://support.evoto.ai/getting-started/]

**AI models [INFERRED]:** Proprietary detection/segmentation/retouch models run locally ("AI Recognition"); **generative "AI Lab" features appear to call cloud/third-party generative APIs** (Evoto admitted the Headshot Generator used a "third-party API generative system"). Training data: licensed + commissioned photography (per Evoto). [https://support.evoto.ai/ai-lab/, PetaPixel, https://www.evoto.ai/]

**RAW engine:** Evoto states it built its **own advanced RAW engine** (demosaic + denoise), regularly updated for new cameras — a significant build cost for a competitor. [VERIFIED — https://support.evoto.ai/how-to-use-import-export/, https://blog.evoto.ai/wedding-photography-workflow-customer-story/]

---

## Key takeaways for a competing cross-platform desktop build
1. **Local-first detection/retouch is the moat & the privacy selling point** — but Evoto quietly leans on cloud for generative + color-match. A truly all-local competitor (incl. gen-fill) would be a differentiator, esp. on **Linux** (Evoto has none).
2. **A custom RAW engine is table stakes** and expensive; consider LibRaw/rawpy + custom demosaic.
3. **Credit metering is the most-hated part** — a flat/subscription or unlimited-local-export model directly attacks Evoto's biggest complaint (whole-gallery cost).
4. **Multi-arch native GPU (CUDA/Metal/DirectML/ROCm)** is required to match performance; Electron likely insufficient for real-time RAW.
5. **Avoid "replace the photographer" generative features** — the Headshot Generator backlash shows the target market's red line.

---