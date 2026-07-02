# 0007 — Edit Recipe lives in the catalog (source of truth) with optional sidecars

**Status:** accepted

The authoritative **Edit Recipe** is stored in the SQLite **catalog**. The app can also
read/write per-image **sidecar files** (XMP-style, next to the original) for portability
and interop. The original RAW is never modified.

**Why:** The catalog gives fast filtering and **Batch Sync** across large libraries
(10k+ images) — sidecar-only would be slow to query. But catalog-only is fragile:
corruption or loss of the single DB loses all edits, and edits aren't portable between
machines. The hybrid (catalog as source of truth + sidecar export/import) is the
industry-proven pattern (Lightroom does exactly this) and gives disaster recovery.

**Considered and rejected:**
- *Sidecar-only* — portable but too slow for library-wide operations.
- *Catalog-only* — fast but fragile and non-portable.

**Consequences:**
- Need a well-defined, versioned Recipe schema (JSON) shared by catalog and sidecar.
- Conflict rule when both disagree (e.g. sidecar newer than catalog row) must be defined.
- Sidecar format should be documented so power users trust it.
