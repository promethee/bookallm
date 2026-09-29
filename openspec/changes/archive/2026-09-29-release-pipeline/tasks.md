# Tasks

## 1. Version and workflow

- [x] 1.1 Set the version to 1.0.0 in `package.json`, `src-tauri/Cargo.toml` (updating `Cargo.lock`) and `src-tauri/tauri.conf.json`; verify `cargo check` and `pnpm test` pass
- [x] 1.2 Write `scripts/check-version.ts` (the three versions agree, and match a tag when given one; design decision 3) with a `check:version` package script; verify it passes now, and fails for a mismatched tag
- [x] 1.3 Write `.github/workflows/release.yml` (design decisions 1, 2 and 5, running the version check first); verify the YAML parses and every action is pinned to a major version
- [x] 1.4 Update the README's "How to install" with the per-system files and the unsigned-installer steps (design decision 4); verify with markdownlint
- [x] 1.5 Commit ("Add the release pipeline and set the version to 1.0.0")

## 2. First release (with the author)

- [x] 2.1 The author pushes the commits and the tag `v1.0.0`; check the Release workflow's run on GitHub and fix what fails; verify a draft release "BookaLLM v1.0.0" holds the Windows, macOS and Linux installers
- [x] 2.2 The author installs the Windows installer from the draft and runs `MANUAL_TESTS.md`'s start and tray checks, then publishes the release; verify the README's "latest release" link opens it

## 3. Wrap-up

- [x] 3.1 Remove "The first release is being prepared." from the README and mark v1 complete in INTENT.md's Roadmap; verify with markdownlint, then commit ("Finish release-pipeline")
