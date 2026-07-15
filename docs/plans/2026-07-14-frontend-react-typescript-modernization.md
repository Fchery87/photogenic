# Frontend React/TypeScript Correction + Codebase Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use `@superpowers:test-driven-development` for every task and `@superpowers:verification-before-completion` before marking any milestone done.

**Goal:** Bring the shipped UI back in line with the project's own locked architecture decision (React + TypeScript, `ARCHITECTURE.md` lines 45/86), replacing the hand-rolled vanilla-JS editor shell with a typed, componentized frontend — and close the concrete security/reliability/CI gaps found in the same review, without touching ADR-0001's single Rust/wgpu pixel pipeline.

**Binding frontend constraint (owner decision, 2026-07-14):** the frontend MUST be React-based. Two implementations are acceptable — **React + TypeScript (preferred, and what this plan implements)** or React + JavaScript (acceptable fallback only). Vanilla JS — the current `app/main.js` approach — is **not** an acceptable frontend implementation and must be fully replaced by this plan. Any executing agent that considers dropping TypeScript mid-plan may fall back to React + JavaScript only, must record why in the issue tracker, and may not fall back further to vanilla JS under any circumstances.

## Root cause (why React + TypeScript was never implemented)

This was investigated, not assumed. `ARCHITECTURE.md` locks the UI layer as React + TypeScript in the technology table and the system diagram. The original `docs/plans/2026-07-07-photogenic-internal-alpha-remaining-work.md` (Milestone 5, Task 5.1) also explicitly scoped `app/App.jsx or app/App.tsx`. But the issue that actually got implemented, `.scratch/photogenic-foundation/issues/12-internal-alpha-ui.md`, weakened that scope to:

> "Small Tauri-compatible **React/TypeScript or React/JavaScript** app shell."

The implementing agent then shipped a third option that satisfies neither branch: a dependency-free, framework-free `app/main.js` (911 lines of imperative DOM manipulation) plus `app/tauri-bridge.js`. `package-lock.json` has zero packages installed to this day. The issue was still marked `Status: done` and merged (`91befc1 feat: complete Issue 10 — all 6 viewport gates passing, shell decision unlocked` and surrounding commits) without anyone amending `ARCHITECTURE.md` or the original plan to reflect the actual decision. Nothing in the repo's ADR chain (`docs/adr/0001`–`0010`) ever formally re-opened or ratified this change — it's silent drift, not a decision.

This plan corrects that drift explicitly (Milestone 0) and then migrates the shipped UI to match.

## Architecture

- Preserve ADR-0001 and ADR-0002 unchanged: the Rust/wgpu Pipeline remains the only place pixel math happens. React never processes pixels; it sends recipe parameters over the existing Tauri command surface and displays returned frames/artifacts exactly as `app/main.js` does today.
- The JS workflow/seam modules (`src/catalog/*.js`, `src/export/*.js`, etc.) are **Node-side contract layers** — 18 of them import `node:fs`/`node:` APIs and cannot run in the webview. This is why the current `app/main.js` imports nothing from `src/` and talks to the backend exclusively through `bridge.*`. React components keep that exact posture: all backend access goes through the generated typed command bindings (Milestone 2); nothing under `app/` may import from `src/`. The seams stay where they are, exercised by the Node test suite as executable contracts for the Rust commands.
- Migration strategy is strangler-fig, not a rewrite: mount React inside the existing `#app` shell, port one panel at a time behind the existing test suite, and only delete `app/main.js` once every panel it drives has a React equivalent with passing parity tests. `npm test`, `npm run build`, and `cargo test` must stay green after every task in this plan — never merge a broken intermediate state.
- Formalize the Rust↔TypeScript IPC contract with generated bindings (`tauri-specta`) instead of the current hand-maintained string-literal wrapper in `app/tauri-bridge.js`, so a Rust command rename becomes a compile error in the frontend instead of a silent runtime failure.

## Tech Stack (additions)

- **TypeScript 5.x** (strict mode) — first TS in the repo. This is the preferred option per the binding frontend constraint above; if TS adoption hits a genuine blocker, the sanctioned fallback is React + JavaScript (same components, `.jsx` instead of `.tsx`, keeping the generated bindings for editor-level checking via JSDoc) — never vanilla JS.
- **Vite** — dev server + build, replacing `scripts/build.mjs`'s plain file-copy. Officially supported by Tauri's `beforeDevCommand`/`beforeBuildCommand` hooks already present in `src-tauri/tauri.conf.json`.
- **React 19.x** + `react-dom` — per the locked `ARCHITECTURE.md` decision; no other framework substitution.
- **`tauri-specta`** (Rust build-dependency) + its TS exporter — generates typed bindings for every `#[tauri::command]` in `src-tauri/src/lib.rs` directly from the Rust signatures.
- **`@testing-library/react` + `happy-dom`** — component tests, run through the existing `node --test` runner (no Jest/Vitest migration needed; `node:test` works fine with RTL when a DOM is registered globally).
- Explicitly **not** adopting a state-management library (Redux/Zustand/etc.) or a component/UI kit as a default. The app has one window and modest cross-panel state (selected image, active recipe, workspace snapshot) that already has a persistence seam (`src/catalog/workspace-session-*.js`); plain React state + context is sufficient and matches this repo's stated aversion to unnecessary dependencies. Revisit only if a specific task proves it's needed.

## Scope Guardrails

