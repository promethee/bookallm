# Tasks

## 1. The page

- [x] 1.1 Write `site/download.js` (`detectSystem`, `pickAssets`, design decision 2) and `site/download.test.js`, and add `site/**/*.test.js` to Vitest's includes; verify the tests cover each system, a Mac's two installers, a missing asset and an unknown system
- [x] 1.2 Write `site/index.html`, `site/style.css` and `site/site.js` (content from the proposal, languages per design decision 3, download button with its fallback); verify in the browser at desktop and phone widths, in both languages and both colour schemes, and with the API request blocked
- [x] 1.3 Run lint and format on `site/` and `pnpm test`, then commit ("Add the project site")

## 2. Publishing

- [x] 2.1 Write `.github/workflows/pages.yml` (design decisions 4 and 5) and `site/README.md` (how to preview locally); verify the YAML parses
- [x] 2.2 Add a link to the site near the top of the README; verify with markdownlint, then commit ("Publish the site with GitHub Pages")
- [ ] 2.3 The author turns Pages on (Settings → Pages → Source: GitHub Actions) and pushes; check `https://promethee.github.io/bookallm/` loads, shows the screenshots and offers the right installer

## 3. Wrap-up

- [ ] 3.1 Note the site in INTENT.md's Roadmap, then commit ("Finish project-site")
