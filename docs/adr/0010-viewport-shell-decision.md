# 0010 — Viewport shell decision remains provisional pending cross-OS proof

**Status:** accepted

Tauri remains the preferred internal-alpha shell candidate, but the project does **not**
lock Tauri as the viewport shell yet. The ADR-0004 gate ladder now has native Pipeline
frame provenance and native-frame-tied webview measurements, but Task 3.3 requires proof
runs on Windows, macOS, and Linux before the shell decision may be locked.

**Evidence recorded:** `.scratch/photogenic-foundation/verification/viewport-linux.json`,
`.scratch/photogenic-foundation/verification/viewport-macos.json`, and
`.scratch/photogenic-foundation/verification/viewport-windows.json`.

The Linux artifact shows Rust/Cargo are present in this workspace, but the Tauri CLI
preflight and bounded `npm run tauri:dev` run did not produce an interactive viewport
proof report. The macOS and Windows artifacts are explicit not-run records because this
workspace is Linux. None of these artifacts prove all ADR-0004 gates on their target OS.

**Decision:** keep Tauri as the candidate path and keep the shell decision provisional.
Do not activate the fallback ladder from missing evidence alone. Activate ADR-0004's
fallback ladder only when a target OS produces a real hard-gate failure after running
the current viewport proof harness.

**Why:** Treating unavailable OS evidence as a pass would lock the shell on weak proof.
Treating unavailable OS evidence as a hard failure would prematurely pivot away from the
preferred shell without measuring it. The honest state is provisional: continue Tauri
proof capture, and only pivot on measured failure.

**Consequences:**
- Tauri-specific development may continue only where it preserves the fallback ladder.
- Internal-alpha planning must still account for a possible native-surface or native-UI
  fallback until all target OS proof reports pass.
- Before Task 3.3 can be considered fully closed, the not-run macOS/Windows artifacts
  and the inconclusive Linux artifact must be replaced by real viewport proof reports.
- README should not claim the Tauri shell is locked for internal alpha yet.