In scope:
- Recording the React/TypeScript decision formally (ADR-0011).
- Introducing the TS + Vite + React toolchain.
- Generating typed Tauri command bindings.
- Migrating every panel currently in `app/main.js`/`app/index.html` to React components with behavior-identical output, verified by new component tests under `test/components/` alongside the existing Node-side seam suite.
- Fixing the concrete security/reliability/CI gaps found during the review (CSP, empty capabilities file, Rust `unwrap()` panics, dropped `Result`, missing lint/clippy gates in CI).
- An accessibility pass on the migrated components (label/for association, aria roles, keyboard nav) since it's far cheaper to build in during the rewrite than retrofit after.

Out of scope (do not do in this plan):
- Any change to pixel math, WGSL shaders, or the native Pipeline (`src-tauri/src/core/**`).
- New product features (AI masking, generative cloud, DNG export) — this is a like-for-like UI migration plus hardening, not Phase 2/3 work.
- Introducing a state-management library, CSS-in-JS, or a component/UI kit unless a specific task in this plan hits a wall without one (if so, stop and write a short ADR before adding the dependency).
- Rewriting the JS workflow/seam layer (`src/catalog`, `src/export`, `src/preview`, `src/licensing`) — these are Node-side modules (they import `node:fs` and cannot run in the webview) and are not consumed by the frontend at all; auditing them is Milestone 6 and deliberately kept separate and last.

## Required Working Rules

- Use `@superpowers:test-driven-development` for every task.
- Use `@superpowers:systematic-debugging` for any failing build/test/IPC-binding issue.
- Use `@superpowers:verification-before-completion` before marking any milestone done.
- Run `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml` after every task — all three must stay green.
- One commit per task after its tests pass. Do not batch multiple panel migrations into one commit.
- Never let `app/main.js` and its React replacement both drive the same DOM element at once — migrate one panel fully (including deleting its old imperative code) before starting the next, so there is never a moment with two sources of truth for the same UI state.
- Every new interactive control must ship with a `label[for]`/`id` pair or an explicit `aria-label` — no exceptions, this is the accessibility gap this plan exists partly to close.
- All frontend code written under this plan is React + TypeScript (`.tsx`/`.ts`). If a genuine TypeScript blocker forces a fallback, the ONLY sanctioned fallback is React + JavaScript (`.jsx`), recorded in the issue tracker with the reason. Writing new vanilla-JS UI code (imperative DOM manipulation outside React) is prohibited — that is the exact drift this plan exists to correct.

---

## Milestone 0: Record The Decision And Stabilize The Baseline

### Task 0.1: Write ADR-0011 Resolving The React/TypeScript Drift

**Files:**
- Create: `docs/adr/0011-frontend-react-typescript-correction.md`
- Modify: `ARCHITECTURE.md` (add a footnote under the ADR table pointing to 0011)
- Modify: `README.md` (correct the "Tauri shell next step" / editor UI bullets to stop describing `app/main.js` as the target state)

**Step 1: Write the ADR**

Content must cover, using the existing ADR format (see `docs/adr/0001-*.md`):
- **Status:** accepted
- **Decision:** the frontend MUST be React-based. React + TypeScript is reaffirmed as the preferred UI layer per the original `ARCHITECTURE.md` table; React + JavaScript is recorded as the only acceptable fallback. Vanilla JS is explicitly not acceptable — the `app/main.js` shell shipped in Issue 12 was an unratified deviation, not a superseding decision. This closes the loophole that caused the drift: Issue 12's "React/TypeScript or React/JavaScript" wording let an implementation ship that satisfied neither, so the ADR must state both the allowed options AND the prohibition.
- **Why:** cite the Issue 12 scope language ("React/TypeScript or React/JavaScript") and note the shipped implementation satisfied neither option, plus the maintainability risk of a growing imperative DOM file with no compile-time IPC contract checking.
- **Consequences:** frontend now has npm dependencies for the first time (Vite/React/TypeScript) — a deliberate, explicit departure from the "dependency-free lint scaffold" philosophy in `scripts/lint.mjs`'s own comment, scoped to `app/` and its build tooling only. Rust and the test harness remain dependency-conscious as before.

**Step 2: Verify**

```bash
npm test
npm run build
```

Expected: No behavior change yet; both pass as before.

**Step 3: Commit**

```bash
git add docs/adr/0011-frontend-react-typescript-correction.md ARCHITECTURE.md README.md
git commit -m "docs: record react/typescript frontend correction (adr-0011)"
```

### Task 0.2: Open The Local Issue Tracker Entries For This Plan

**Files:**
- Create: `.scratch/frontend-modernization/PRD.md`
- Create: `.scratch/frontend-modernization/issues/01-toolchain-foundation.md`
- Create: `.scratch/frontend-modernization/issues/02-typed-ipc-bindings.md`
- Create: `.scratch/frontend-modernization/issues/03-panel-migration.md`
- Create: `.scratch/frontend-modernization/issues/04-accessibility-pass.md`
- Create: `.scratch/frontend-modernization/issues/05-security-hardening.md`
- Create: `.scratch/frontend-modernization/issues/06-ci-dependency-hardening.md`
- Create: `.scratch/frontend-modernization/issues/07-seam-layer-audit.md`

Follow `docs/agents/issue-tracker.md` conventions (`Status:` line, `## Goal` / `## In Scope` / `## Out of Scope` / `## Acceptance Criteria` / `## Verification`). Use `needs-triage` initially, flip to `ready-for-agent` once this plan is approved.

