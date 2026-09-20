# Design

## Context

Empty repo: README, `.gitattributes`, OpenSpec files. Local toolchain: Node 25.8.2, pnpm 11.0.8, rustc/cargo 1.98.1, Windows with Git Bash. Motivation and scope: see proposal.md. Constraints come from README "Tech Stack" and "Tooling & Process".

## Goals / Non-Goals

**Goals:**
- One command each to run the app, lint, format-check, unit test and e2e test.
- The same checks run locally (hooks) and in CI, so CI is the enforcement point.
- A layout that later changes (ingestion, retrieval, UI) can extend without restructuring.

**Non-Goals:**
- Release/packaging pipeline (tauri-action matrix), systray, Ollama detection, any product code.
- E2E through the native Tauri webview. E2E targets the frontend in a browser.
- Rust unit tests; the Rust layer is only the Tauri bridge for now.

## Decisions

1. **Plain Svelte + Vite, not SvelteKit.** README says "Svelte"; this reads it literally. The app is a single window with no server rendering or file-based routing, so SvelteKit's adapter-static setup adds config without benefit. Alternative: SvelteKit SPA mode (the likely `create-tauri-app` default); revisit only if routing becomes real. **Flagged as an interpretation of the README stack, not a change to it.** At apply time, scaffold with `create-tauri-app` if it offers plain Svelte + TypeScript, otherwise hand-assemble the Vite/Svelte frontend around `src-tauri/`.
2. **Tauri 2.** Current major; `src-tauri/` holds the Rust bridge. Rust files get brief comments on Rust-specific syntax only, per README.
3. **Tailwind CSS v4 via `@tailwindcss/vite`.** No PostCSS config or `tailwind.config.js`. Alternative: v3 with PostCSS, rejected as older and more files.
4. **ESLint 9 flat config** with `typescript-eslint`, `eslint-plugin-svelte` and `eslint-config-prettier`. Prettier with `prettier-plugin-svelte` and `prettier-plugin-tailwindcss`. rustfmt via `cargo fmt`, checked with `--check`.
5. **Vitest** shares the Vite config, `jsdom` environment, `@testing-library/svelte` for component smoke tests. Unit tests sit next to the source (`*.test.ts`).
6. **Playwright, Chromium only,** against the Vite dev server via its `webServer` option. Tauri IPC calls are not available in a plain browser, so later e2e tests must mock the bridge; native-webview e2e is deferred.
7. **Hooks: husky + lint-staged.** Pre-commit runs lint-staged (ESLint, Prettier, `rustfmt` on staged files only). Pre-push runs the full suite (Vitest + Playwright), as README specifies.
8. **CI: one GitHub Actions workflow** on push, Ubuntu, Node LTS: install with the frozen lockfile, ESLint, Prettier check, `cargo fmt --check`, Vitest, Playwright. No Tauri/WebKit system packages are needed since CI does not compile Rust yet; that arrives with the release-pipeline change.
9. **Scripts** in `package.json`: `dev`, `tauri`, `lint`, `format`, `format:check`, `test`, `test:e2e`, `check` (lint + format check + tests). Hooks and CI call these, so the checks are defined once.
10. **Identity:** product name `BookaLLM`, package `bookallm`, bundle identifier `com.promethee.bookallm` (assumed from the GitHub owner). The identifier determines the default app-data directory later used for indexes and settings, so it should be settled before any release.
11. **`packageManager` field** in `package.json` pins pnpm, so CI and local agree.

## Risks / Trade-offs

- [First `tauri dev` compiles many crates and takes minutes] → Expected; verify once at apply, not in every hook or CI run.
- [Windows reserves TCP port ranges (Hyper-V/WSL), which broke the template default 1420 with `EACCES`] → Dev server uses 5173 (HMR 5174) in both `vite.config.ts` and `tauri.conf.json`; if a future reboot reserves it, change both together.
- [Local Node 25 is non-LTS while CI uses LTS] → Set `engines` to a range covering both and run CI on the LTS line.
- [Pre-push running Playwright is slow] → Accepted by README (local hooks are convenience; CI enforces). Revisit if it hinders pushes.
- [pnpm 11 blocks dependency build scripts by default (e.g. esbuild)] → Allow them explicitly in the pnpm config and verify a clean install.
- [Hooks can be bypassed with `--no-verify`] → CI is the real gate.
- [Playwright browser download adds CI time] → Install Chromium only and cache the browser directory.

## Open Questions

- Confirm the bundle identifier `com.promethee.bookallm` before the first release.
