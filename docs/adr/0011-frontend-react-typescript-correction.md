# 0011 — Frontend must be React (TypeScript preferred); vanilla JS is not acceptable

**Status:** accepted

The frontend UI layer MUST be React-based. React + TypeScript is reaffirmed as the
preferred implementation, matching the locked technology table in `ARCHITECTURE.md`
(line 86) and the system diagram (line 44). React + JavaScript (`.jsx`) is the only
acceptable fallback, and only when a genuine TypeScript blocker is encountered and
recorded. Vanilla JavaScript — imperative DOM manipulation outside a React component
tree — is explicitly **not acceptable** as a frontend implementation.

## Background: the drift

`ARCHITECTURE.md` locks the UI layer as React + TypeScript. The original plan
(`docs/plans/2026-07-07-photogenic-internal-alpha-remaining-work.md`, Milestone 5
Task 5.1) also scoped `app/App.jsx or app/App.tsx`. However, the issue that was
actually implemented (`.scratch/photogenic-foundation/issues/12-internal-alpha-ui.md`)
weakened that scope to:

> "Small Tauri-compatible **React/TypeScript or React/JavaScript** app shell."

The implementing agent then shipped a third option that satisfied **neither** branch: a
dependency-free, framework-free `app/main.js` (911 lines of imperative DOM manipulation)
plus `app/tauri-bridge.js`. `package-lock.json` had zero npm packages installed. The
issue was marked `Status: done` and merged without anyone amending `ARCHITECTURE.md` or
the original plan to reflect the actual decision. No ADR in `docs/adr/0001`–`0010` ever
formally re-opened or ratified this change — it was silent drift, not a decision.

## Decision

1. **The frontend is React.** React + TypeScript is the preferred path; React +
   JavaScript is the only sanctioned fallback (same components, `.jsx` instead of `.tsx`).
2. **Vanilla JS is prohibited** as a frontend implementation. The `app/main.js` shell
   shipped in Issue 12 was an unratified deviation, not a superseding decision.
3. This ADR closes the loophole that caused the drift: Issue 12's
   "React/TypeScript or React/JavaScript" wording allowed an implementation to ship
   that satisfied neither option, because neither option was stated as mandatory and
   no prohibition on the third path existed. This ADR states both the allowed options
   AND the prohibition.

## Why

- The shipped `app/main.js` satisfies neither the React + TypeScript nor the React +
  JavaScript branch of Issue 12's own scope language.
- A growing 911-line imperative DOM file with hand-maintained string-literal IPC calls
  has no compile-time contract checking between the Rust command surface and the
  frontend — a Rust command rename becomes a silent runtime failure instead of a
  compile error.
- The maintainability cost grows with every panel added; React's component model is
  the project's stated UI architecture and the reason `ARCHITECTURE.md` locked it.

## Consequences

- The frontend now has npm dependencies for the first time (Vite, React, TypeScript,
  type definitions, component-test infrastructure). This is a deliberate, explicit
  departure from the "dependency-free lint scaffold" philosophy in `scripts/lint.mjs`'s
  own comment, scoped to `app/` and its build tooling only. Rust and the test harness
  remain dependency-conscious as before.
- Typed Tauri command bindings (`tauri-specta`) will be generated from Rust signatures
  so the IPC contract is enforced at compile time.
- `app/main.js` will be fully replaced by React components via a strangler-fig migration
  (one panel at a time, each verified before the old imperative code is deleted).
- If TypeScript adoption hits a genuine blocker mid-migration, the sanctioned fallback
  is React + JavaScript — the reason must be recorded in the issue tracker, and the
  implementation may **not** fall back further to vanilla JS under any circumstances.