**Step 1: Write PRD + issue stubs, cross-referencing this plan's milestones.**

**Step 2: Verify**

```bash
npm test
```

Expected: unaffected.

**Step 3: Commit**

```bash
git add .scratch/frontend-modernization
git commit -m "docs: open frontend modernization issue tracker"
```

### Task 0.3: Connect A Git Remote (Precondition For All CI-Dependent Work)

**Finding:** this repo has **no git remote** — `docs/agents/issue-tracker.md` records this explicitly (the local-markdown issue tracker exists because of it). `.github/workflows/ci.yml` is committed but has never executed. Every CI-dependent task in this plan — the lint/clippy gates (Task 1.6), the packaging gate (Task 1.7), the binding-diff check (Task 2.2), and Dependabot (Task 5.1) — is inert config until a remote exists.

**Step 1: Ask the user where this repo should live** (GitHub org/repo, visibility). This is a user decision — do not invent one.

**Step 2: Create the remote, push, and confirm the existing CI workflow actually runs** on all three OS runners. Capture the first real run's outcome — it is the baseline Task 1.7 needs before hard-gating packaging.

**Step 3: Update `docs/agents/issue-tracker.md` and `AGENTS.md`** per their own built-in instruction ("Switch to GitHub/GitLab by replacing this file's contents with the corresponding seed") if the team migrates issue tracking too; otherwise record explicitly that the local-markdown tracker remains authoritative.

**Step 4: Commit**

```bash
git add docs/agents AGENTS.md
git commit -m "docs: record git remote and ci activation"
```

If the user chooses to stay remote-less for now, mark the CI verification portions of Tasks 1.6/1.7, Task 2.2's diff-check step, and Task 5.1 as `deferred` in the issue tracker rather than silently skipping them.

---

## Milestone 1: Security & Reliability Hardening (independent of the frontend migration — do this first, it's cheap and depends on nothing else)

### Task 1.1: Lock Down The Webview Content-Security-Policy

**Files:**
- Modify: `src-tauri/tauri.conf.json` (currently `"csp": null` at line 22)

**Step 1: Write a failing check**

Add a small assertion (script or existing smoke test) that fails when `tauri.conf.json`'s `app.security.csp` is `null`.

**Step 2: Set an explicit policy**

Start with:
```json
"csp": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'"
```
Preview rendering needs no `img-src` grant beyond this: `app/main.js:576-591` draws decoded pixels with `ctx.putImageData` from IPC-returned bytes, not from image URLs. Keep `'unsafe-inline'` only for the existing `style="display:none"` attributes in `app/index.html`; tighten once the React migration removes them. Add `asset:`/`https://asset.localhost` only when a real consumer appears (e.g., file thumbnails via `convertFileSrc`).

**Step 3: Verify**

```bash
npm run tauri:build
npm test
```

Expected: App still loads/renders through the webview with the policy in place (no console CSP violations for legitimate local resources).

**Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "fix: set explicit webview content-security-policy"
```

### Task 1.2: Author The Missing Tauri Capabilities File

**Files:**
- Create: `src-tauri/capabilities/default.json` (directory currently exists and is empty; `README.md` line 53 already lists this file as required but it was never committed)

**Step 1: Enumerate every command the webview actually calls**

Cross-reference `app/tauri-bridge.js` (19 wrapped commands) against the 19 registered handlers — 18 `#[tauri::command]`s in `src-tauri/src/lib.rs` plus `catalog::import::import_sources`, all listed in `generate_handler!` at `src-tauri/src/lib.rs:1271`.

**Step 2: Write the capabilities file**

Scope the `main` window capability to exactly those commands plus the `log` plugin, following the Tauri v2 default-deny model. Do not grant `fs`, `shell`, or `dialog` scopes broader than what import/export actually needs.

**Step 3: Verify**

```bash
npm run tauri:dev
```

Expected: every existing bridge call (import, save recipe, export, license check, etc.) still succeeds; any call outside the granted capability set fails loudly, which is the intended fail-safe behavior.

**Step 4: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "fix: scope tauri webview capabilities explicitly"
```

### Task 1.3: Fix The Two Real Production Panic Paths

> **Correction from code review (2026-07-14):** an earlier draft of this task claimed 49 panic-prone `.unwrap()` calls in `catalog/store.rs` and 4 in `licensing/verification.rs`. That was a miscount: every one of those sits inside a `#[cfg(test)]` module (`store.rs`'s test module starts at line 622; `verification.rs`'s at line 127), and the same holds for `core/decode.rs`, `catalog/import.rs`, and `core/cpu_pipeline.rs`. Production store, decode, import, and license-verification code is already `Result`-based. The actual production panic surface is exactly two spots, both in `src-tauri/src/lib.rs`.

**Files:**
- Modify: `src-tauri/src/lib.rs:1253` — `.expect("failed to open catalog database")`: a locked/corrupt/permission-denied catalog DB aborts the process at startup with no user-facing explanation
- Modify: `src-tauri/src/lib.rs:871` — `request.output_format.as_deref().unwrap()` inside the `"tiff-16" | "tiff-8" | "tiff" | "jpeg" | "jpg"` match arm: logically guarded today (those arms only match when `output_format` is `Some`), but one refactor away from a panic

**Step 1: Write failing tests**

- Export-path test: exercise the format-dispatch code and assert the format string comes from a single safe binding rather than a re-unwrapped `Option`.
- DB-open test: point the store at an unopenable path and assert the failure surfaces as a typed error, not a panic.

