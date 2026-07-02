# Photogenic — Domain Language

Glossary for the cross-platform AI photo editor. Terms specific to this product's
domain. Definitions describe what a concept *is*, not how it's implemented.

## Editing model

**Edit Recipe**:
The ordered, non-destructive list of operations that transforms a source image into its edited result. The source file is never mutated; the recipe is applied on render and export.
_Avoid_: edit stack, edit history, operations list

**Pipeline**:
The single authoritative sequence of image-processing stages that applies an Edit Recipe to pixels. One implementation serves both preview and export.
_Avoid_: render chain, processing graph

**Preview**:
The on-screen result of running the Pipeline at reduced (proxy) resolution for interactive speed.
_Avoid_: thumbnail (a Thumbnail is smaller and non-editable), render

**Proxy**:
A cached, reduced-resolution (~4000px) copy of a source image used for fast culling and editing. The full-resolution source is read only at export.
_Avoid_: smart preview, cache image

**Sidecar**:
An optional per-image file stored next to the original that holds a portable copy of its Edit Recipe. The catalog remains the source of truth.
_Avoid_: XMP (that is one possible sidecar format, not the concept)

**Working Space**:
The internal color space the Pipeline computes in: scene-referred, linear-light, 32-bit float, wide gamut. The display/output transform is applied only at the end.
_Avoid_: color profile (an ICC profile is applied into/out of the Working Space, it is not the Working Space)

**Parity**:
The guarantee that Preview and Export produce pixel-identical results (differing only in resolution), because both run the same Pipeline.

## Workflow

**Cull**:
The act of selecting keepers from a shoot by rating, flagging, or rejecting images before editing.
_Avoid_: filter, curate

**Batch Sync**:
Copying an Edit Recipe (or a chosen subset of its operations) from one image to many selected images.
_Avoid_: paste settings, propagate

**Preset**:
A saved, source-independent Edit Recipe that can be applied to any image.
_Avoid_: profile, filter, template

## AI

**Recognition**:
Local, on-device AI that detects and segments real content in a photo (faces, skin, subject, sky) to drive adjustments and retouching. Runs offline.
_Avoid_: detection model, local AI (too vague)

**Generative**:
Cloud AI that synthesizes new pixels (gen-fill, outpaint, heavy upscale). Opt-in, metered, and ephemeral. Never fabricates a subject from scratch.
_Avoid_: gen AI, AI Lab

## Commercial

**License**:
The paid entitlement to run the local editor. Validates offline (no mandatory server round-trip). Grants unlimited, non-metered local editing and export.
_Avoid_: subscription (a License may be perpetual or annual), account

**Credit**:
The unit consumed by a cloud Generative operation. Separate from the License; only Generative features consume Credits.
_Avoid_: token, point

**Unlimited**:
No per-image or per-export metering for local editing. Distinct from "free" — the License is paid.
_Avoid_: free (they are not the same)
