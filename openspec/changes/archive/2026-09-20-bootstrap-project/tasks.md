# Tasks

## 1. App scaffold

- [x] 1.1 Scaffold Tauri 2 + Svelte + TypeScript (Vite) with pnpm at the repo root, name `BookaLLM`, identifier `com.promethee.bookallm`; verify `pnpm install` succeeds and `pnpm-lock.yaml` exists
- [x] 1.2 Pin pnpm via the `packageManager` field, set `engines`, and allow required dependency build scripts; verify a clean `pnpm install --frozen-lockfile` succeeds
- [x] 1.3 Replace the template UI with a placeholder shell (app name, "Ask mode" disclosure line); verify `pnpm tauri dev` opens a window showing it
- [x] 1.4 Add brief Rust-specific comments in `src-tauri/src/` where syntax is non-obvious; verify `cargo check` in `src-tauri/` passes
- [x] 1.5 Commit checkpoint: "Scaffold Tauri + Svelte app"

## 2. Styling

- [x] 2.1 Add Tailwind CSS v4 with `@tailwindcss/vite` and import it in the app stylesheet; verify a Tailwind utility class visibly styles the placeholder shell in `pnpm dev`
- [x] 2.2 Commit checkpoint: "Add Tailwind CSS"

## 3. Lint and format

- [x] 3.1 Add ESLint 9 flat config (typescript-eslint, eslint-plugin-svelte, eslint-config-prettier) and a `lint` script; verify `pnpm lint` passes on the scaffold and fails on an injected unused variable
- [x] 3.2 Add Prettier (svelte and tailwind plugins) with `format` and `format:check` scripts; verify `pnpm format:check` passes after `pnpm format`
- [x] 3.3 Add `rustfmt.toml` if needed and a `cargo fmt` script entry; verify `cargo fmt --check` in `src-tauri/` passes
- [x] 3.4 Commit checkpoint: "Add ESLint, Prettier, rustfmt"

## 4. Tests

- [x] 4.1 Add Vitest (jsdom, `@testing-library/svelte`) with a `test` script and one component smoke test for the placeholder shell; verify `pnpm test` passes
- [x] 4.2 Add Playwright (Chromium only, `webServer` on the Vite dev server) with a `test:e2e` script and one test asserting the shell renders; verify `pnpm test:e2e` passes
- [x] 4.3 Add a `check` script (lint, format check, unit, e2e); verify `pnpm check` passes end to end
- [x] 4.4 Commit checkpoint: "Add Vitest and Playwright"

## 5. Git hooks

- [x] 5.1 Add husky and lint-staged (ESLint, Prettier, rustfmt on staged files); verify committing a file with a lint error is blocked and a clean commit succeeds under Git Bash
- [x] 5.2 Add a pre-push hook running the full test suite; verify a push is blocked when a test is made to fail and allowed when it passes
- [x] 5.3 Commit checkpoint: "Add husky and lint-staged hooks"

## 6. CI

- [x] 6.1 Add `.github/workflows/ci.yml` (push trigger, Ubuntu, Node LTS, frozen-lockfile install, lint, format check, `cargo fmt --check`, Vitest, Playwright with Chromium cached); verify the workflow file passes `actionlint` or a YAML parse
- [x] 6.2 Push a branch and verify the CI run is green on GitHub, and red when a test is temporarily broken
- [x] 6.3 Commit checkpoint: "Add CI workflow"

## 7. Wrap-up

- [x] 7.1 Update README "Status" to reflect that the scaffold and tooling exist; verify the diff touches only that section
- [x] 7.2 Verify from a fresh clone: `pnpm install`, `pnpm check` and `pnpm tauri dev` all succeed
- [x] 7.3 Commit checkpoint: "Update README status", then archive the change
