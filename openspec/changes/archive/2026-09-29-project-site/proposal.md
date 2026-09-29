# Proposal

## Why

BookaLLM 1.0.0 is released and the repository is public, but the only page a reader can land on is the GitHub repository, which is made for developers. INTENT.md's drift review added "the GitHub page and the user-facing pitch" to v1's scope, with the README's sections meant to be reused by a GitHub Pages site. A short, bilingual product page with a download button that picks the right installer lets a reader go from "what is this?" to "installed" without reading a repository.

## What Changes

- A one-page website, published with GitHub Pages at `https://promethee.github.io/bookallm/`, in plain HTML, CSS and a little JavaScript (no framework, no build step), in `site/`.
- Content, top to bottom: the pitch ("AI makes mistakes. Use them to learn.", free, made for people studying a book); a download button for the visitor's system, taken from the latest release, with links for the other systems; Ask mode and Verify mode, each with its screenshot and why it exists; the free EPUB sources in English and French; a footer with the MIT license, the AI disclaimer and a link to the repository.
- English and French, with a toggle; the first visit follows the browser's language, and the choice is remembered.
- The text follows the README: the page summarises it and never says more than it does.
- A workflow, `.github/workflows/pages.yml`, publishes the site when `site/` or the screenshots change, copying the screenshots from `docs/images/` so they are not duplicated.
- The README links to the site.

### Non-goals

- A blog, documentation pages, or anything beyond one page.
- A custom domain.
- Analytics or cookies.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none: a website only; `.openspec.yaml` sets `skip_specs: true`.)

## Impact

- New `site/` (`index.html`, `style.css`, `site.js`, `download.js` and its unit test), `.github/workflows/pages.yml`, and a line in `README.md`.
- `vite.config.ts`: Vitest also runs `site/**/*.test.js`.
- The author turns GitHub Pages on once (Settings → Pages → Source: GitHub Actions).
- No new dependency.
