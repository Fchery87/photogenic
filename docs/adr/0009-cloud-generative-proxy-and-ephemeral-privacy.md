# 0009 — Cloud Generative: proxy a third-party GPU API, with an explicit ephemeral privacy contract

**Status:** accepted

Cloud **Generative** features (Phase 3) initially **proxy a third-party GPU inference
API behind our own backend**, rather than self-hosting models. The privacy guarantee is
explicit and enforced both contractually and technically: **no training on user images,
delete-after-processing, no third-party retention.** Every generative operation requires
explicit per-op "this uploads your image" consent in the UI. Self-hosting is deferred
until volume/margins justify the capital cost.

**Why:** Self-hosting diffusion-class GPUs at Phase 3 is capital-heavy and premature.
Proxying gets Generative to market fast. But this market punishes fuzzy data handling —
Evoto's "Headshotgate" (a from-scratch AI headshot generator + ambiguous training-data
FAQ) caused a public backlash and product withdrawal. So even when proxying, the data
contract must be explicit, auditable, and consent-gated. Generative also **never
fabricates a subject from scratch** (product red line).

**Considered and rejected (for now):**
- *Self-host generative models from day one* — better margins/control eventually, but
  too much capex and ops burden to justify at launch of Phase 3.

**Consequences:**
- Vendor due-diligence required: the proxied provider must contractually honor
  no-retention / no-training. Prefer providers who support zero-retention modes.
- Local **License** (ADR-0003) and cloud **Credit** entitlements stay separate.
- Revisit self-hosting when generative volume makes it economical.
