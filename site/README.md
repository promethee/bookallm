# Project site

The one-page site published at <https://promethee.github.io/bookallm/>
by `.github/workflows/pages.yml`. Plain HTML, CSS and JavaScript: no
framework, no build step.

- `index.html`: the page.
- `site.js`: every English and French text, the language toggle, and
  the download button.
- `download.js`: which installer fits the visitor's system (tested by
  `download.test.js`, run with `pnpm test`).
- `style.css`: the styles, light and dark.

## Preview locally

The screenshots are not committed here: the workflow copies them from
`docs/images/` when it publishes. To preview, copy them once, then
serve the folder:

```bash
mkdir -p site/images && cp docs/images/*.png site/images/
```

```bash
python -m http.server 4180 --directory site
```

Then open <http://localhost:4180>. `site/images/` is ignored by git.

The download button asks GitHub for the latest release. If that
request fails (offline, or GitHub's limit of 60 requests per hour is
reached), the button links to the releases page instead.
