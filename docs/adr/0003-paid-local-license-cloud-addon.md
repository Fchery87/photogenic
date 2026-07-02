# 0003 — Paid local license; cloud generative is a separate metered add-on

**Status:** accepted

The local editor is a **paid product** (perpetual or annual license). "Unlimited
exports" means no per-image credit metering — it does **not** mean free. Optional
cloud **Generative** features are billed separately (metered).

**Why:** Phases 0–2 produce an unlimited, offline, local app with no built-in revenue
mechanism; cloud billing doesn't arrive until Phase 3. A paid license funds the 5–7
month build while still attacking Evoto's most-hated trait — per-export credits — by
offering predictable, non-metered pricing for local work.

**Consequences:**
- **Offline-friendly license activation must be designed in Phase 1**, not bolted on
  later. The core promise is "works offline, no cloud dependency," so licensing must
  validate without a mandatory server round-trip (signed offline license keys, periodic
  online re-check at most). Retrofitting entitlement into a shipped "no login" app is
  costly.
- Two entitlement surfaces to reconcile: local license (owns the app) vs cloud credits
  (owns Generative). Keep them cleanly separated.
- Marketing must be precise: "unlimited, no credits" ≠ "free."
