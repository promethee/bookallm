# Tasks

## 1. Intent

- [x] 1.1 `git mv README.md INTENT.md`, retitle it, and replace its Status section with a Roadmap (design decision 1); verify `git log --follow INTENT.md` shows the README's history and markdownlint passes
- [x] 1.2 Point `openspec/config.yaml` at `INTENT.md` as the source of truth; verify `openspec validate --all --strict` still passes
- [x] 1.3 Commit ("Move the design spec to INTENT.md")

## 2. Screenshots

- [x] 2.1 Write `scripts/screenshots.ts` and a `screenshots` script in `package.json` (design decision 3); verify it runs against the dev server and the local Ollama with *Candide* and writes three PNGs to `docs/images/`
- [x] 2.2 Look at the three images and keep them only if each clearly shows its feature; verify by viewing them
- [x] 2.3 Commit ("Add a screenshot script and screenshots")

## 3. User-facing README

- [ ] 3.1 Check each EPUB source in the browser (reachable, public-domain, DRM-free EPUB) and keep only those that pass (design decision 4); verify the list in the notes of this task
- [ ] 3.2 Write the new `README.md` following design decision 2, with the screenshots and the checked EPUB sources; verify with markdownlint and that every link and image path resolves
- [ ] 3.3 Commit ("Add a user-facing README")

## 4. Wrap-up

- [ ] 4.1 Update the project memory notes that call the README the source of truth; verify they name INTENT.md
- [ ] 4.2 Run `pnpm test`, `pnpm lint` and `pnpm format:check` (nothing should change), then commit ("Finish intent-and-user-readme")
