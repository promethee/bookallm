# Proposal

## Why

The repo holds only the README and OpenSpec setup; there is no code, toolchain or CI. README "Tooling & Process" asks for lint, format, tests, hooks and CI to be "set up early, not retrofitted after drift happens". Every later change (EPUB ingestion, Ask mode, Verify mode) needs a working, verified skeleton to build on.

## What Changes

- Scaffold a Tauri 2 desktop app with a Svelte + TypeScript frontend (Vite), Tailwind CSS and pnpm. The window renders a placeholder shell and launches with `pnpm tauri dev`.
- Add ESLint and Prettier (TS/Svelte) and rustfmt for the Rust bridge, each with a `pnpm` script.
- Add Vitest (unit) and Playwright (e2e) with one passing smoke test each.
- Add husky + lint-staged: lint/format on pre-commit for staged files, full test suite on pre-push.
- Add a GitHub Actions workflow that runs lint and the full test suite on push.
- Keep the existing `.gitattributes` (LF repo-wide, `*.bat` CRLF); no change needed.
- No product behavior: no Ollama, EPUB, retrieval or UI beyond a placeholder. The release matrix build (tauri-action) is out of scope and comes in a later change.

## Capabilities

### New Capabilities

None. This change is tooling only; it adds no user-facing or spec-level behavior. The change sets `skip_specs: true` in `.openspec.yaml`.

### Modified Capabilities

None.

## Impact

- New top-level files: `package.json`, `pnpm-lock.yaml`, Vite/Svelte/Tailwind/ESLint/Prettier/Vitest/Playwright configs, `src/`, `src-tauri/`, `.husky/`, `.github/workflows/ci.yml`.
- New dev dependencies via pnpm; Rust crates via Cargo (Tauri 2).
- Toolchain already present locally: Node 25.8.2, pnpm 11.0.8, rustc/cargo 1.98.1.
- README "Status" line ("Build not started") should be updated once the scaffold lands.