**Step 2: Implement**

For line 871, bind the matched format once instead of `.unwrap()`-ing inside the arm. For line 1253, decide explicitly: either surface a startup error through Tauri's setup error path (dialog/message naming the DB path), or keep an intentional abort with a user-readable message — record which in the commit message.

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "fix: remove the two production panic paths in lib.rs"
```

### Task 1.4: Add Clippy Guard Lints So Production Code Stays Panic-Free

Production code is already unwrap-free outside the two Task 1.3 sites (see the correction note above). This task keeps it that way mechanically instead of relying on review vigilance.

**Files:**
- Modify: `src-tauri/src/lib.rs` (crate root — add `#![cfg_attr(not(test), warn(clippy::unwrap_used, clippy::expect_used))]`)
- Modify: `src-tauri/src/main.rs` (same attribute)

**Step 1: Add the attribute and run clippy**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

The `cfg_attr(not(test))` gate keeps idiomatic `.unwrap()`s legal inside `#[cfg(test)]` modules while non-test builds enforce the rule on production code. Run this **before** Task 1.3 lands once, to confirm the lint has teeth (it should flag exactly the Task 1.3 sites), and after, to confirm zero findings. Deliberate aborts (e.g., the final `.run().expect(...)` in the Tauri entry point) get an explicit `#[allow(clippy::expect_used)]` with a comment stating why the abort is intentional.

**Step 2: Verify**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

**Step 3: Commit**

```bash
git add src-tauri/src
git commit -m "chore: enforce panic-free production code via clippy lints"
```

### Task 1.5: Stop Silently Dropping The Recipe-Fingerprint Write Result

