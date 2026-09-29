# Design

## Context

- `.github/workflows/ci.yml` runs lint, format, Rust formatting, typecheck, unit and e2e tests on every push, on Ubuntu.
- The desktop app is Tauri 2.12 with the opener and SQL plugins and the `tray-icon` feature. `tauri.conf.json` has `bundle.targets: "all"` and icons for every platform.
- Versions are `0.1.0` in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
- Claude cannot push or create releases on GitHub from this machine; the author pushes from GitHub Desktop or a terminal. The repository's Actions and Releases pages can be read in a browser.

## Goals / Non-Goals

**Goals:**

- Nothing becomes public without the author looking at it first.

**Non-Goals:**

- Signing, notarisation, auto-update (see proposal).

## Decisions

### 1. Trigger: a version tag, into a draft

`on: push: tags: ['v*']`, plus `workflow_dispatch` for a rebuild. `tauri-action` gets `tagName: ${{ github.ref_name }}`, `releaseName: BookaLLM ${{ github.ref_name }}`, `releaseDraft: true`, and a short release body (what BookaLLM is, which file to download, the unsigned warnings, a link to the README). The workflow needs `permissions: contents: write` to create the release.

### 2. Matrix

| Runner | Target | Installers |
| --- | --- | --- |
| `windows-latest` | default | `.msi` and `-setup.exe` (NSIS) |
| `macos-latest` | `aarch64-apple-darwin` | `.dmg` (Apple silicon) |
| `macos-latest` | `x86_64-apple-darwin` | `.dmg` (Intel) |
| `ubuntu-22.04` | default | `.AppImage` and `.deb` |

`fail-fast: false`, so one platform failing does not cancel the others. Linux installs Tauri's system packages first (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev` for the tray, `librsvg2-dev`, `patchelf`).

### 3. The tag must match the code

A first step compares the tag (without its `v`) with `version` in `package.json` and fails with a clear message if they differ. A small `scripts/check-version.ts`, run by the workflow and by `pnpm check:version`, does both checks: `package.json`, `Cargo.toml` and `tauri.conf.json` declare the same version, and, when given a tag, the tag matches it.

### 4. Unsigned installers, explained

The README's "How to install" gets one short list: Windows, pick the `-setup.exe`; if SmartScreen says "Windows protected your PC", choose "More info" then "Run anyway". macOS, pick the `.dmg` for your Mac's chip; the first time, right-click the app, choose Open, then Open again. Linux, the `.AppImage` (make it executable) or the `.deb`. The macOS and Linux lines keep the "not tested yet" note.

### 5. Caching

`swatinem/rust-cache` on `src-tauri` and pnpm's store cache in `setup-node`, so a rebuild takes minutes rather than a cold Rust build each time.

## Risks / Trade-offs

- [The workflow can only be really tested on GitHub] → The version check script is tested locally; the YAML is checked for syntax; the first tag push is the real test, into a draft nobody else sees.
- [macOS or Linux build fails on something Windows never hit (the SQL plugin's system library, the tray)] → `fail-fast: false` keeps the Windows installer; a failing platform is fixed or left out of the first release, and the author decides.
- [Unsigned installers look suspicious] → The README explains the warnings in plain words; signing is a later decision.

## Migration Plan

None. Rollback: delete the workflow; a draft release can be deleted from GitHub.
