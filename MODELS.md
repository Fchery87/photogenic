# AI Model License Register

Every AI model shipped or downloaded by the product is tracked here. **Governed by
ADR-0006:** no model enters the build without a verified commercial-use license.

Status legend: ✅ cleared (permissive/commercial) · ⚠️ restricted (do not ship as-is) ·
🔎 provenance unverified · 🔁 replacement chosen.

| Capability | Candidate model | License | Commercial? | Status | Decision |
|---|---|---|---|---|---|
| Matting / background | **BiRefNet** | MIT | Yes | ✅ | **Chosen** for matting |
| Matting / background | RMBG-1.4 / 2.0 (BRIA) | Non-commercial w/o paid license | No (default) | ⚠️ | 🔁 Replaced by BiRefNet |
| Upscale / enhance | **Real-ESRGAN** | BSD-3-Clause | Yes | ✅ | Candidate |
| Face detect + landmarks | **RetinaFace / MediaPipe-class** | Apache-2.0 | Yes | ✅ | Candidate |
| Face restoration | GFPGAN | Non-commercial parts / NVIDIA-derived | No (as-is) | ⚠️ | Find Apache/MIT weights or train own |
| Face restoration | CodeFormer | Non-commercial clause | No (as-is) | ⚠️ | Find Apache/MIT weights or train own |
| Face / skin parsing | BiSeNet face-parsing | Varies by weights repo | Unknown | 🔎 | Verify provenance before use |
| Culling classifiers | (own lightweight CNNs) | Ours | Yes | ✅ | Train on licensed data |

## Rules

1. **Default-deny.** A model is `⚠️` until a specific license + weights source is verified
   as commercial-safe. Only `✅` models may ship.
2. **Record the exact weights source**, not just the architecture — the same model
   architecture often has both permissive and restricted weight releases.
3. **Never train or fine-tune on user images.** Training data is licensed or commissioned
   only (mirrors the market's expectation post-"Headshotgate").
4. A release checklist item verifies this register has no `⚠️`/`🔎` rows in the shipped set.

_This register is a living document; update it whenever a model is added, cleared, or replaced._
