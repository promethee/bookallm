# Design

## Context

- `README.md` today: Positioning, Scope, Platform, Tech Stack, Architecture (with v1 Ask mode, v1.1 Verify mode, v2 moves), Corroboration layer, Onboarding, UI/UX, Tooling & Process, License, Status. It is referred to as the source of truth by `openspec/config.yaml` (`context`), by past OpenSpec changes and by the project memory.
- The user's `AGENTS.md` asks for a README that explains how to use the project, its dependencies and how to install them, ending with a section on the LLM used, the tokens used, the time taken and the memory used.
- There are no release builds yet (the release pipeline is the last v1 item), so "how to run it" is building from source for now.
- Playwright and its Chromium are installed; the dev server runs on port 5287; the local Ollama has `llama3.1:8b` and `bge-m3` on this GPU machine; *Candide* (Project Gutenberg #19942) is the real book used in every real-world check.

## Goals / Non-Goals

**Goals:**

- One rule keeps the two files from drifting: **the README summarises, INTENT decides.** The README never states a decision INTENT does not hold; it links to INTENT for the why.

**Non-Goals:**

- The Pages site; screenshots of the desktop tray (the browser build cannot show it).

## Decisions

### 1. `git mv`, then trim INTENT's Status into a Roadmap

`git mv README.md INTENT.md` keeps `git log --follow` working. INTENT's title becomes "BookaLLM — Intent". Its Status section, which grew into a feature list, is replaced by a Roadmap: v1 remaining (SQLite storage, command palette to explore, release pipeline), v1 done (one line pointing to the README), and v2. The feature list moves to the README's "What works today".

### 2. README outline

1. Title, one-sentence pitch, one paragraph on who it is for (a reader who has read or is studying the book) and what it is not (a summary shortcut).
2. What it does: Ask mode with exact citations; Verify mode; recovery when nothing is found; everything local (the book, the questions and the answers never leave the computer).
3. Screenshots (three: a cited answer, a Verify reveal, a chapter hand-over).
4. Requirements: Windows (macOS and Linux not tested yet), Ollama, the two models and their sizes, a GPU recommended with the measured difference (seconds against minutes).
5. Getting started: build from source (release downloads come with the release pipeline).
6. Where to find free EPUBs, in French and in English (public-domain sources, checked to be reachable and to offer DRM-free EPUB).
7. Status and roadmap: what works today, and a link to INTENT's Roadmap.
8. Development: commands (dev, tests, e2e, lint, format, Tauri build), `MANUAL_TESTS.md`, OpenSpec and `INTENT.md`.
9. License (MIT).
10. How this was built: Claude Code with Claude Opus 5.5, the OpenSpec workflow, and the usage figures `AGENTS.md` asks for, stated as what is actually known (per-session figures where available, clearly marked as approximate otherwise).

### 3. Screenshots by a script, not by hand

`scripts/screenshots.ts`, run with `pnpm screenshots`, drives Chromium through Playwright against the dev server and the real local Ollama: imports a given EPUB (path as an argument), waits for indexing, asks a question, takes a claim in Verify mode, and forces a chapter hand-over with an off-topic question, saving 1280×800 PNGs to `docs/images/`. A script means the screenshots can be redone after a UI change instead of going stale. It is not part of the test suites (it needs a real Ollama and minutes of model time).

### 4. EPUB sources

Only sources that offer DRM-free public-domain EPUB downloads, checked in the browser before listing: for English, Project Gutenberg and Standard Ebooks; for French, Ebooks libres et gratuits, Bibebook and Wikisource (EPUB export). Each with one line on what it offers. No links to anything else.

## Risks / Trade-offs

- [README and INTENT drift apart] → The rule in Goals; the README links to INTENT for every "why".
- [Screenshots show machine-generated French or English that later changes] → The script regenerates them.
- [Usage figures for "tokens, time, memory" are incomplete across sessions and machines] → State what is measured and label estimates as such, never invent precision.

## Migration Plan

Documentation only. Rollback: revert the commits.
