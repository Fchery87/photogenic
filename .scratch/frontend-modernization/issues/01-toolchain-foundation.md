# Issue 01 — Frontend toolchain foundation (TypeScript + Vite + React + component tests)

Status: needs-triage

Plan reference: Milestone 2, Tasks 2.1 and 2.3.

## Goal

Introduce the TypeScript + Vite + React toolchain and component-test infrastructure with
zero behavior change to the existing app. This is the foundation every panel migration
(Issue 03) depends on.

## In Scope

- `tsconfig.json` (strict mode, `jsx: react-jsx`).
- `vite.config.ts` configured to build `app/index.html` as entry, output to `dist/`.
- `package.json`: add `vite`, `typescript`, `@vitejs/plugin-react`, `@types/node`; add `dev` / `build:vite` scripts.
- `src-tauri/tauri.conf.json`: point `frontendDist` at Vite `dist/`, add `devUrl` + `beforeDevCommand`.
- `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `happy-dom`.
- `test/setup/dom.js` registering happy-dom globals for component tests only.
- Dedicated `test:components` script (does NOT register DOM globals for the full suite).

## Out of Scope

- Generating typed IPC bindings (Issue 02).
- Migrating any panel to React (Issue 03).

## Acceptance Criteria

- `npm run build` produces `dist/index.html` referencing a built JS bundle via Vite.
- `npm run tauri:dev` serves the app from the Vite dev server with identical behavior.
- A throwaway `<Hello />` component test passes via `npm run test:components`.
- Existing `npm test` suite is unaffected (happy-dom globals not registered globally).
- `npm test`, `npm run build` all green.

## Verification

- `npm run build`
- `npm run tauri:dev`
- `npm test`
- `npm run test:components`