**Files:**
- Modify: `src-tauri/src/lib.rs` (line ~941 — `encoder.add_text_chunk("RecipeFingerprint", ...)` result is currently discarded, flagged by `cargo check`'s `unused_must_use` warning)

**Step 1: Write a failing test**

Simulate an encoder failure (e.g., inject a broken writer) and assert the export command returns an error rather than silently producing a PNG with missing provenance metadata.

**Step 2: Propagate the error with `?`**

**Step 3: Verify**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml export
```

Expected: the `unused_must_use` warning is gone; provenance-write failures now surface as export errors.

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "fix: propagate recipe-fingerprint write errors instead of dropping them"
```

### Task 1.6: Wire `npm run lint` And `cargo clippy` Into CI As Required Gates

**Files:**
- Modify: `.github/workflows/ci.yml` (currently runs `npm test`, `cargo test`, `npm run build`, `npm run smoke` — no lint step exists at all despite `scripts/lint.mjs` existing since Phase 0)

> Note: with no git remote (see Task 0.3) this workflow has never actually executed. Land the config now and verify with the local commands below; the CI gate goes live once Task 0.3 lands.

**Step 1: Add steps**

```yaml
- name: Run npm lint
  run: npm run lint
- name: Run cargo clippy
  run: cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```
Place before the test steps so lint failures fail fast.

**Step 2: Fix whatever clippy/lint surfaces**

Expect the 15 warnings already seen from `cargo check` (dead code in `jpeg_decoder.rs`, unused `build_webview_gate_js`, etc.) to now be required fixes, not optional.

**Step 3: Verify**

```bash
npm run lint
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml src-tauri/src
git commit -m "ci: require lint and clippy, fix existing warnings"
```

### Task 1.7: Stop Silently Swallowing Packaging Failures In CI

**Files:**
- Modify: `.github/workflows/ci.yml` (`packaging` job's `Build Tauri bundle` step currently has `continue-on-error: true`)

**Step 1: Get a baseline run (requires Task 0.3)**

This workflow has never executed — the repo has no remote until Task 0.3 lands. Once it does, let the packaging job run on all 3 OS runners as-is to confirm current bundles actually succeed before flipping this to a hard gate — do not blindly remove `continue-on-error` without a green baseline. If Task 0.3 was deferred, defer this task with it.

**Step 2: Remove `continue-on-error: true` once confirmed green**, or file a tracked issue for whichever OS is currently failing and scope this task to only the OSes that pass.

**Step 3: Verify**

Push to a branch and confirm the packaging job goes red/green correctly (test by intentionally breaking `src-tauri/tauri.conf.json` momentarily, confirming CI fails, then reverting).

**Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: make tauri packaging a required gate"
```

---

## Milestone 2: Frontend Toolchain Foundation (TypeScript + Vite + React + typed IPC)

### Task 2.1: Introduce TypeScript + Vite Build, No Behavior Change Yet

**Files:**
- Create: `tsconfig.json` (strict mode, `"jsx": "react-jsx"`)
- Create: `vite.config.ts`
- Modify: `package.json` (add `vite`, `typescript`, `@vitejs/plugin-react`, `@types/node`; add `dev`, `build:vite` scripts; keep `scripts/build.mjs` as a documented fallback until Task 3.8 retires it — note its copy of `src/` into `dist/` is already vestigial: `app/main.js` imports only `./tauri-bridge.js`)
- Modify: `src-tauri/tauri.conf.json` (`build.frontendDist` points at Vite's `dist/` output; `build.beforeBuildCommand` runs the Vite build; **add `build.devUrl`** — currently absent, and required for `tauri dev` to load from the Vite dev server instead of static files — with `build.beforeDevCommand` starting Vite)

**Step 1: Write a failing build check**

Add a test (or extend `scripts/smoke.mjs`) asserting `dist/index.html` exists and references a built JS bundle after `npm run build`.

**Step 2: Configure Vite to build `app/index.html` as the entry, output to `dist/`**

Do not move any files yet — Vite can point at `app/` as `root` so `app/main.js`, `app/tauri-bridge.js`, `app/index.html` keep working unmodified through this task.

**Step 3: Verify**

```bash
npm run build
npm run tauri:dev
npm test
```

Expected: identical runtime behavior to before, now served through Vite instead of the plain-copy `scripts/build.mjs`.

**Step 4: Commit**

```bash
git add tsconfig.json vite.config.ts package.json package-lock.json src-tauri/tauri.conf.json
git commit -m "build: introduce vite as the frontend build tool"
```

### Task 2.2: Generate Typed Tauri Command Bindings

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `tauri-specta` + `specta` as dependencies)
- Modify: `src-tauri/src/lib.rs` (annotate each `#[tauri::command]` for specta collection)
- Create: `src-tauri/src/bin/export-bindings.rs` (the binary the CI diff-check invokes — collects the specta command types and writes `app/bindings.ts`)
- Create: `app/bindings.ts` (generated, committed so CI doesn't require a Rust toolchain just to typecheck the frontend — regenerate and diff-check in CI)

**Step 1: Write a failing typecheck**

Add a throwaway `.ts` file that calls a Tauri command with a deliberately wrong argument shape; confirm `tsc` has nothing to catch it yet (no bindings exist) — this documents the gap before closing it.

**Step 2: Wire tauri-specta and generate `app/bindings.ts`** covering all 19 registered commands — 18 `#[tauri::command]`s in `lib.rs` plus `catalog::import::import_sources` registered at `lib.rs:1276` (`list_library`, `get_recipe`, `save_recipe`, `render_pipeline`, `pipeline_capabilities`, `import_sources`, `list_presets`, `save_preset`, `get_workspace_state`, `save_workspace_state`, `batch_sync`, `apply_preset`, `check_license`, `update_culling`, `list_culling`, `export_image`, `import_images`, `viewport_proof_results`, `save_viewport_proof`).

**Step 3: Add a CI check that regenerates bindings and fails on diff**

```yaml
- name: Verify generated Tauri bindings are up to date
  run: |
    cargo run --manifest-path src-tauri/Cargo.toml --bin export-bindings
    git diff --exit-code app/bindings.ts
```

(This check is inert until Task 0.3 connects a remote — commit it regardless, and run the two commands locally as the verification until then.)

**Step 4: Verify**

```bash
npx tsc --noEmit
npm test
```

Expected: the deliberately-wrong-argument-shape file from Step 1 now fails `tsc` — the compiler catches what used to only fail at runtime.

**Step 5: Remove the throwaway file, commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs app/bindings.ts .github/workflows/ci.yml
git commit -m "feat: generate typed tauri command bindings with tauri-specta"
```

### Task 2.3: Add React + Component-Test Infrastructure

**Files:**
- Modify: `package.json` (add `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `happy-dom`)
- Create: `test/setup/dom.js` (registers `happy-dom` globals before component tests run)
- Modify: `package.json` — add a dedicated `test:components` script that loads the setup file for component tests only (e.g., `node --test --import ./test/setup/dom.js "test/components/*.test.js"`), chained from the main `test` script so `npm test` still runs everything. Do **not** register happy-dom globals for the whole suite: existing tests assert DOM-*unavailable* behavior (e.g., viewport-proof's "returns readable failed measurements when the harness DOM is unavailable") and would silently change meaning if `window`/`document` suddenly exist. All component tests created in Milestones 3–4 live under `test/components/` for this reason.

**Step 1: Write one throwaway React component test** (e.g., a `<Hello />` component rendering "ok") to prove the RTL + happy-dom + node:test wiring works end-to-end before touching real UI.

**Step 2: Get it green**

**Step 3: Verify**

```bash
npm test
```

**Step 4: Delete the throwaway component, commit the infrastructure**

```bash
git add package.json package-lock.json test/setup
git commit -m "test: add react component testing infrastructure"
```

---

## Milestone 3: Migrate The Editor UI To React (one panel at a time, strangler-fig)

Each task below follows the same shape: port one panel from `app/main.js`/`app/index.html` into a typed component, write a component test proving parity with the current DOM/behavior, wire it into the React root, then delete the corresponding imperative code from `app/main.js`. Do not start the next task until the previous panel's old code is deleted — see Required Working Rules.

### Task 3.1: React Root + Top Bar

**Files:**
- Create: `app/src/App.tsx`
- Create: `app/src/components/TopBar.tsx` (brand + `pipeline-badge` + `license-badge`)
- Create: `app/src/bridge.ts` (typed wrapper around `app/bindings.ts`, replacing the untyped parts of `app/tauri-bridge.js` for newly-migrated code paths)
- Create: `test/components/topbar.test.js` (component test)
- Modify: `app/index.html` (mount point `<div id="root">`)
- Modify: `app/main.js` (remove top-bar badge DOM manipulation once `TopBar.tsx` owns it)

**Step 1: Write failing component test** asserting `TopBar` renders "Photogenic" and reflects pipeline/license badge state passed via props.

**Step 2: Implement `TopBar.tsx` and mount `App.tsx` at `#root`**, sourcing badge state from the existing `pipeline_capabilities`/`check_license` bridge calls.

**Step 3: Verify**

```bash
npm run test:components
npm run build
npm run tauri:dev
```

Expected: badges render identically to the current implementation; no dual DOM ownership remains for the top bar.

**Step 4: Commit**

```bash
git add app test
git commit -m "feat: migrate top bar to react"
```

### Task 3.2: Library Sidebar + Grid

**Files:**
- Create: `app/src/components/LibrarySidebar.tsx`
- Create: `app/src/components/LibraryGrid.tsx` (imported-image grid, star ratings, flag/reject, color labels)
- Create: `test/components/library.test.js`
- Modify: `app/main.js` (remove library-grid DOM manipulation)

**Step 1: Write failing tests** asserting: import button triggers the `import_images` typed binding; grid renders one card per catalog entry; clicking a star updates culling metadata through the `update_culling` binding — matching current `app/main.js` behavior and Issue 12's acceptance criteria.

**Step 2: Implement**, routing every backend call through the typed bindings wrapper (`app/src/bridge.ts`) — components must not hand-roll `invoke()` string literals, and must not import from `src/` (those seams are Node-only; see Architecture).

**Step 3: Verify**

```bash
npm run test:components
npm test -- test/catalog-dashboard-workflow.test.js
npm run build
```

**Step 4: Commit**

```bash
git add app test
git commit -m "feat: migrate library sidebar and grid to react"
```

### Task 3.3: Preview Area + Viewport-Proof Collector

**Files:**
- Create: `app/src/components/PreviewArea.tsx` (canvas + provenance bar)
- Create: `app/src/viewport-proof-collector.ts` (typed port of the `collectViewportProof`/`evaluateProof`/`mergeResults`/`isGenuinePass` functions currently in `app/main.js` lines 15–~120)
- Create: `test/components/preview.test.js`
- Modify: `app/main.js` (remove preview-canvas rendering + viewport-proof collection code)

**Step 1: Write failing tests** porting the existing gate-evaluation assertions (`GATE_ORDER`, `isGenuinePass`, `evaluateProof`) as TypeScript unit tests first — these are pure functions and the highest-value thing to type, since ADR-0004's honesty guarantees depend on this logic never silently overclaiming a passed gate.

**Step 2: Implement**, preserving exact gate semantics (gradient/raw_frame/zoom_pan/overlay/color_managed/sustained_60fps ordering, the `MIN_FPS = 60` floor, `hasNativeProvenance` field checks).

**Step 3: Verify**

```bash
npm run test:components
npm test -- test/viewport-proof.test.js
npm run build
npm run tauri:dev
```

Expected: viewport-proof evidence collection is byte-for-byte equivalent to the current implementation — this is the one panel where a silent behavior change would be a regression against ADR-0004, not just a UI bug.

**Step 4: Commit**

```bash
git add app test
git commit -m "feat: migrate preview area and viewport-proof collector to typescript/react"
```

### Task 3.4: Develop Panel (19 Recipe Controls)

**Files:**
- Create: `app/src/components/DevelopPanel.tsx`
- Create: `app/src/components/DevelopControl.tsx` (generic labeled-slider component — every instance gets a proper `label[for]`/`id` pair, closing the accessibility gap found in the review: `app/index.html` currently has 25 `<label>` elements and zero `for` attributes)
- Create: `test/components/develop.test.js`
- Modify: `app/main.js` (remove develop-panel DOM/event-listener code)

**Step 1: Write failing tests** covering all 15 recipe operation types (exposure, temperature, tint, contrast, highlights, shadows, whites, blacks, tone curve, HSL red channel, sharpening, noise reduction, crop, rotate, straighten), asserting: each control's `<label>` has a matching `for`/`id`; changing a control updates the Edit Recipe; a rapid second change supersedes the first preview request (matching the existing stale-request-supersession behavior).

**Step 2: Implement `DevelopControl` once, parameterized by operation type, min/max/step/label** — do not hand-roll 15 near-duplicate JSX blocks; this is exactly the kind of repetition a generic component should absorb.

**Step 3: Verify**

```bash
npm run test:components
npm test -- test/preview-workflow.test.js test/edit-recipe.test.js
npm run build
```

**Step 4: Commit**

```bash
git add app test
git commit -m "feat: migrate develop panel to react with accessible controls"
```

### Task 3.5: Batch Sync Panel

**Files:**
- Create: `app/src/components/BatchSyncPanel.tsx`
- Create: `test/components/batch-sync.test.js`
- Modify: `app/main.js` (remove batch-sync DOM code)

**Step 1: Write failing tests** for explicit operation-type checkbox selection and target-image application, matching `src/catalog/batch-session-workflow.js` semantics.

**Step 2: Implement.**

**Step 3: Verify**

```bash
npm run test:components
npm test -- test/batch-session-workflow.test.js
```

**Step 4: Commit**

```bash
git add app test
git commit -m "feat: migrate batch sync panel to react"
```

### Task 3.6: Preset Panel

**Files:**
- Create: `app/src/components/PresetPanel.tsx`
- Create: `test/components/preset.test.js`
- Modify: `app/main.js` (remove preset DOM code)

**Step 1: Write failing tests** for save/load/apply and rejection of invalid source-dependent preset operations.

**Step 2: Implement.**

**Step 3: Verify**

```bash
npm run test:components
npm test -- test/preset-workflow.test.js
```

**Step 4: Commit**

```bash
git add app test
git commit -m "feat: migrate preset panel to react"
```

### Task 3.7: Export Panel + Licensing Gate

**Files:**
- Create: `app/src/components/ExportPanel.tsx`
- Create: `test/components/export-panel.test.js`
- Modify: `app/main.js` (remove export-panel DOM code)

**Step 1: Write failing tests** asserting the export button is disabled/explains itself when licensing is inactive/expired (per `describeExportLicensingState`), and queues correctly when active.

**Step 2: Implement.**

**Step 3: Verify**

```bash
npm run test:components
npm test -- test/export-workflow.test.js test/licensing-workflow.test.js
```

**Step 4: Commit**

```bash
git add app test
git commit -m "feat: migrate export panel to react"
```

### Task 3.8: Delete The Legacy Imperative Shell

**Files:**
- Delete: `app/main.js` (should be empty of panel logic by now — confirm before deleting)
- Delete or shrink: `app/tauri-bridge.js` (superseded by `app/bindings.ts` + `app/src/bridge.ts`; keep only if something still depends on the untyped fallback path)
- Modify: `app/index.html` (single `<script type="module" src="/src/main.tsx">` entry)
- Create: `app/src/main.tsx` (React root mount, replacing what `main.js`'s bootstrap used to do)

**Step 1: Confirm nothing still imports `app/main.js`**

```bash
grep -rn "main.js" app src-tauri test
```

**Step 2: Delete and replace the entry point.**

**Step 3: Verify full parity**

```bash
npm test
npm run build
npm run tauri:dev
npm run smoke
```

Expected: every test that previously exercised `app/main.js` now exercises the React tree instead, with identical pass/fail outcomes. `npm run smoke` (the full alpha workflow chain) must still pass end to end.

**Step 4: Commit**

```bash
git add app
git commit -m "refactor: remove legacy imperative editor shell"
```

---

## Milestone 4: Accessibility Hardening

### Task 4.1: Keyboard Navigation + ARIA For Interactive Panels

**Files:**
- Modify: `app/src/components/LibraryGrid.tsx` (arrow-key navigation between image cards, `role="grid"`/`role="gridcell"`)
- Modify: `app/src/components/DevelopControl.tsx` (`aria-valuemin`/`aria-valuemax`/`aria-valuenow` already implied by native `<input type=range>`, but confirm `aria-label` fallback when a visible label is abbreviated)
- Modify: `app/src/components/BatchSyncPanel.tsx`, `PresetPanel.tsx` (focus trapping for any dialog-like sections)

**Step 1: Write failing tests** using `@testing-library/react`'s accessibility queries (`getByRole`, `getByLabelText`) — a control that isn't reachable via its accessible role/label should fail the test, not just look right visually.

**Step 2: Implement.**

**Step 3: Verify**

```bash
npm test
```

**Step 4: Commit**

```bash
git add app test
git commit -m "fix: add keyboard navigation and aria labeling to editor panels"
```

### Task 4.2: Automated Accessibility Regression Check

**Files:**
- Modify: `package.json` (add `jest-axe` or `axe-core` + a thin node:test adapter)
- Create: `test/components/accessibility.test.js` (runs axe against the rendered `App` tree — lives under `test/components/` so it gets the happy-dom setup)

**Step 1: Write a failing test** (should fail against the pre-Milestone-4 tree if run retroactively — confirms the check has teeth).

**Step 2: Wire axe into CI** as part of the normal `npm test` run, not a separate optional job.

**Step 3: Verify**

```bash
npm test
```

**Step 4: Commit**

```bash
git add package.json package-lock.json test
git commit -m "test: add automated accessibility regression check"
```

---

## Milestone 5: Dependency Automation, Auto-Update, Crash Telemetry

### Task 5.1: Add Dependabot Configuration

**Files:**
- Create: `.github/dependabot.yml` covering `npm` (`/`) and `cargo` (`/src-tauri`) ecosystems, weekly schedule, grouped minor/patch updates.

**Step 1: Write the config.**

**Step 2: Verify (requires Task 0.3's remote)**

Confirm via `gh api` or the repo's Dependabot tab that both ecosystems are detected — this can't be verified locally. If Task 0.3 was deferred, commit the config and mark this task's verification deferred with it.

**Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: add dependabot for npm and cargo"
```

### Task 5.2: Add Auto-Update Support

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `tauri-plugin-updater`)
- Modify: `src-tauri/tauri.conf.json` (add `plugins.updater` config with a signing public key and update-feed URL placeholder)
- Modify: `src-tauri/src/lib.rs` (register the updater plugin)
- Create: `docs/runbooks/release-and-update.md` (how signed update artifacts get published, mirroring the existing `docs/runbooks/internal-alpha-packaging.md` style)

**Step 1: Write a failing smoke check** asserting the updater plugin is registered and the config has a non-placeholder feed URL before this is considered done for a real release (fine to ship with a documented placeholder for internal alpha, but the smoke check should say so explicitly rather than silently passing).

**Step 2: Implement.**

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

**Step 4: Commit**

```bash
git add src-tauri docs/runbooks
git commit -m "feat: add tauri auto-update plugin scaffold"
```

### Task 5.3: Add Opt-In Crash/Error Telemetry

**Files:**
- Modify: `src-tauri/Cargo.toml` (crash-reporting crate, e.g., `sentry` with the `panic` feature — or a self-hosted-compatible alternative given ADR-0009's privacy stance)
- Modify: `src-tauri/src/lib.rs` (init telemetry behind an explicit user opt-in setting, never enabled by default)
- Create: `app/src/components/ErrorBoundary.tsx` (React error boundary reporting to the same opt-in channel)
- Modify: `src/licensing/*` or a new `src/privacy/telemetry-consent.js` seam (persist the opt-in choice, matching the existing seam pattern)

**Step 1: Write failing tests** asserting telemetry is off by default and only activates after explicit consent is persisted.

**Step 2: Implement**, being explicit in the UI copy that this is opt-in and what it sends — this directly follows the ephemeral/consent posture already established for cloud-generative features in ADR-0009.

**Step 3: Verify**

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

**Step 4: Commit**

```bash
git add src-tauri app src
git commit -m "feat: add opt-in crash and error telemetry"
```

---

## Milestone 6: Seam-Layer Audit (defer until the React migration has real consumers)

### Task 6.1: Audit Dashboard Foundation/Workflow Layers For Real UI Consumers

**Files:**
- Read: `src/catalog/dashboard-workflow.js`, `src/catalog/foundation.js`, and the equivalent `dashboard-foundation.js`/`dashboard-workflow.js` pairs in `src/export`, `src/preview`, `src/licensing`, `src/viewport-proof` (each domain repeats this 4-layer pattern; `src/catalog` alone is 20 files / 4,428 lines)
- Modify: whichever of the above the migrated React panels (Milestone 3) actually ended up calling
- Create: `.scratch/frontend-modernization/issues/07-seam-layer-audit.md` findings appended under `## Comments`

**Step 1: For each dashboard-layer module, grep whether any React component (post-Milestone-3) or Rust command calls it.**

```bash
grep -rln "dashboard-workflow\|dashboard-foundation" app/src src-tauri/src
```

Given the corrected architecture (React cannot import these Node-only modules), expect zero frontend callers — the real question is which seams have Node-side consumers (`scripts/smoke.mjs`, tests, future maintenance tooling) versus none at all.

**Step 2: For modules with zero real callers**, decide explicitly: wire them into a real UI surface this milestone, or record in the issue file why they're being kept as forward-looking scaffolding with a target milestone, or delete them. Do not leave the question unanswered — that's how the current sprawl happened.

**Step 3: Verify**

```bash
npm test
npm run build
```

Expected: test count only decreases if a module (and its dedicated test file) was deliberately deleted, never as a side effect.

**Step 4: Commit**

```bash
git add src app .scratch/frontend-modernization
git commit -m "refactor: resolve unused dashboard seam layers after react migration"
```

---

## Dependency Order Summary

1. Record the React/TypeScript decision (ADR-0011) before touching any code, so the migration has a citable rationale.
2. Connect the git remote (Task 0.3) — every CI-dependent piece (lint/clippy gates, packaging gate, binding-diff check, Dependabot) is inert config until this exists; get the user's hosting decision early.
3. Security/reliability hardening (Milestone 1) — independent of the frontend, do it first since it's cheap and de-risks everything downstream.
4. Toolchain foundation: TypeScript + Vite + React + typed bindings (Milestone 2) — nothing in Milestone 3 can start without this.
5. Panel-by-panel migration (Milestone 3), strangler-fig, one panel fully deleted-and-replaced before the next starts.
6. Accessibility pass (Milestone 4) on the now-componentized panels.
7. Dependency automation, auto-update, telemetry (Milestone 5) — independent of the UI migration, can run in parallel with Milestone 3/4 if capacity allows.
8. Seam-layer audit (Milestone 6) — deliberately last, so the settled post-migration frontend confirms which Node-side seams still have any consumer at all.

## Completion Criteria

The plan is complete when:
- `ARCHITECTURE.md`'s React + TypeScript decision matches the shipped code, and ADR-0011 records why/how the correction happened — including the binding rule that the frontend is React + TypeScript (preferred) or React + JavaScript (fallback), never vanilla JS.
- `app/main.js` no longer exists; every panel it used to drive (top bar, library, preview + viewport-proof collector, develop, batch sync, presets, export) is a tested React component (TypeScript per the preferred path; React + JavaScript acceptable only if a documented TS blocker forced the sanctioned fallback).
- Every Tauri command call from the frontend goes through generated `tauri-specta` bindings, not hand-written string literals.
- `src-tauri/tauri.conf.json` has a real CSP and `src-tauri/capabilities/default.json` exists and is scoped to exactly the commands the webview uses.
- The two production panic paths in `src-tauri/src/lib.rs` (catalog-DB-open `.expect` at startup, export output-format `.unwrap()`) are resolved, clippy `unwrap_used`/`expect_used` guard lints keep production code panic-free, and the recipe-fingerprint write failure path is no longer silently dropped.
- CI enforces `npm run lint`, `cargo clippy -D warnings`, and (once confirmed stable) a hard-gated cross-platform packaging build.
- Every interactive control in the editor has a proper accessible name (`label[for]` or `aria-label`), and an automated axe check runs as part of `npm test`.
- Dependabot is configured for both `npm` and `cargo`; an auto-update plugin scaffold and opt-in crash telemetry exist.
- The dashboard-foundation/dashboard-workflow seam layers across `src/catalog`, `src/export`, `src/preview`, `src/licensing`, `src/viewport-proof` have each been explicitly resolved (wired, scoped-and-scheduled, or deleted) rather than left as unaudited scaffolding.
- `npm test`, `npm run build`, `npm run lint`, `npx tsc --noEmit`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, and `npm run smoke` all pass on the final commit.
