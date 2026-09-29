# Design

## Context

- The repository `promethee/bookallm` is public; release `v1.0.0` is the latest, with 11 assets: Windows (`_x64-setup.exe`, `.msi`), macOS (`_aarch64.dmg`, `_x64.dmg`, plus `.app.tar.gz`), Linux (`.AppImage`, `.deb`, `.rpm`), and signatures.
- Screenshots are in `docs/images/` (`ask.png`, `verify.png`, `recovery.png`), retaken by `pnpm screenshots`.
- The README holds the approved wording (pitch, the two modes, EPUB sources, AI disclaimer); the author reviewed it line by line.
- The app's French wording rules (memory: buttons in the infinitive naming the reader's action; no participle agreeing with filled-in words) apply to the site's French too.

## Goals / Non-Goals

**Goals:**

- A reader on any system reaches the right installer in one click, or two on a Mac.

**Non-Goals:**

- A build step or framework; anything beyond one page.

## Decisions

### 1. Plain files in `site/`

`index.html` holds the structure with both languages' text in a small dictionary in `site.js`; `style.css` is hand-written, responsive, light and dark (following the system), with the app's indigo for Ask and amber for Verify so the page looks like the app. No framework and no build: the workflow publishes the folder as it is.

### 2. The download button

`download.js` exports two pure functions, tested with Vitest:

- `detectSystem(userAgent, platform)` → `windows`, `mac`, `linux` or `unknown`.
- `pickAssets(release, system)` → the installer links for that system from a GitHub release's `assets` (by file ending: `-setup.exe`; `_aarch64.dmg` and `_x64.dmg`; `.AppImage` and `.deb`).

At load, `site.js` fetches `https://api.github.com/repos/promethee/bookallm/releases/latest` and shows the button for the detected system, labelled with the version. A browser cannot tell an Apple chip from an Intel one reliably, so on a Mac the page shows both, "Apple chip (M1 or later)" first. If the request fails (offline, rate limit), the button links to the releases page instead, so it never breaks. "Other systems" lists every installer.

### 3. Languages

The page opens in French when the browser prefers French, otherwise English; an "EN | FR" toggle switches at once, sets `<html lang>`, and remembers the choice in `localStorage` (guarded, so a blocked storage still shows the page). All text lives in the dictionary; the HTML carries keys.

### 4. Screenshots without duplication

The workflow copies `docs/images/*.png` into the published folder as `images/`. Locally, `site/images` is not committed; a note in `site/README.md` explains how to preview.

### 5. Publishing

`.github/workflows/pages.yml`: on push to `main` touching `site/**`, `docs/images/**` or the workflow itself, plus `workflow_dispatch`; `permissions: pages: write, id-token: write, contents: read`; steps `actions/checkout@v4`, copy the screenshots, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` with `path: site`, `actions/deploy-pages@v4`.

## Risks / Trade-offs

- [GitHub's API allows 60 unauthenticated requests per hour per visitor's address] → One request per visit, and the fallback link to the releases page keeps the button working when it is refused.
- [The site and the README drift apart] → The rule "the site summarises the README" and one place, `site.js`, holding all text.
- [macOS and Linux installers are untested] → The page says so under their links, as the README does.

## Migration Plan

None. Rollback: disable Pages or delete `site/` and the workflow.
