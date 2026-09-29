# Proposal

## Why

BookaLLM can only be run from source, and the README's "How to install" points to a latest release that does not exist yet. INTENT.md plans a release pipeline reusing tauri-action's matrix build across macOS, Linux and Windows; it is the last item of v1.

## What Changes

- The version becomes **1.0.0** everywhere it is declared (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`): this release completes v1.
- A new GitHub Actions workflow, `.github/workflows/release.yml`: pushing a tag `vX.Y.Z` builds the installers for Windows, macOS (Apple silicon and Intel) and Linux with `tauri-apps/tauri-action`, and attaches them to a **draft** GitHub release that the author checks and publishes by hand. It first checks that the tag matches the version in the code, so a mistyped tag builds nothing.
- The installers are **unsigned** for now. The README's "How to install" explains the one extra click each system asks for (Windows SmartScreen, macOS Gatekeeper) and which file to pick per system.
- After the first release is published, the README's "The first release is being prepared" line goes and INTENT.md's Roadmap marks v1 complete.

### Non-goals

- Code signing and notarisation (paid certificates); can come later.
- An in-app updater.
- Testing on macOS and Linux beyond building: the README keeps saying they are untested.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none: build and release tooling only; `.openspec.yaml` sets `skip_specs: true`.)

## Impact

- `.github/workflows/release.yml` (new); `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` (version); `README.md` (How to install); `INTENT.md` (Roadmap).
- No new dependency in the app; the workflow uses GitHub-hosted actions (`tauri-apps/tauri-action`, `pnpm/action-setup`, `actions/setup-node`, `dtolnay/rust-toolchain`, `swatinem/rust-cache`).
