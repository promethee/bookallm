# BookaLLM

A local, installable AI study companion for books. Ask questions
like "why does character X act that way?" and get an answer grounded
in the actual text, with precise citations back to the source — not
a summary shortcut.

## Positioning

AI reading aids can misstate what a text actually says. This app
treats that as a feature: it trains you to verify claims against
the primary source, rather than take them on trust — every answer
ships with an exact citation so you can check it yourself. That's
the skill the product exists to build.

This is a study tool, not a reading-replacement tool. Target user:
someone who has read (or is actively studying) the book and wants
to test their own understanding against it — not someone who wants
a plot dump instead of doing the reading.

## Scope

- Input format: EPUB, using its native manifest/TOC structure for
  chapter-aware chunking rather than treating it as flat text.
- The user supplies their own EPUB files. The project's GitHub page
  lists French and English sites where public-domain EPUBs can be
  downloaded.
- DRM-locked EPUBs are detected at ingestion and rejected with a
  clear error message. No DRM stripping is built into the app —
  legal risk, out of scope. User must supply a non-DRM copy.
- Interface language is a user-selectable setting (not tied to the
  embedding model's language support).

## Platform

Installable desktop app (Tauri), not a web deploy — this is a
portfolio piece meant to be run locally, not hosted. Uses local
Ollama for the LLM, matching the existing local-first stack (same
pattern as `learnback`). Default model: `llama3.1:8b` (128K
context, runs on ~8GB, widest compatibility). Model name is a
user-editable setting, not hardcoded — `command-r:35b` (RAG-tuned,
native citation grounding) is the recommended upgrade path for
users with more VRAM. The existing GitHub Actions release pipeline
(tauri-action matrix build across macOS/Linux/Windows) is reusable
here.

## Tech Stack

- Language: TypeScript
- Frontend: Svelte + Tailwind CSS
- Package manager: pnpm
- Dev environment: Windows, Git Bash (MINGW64)
- Rust: required by Tauri's native/core layer, not a general
  language choice for this project — not a language the dev codes
  in directly beyond that thin bridge; brief in-code comments for
  Rust-specific syntax/concepts, not line-by-line prose explanations
- Agent: Claude Code

## Architecture

- No model fine-tuning. A general-purpose local LLM + RAG over the
  ingested book text handles both modes below — training a model
  from scratch on a single book's text lacks sufficient data for
  coherent language modeling, and fine-tuning for style doesn't
  reliably reproduce exact text on demand; citation is a retrieval
  problem, not a training problem.
- Vector store: SQLite + a vector extension, or flat-file embeddings.
  No dedicated vector DB needed at this scale.
- Citations are precise (exact passage/chapter), never vague — vague
  citations (e.g. "it's in chapter 3") were considered and rejected:
  they cost the real target user (who needs quotable evidence) far
  more than they'd deter a determined lazy user.
- Embedding model: `bge-m3` by default (multilingual, matches the
  French+English audience). `nomic-embed-text` documented as a
  lighter, English-leaning fallback for low-resource machines.
- Session shape: single active book per session for v1. Multi-book
  library (switcher, per-book index management) is v2 scope.
- Systray/idle behavior: app stays resident in systray for instant
  reopen; the Ollama model unloads after a configurable idle timeout
  (sensible default, e.g. 10 min) to avoid holding VRAM/RAM
  indefinitely. First message after idle reload takes a few seconds
  longer — accepted tradeoff over permanent resource cost.
- Re-import handling: EPUB content is hashed on import against a
  local index registry. Matching hash → skip re-indexing, load
  existing index. No hash match → treated as a new/distinct book
  by default, never silently overwritten (avoids citations pointing
  to the wrong edition); if the filename/title matches an existing
  entry, prompt the user to confirm whether it's the same book
  before proceeding, but still index as distinct if unconfirmed or
  declined.
- Deleting a book removes its index but never the user's original
  EPUB file — the app only manages what it built, not the user's
  files. Disclosed to the user at delete time (e.g. "this removes
  BookaLLM's index — your EPUB file stays where it is").
- Storage: sensible default location for index/settings; user-
  configurable path is a later-version enhancement, not v1.
- Retrieval failure recovery: if the user points to a location after
  a failed retrieval (e.g. "try chapter 7"), the app does a
  metadata-filtered lookup by chapter, not another semantic search
  against the same failed query.
- Context management: long sessions require conversation history
  trimming to stay fast on modest local hardware. User-provided
  location hints (in response to a failed retrieval) are pinned and
  excluded from trimming, so a clarification given several turns ago
  isn't silently dropped right when it's needed.
- Retrieval failure escalation: if a metadata-filtered retry (per
  the location hint) also fails, stop asking and surface the raw
  chapter text directly for the user to scan — no further AI
  synthesis attempt. Capped at one retry to avoid a repeated-
  non-answer loop, which erodes trust the same way false confidence
  does. Handing over the primary source when the AI can't help is
  consistent with the app's core positioning, not a fallback outside
  of it.

### v1 — Ask mode

Sincere, RAG-grounded Q&A. User asks a question, the AI answers
with the model's general knowledge for context where useful, and
every factual claim carries a citation back to the exact passage —
so the answer is checkable, not just asserted. Response style:
concise, dense, often Socratic (a follow-up question rather than a
full dump) — chosen for pedagogical value, not as friction against
misuse. When retrieval finds nothing relevant to a question, the AI
says so plainly and asks the user to point toward where it might
be — e.g. "I can't find anything about that — could you tell me
where in the book that comes up?" Never phrased as "this isn't in
the book," since that's an unverifiable claim in its own right and
undermines the same verifiability positioning the app is built on.

### v1.1 — Verify mode

Retrieve a real passage/fact via RAG, then deliberately mutate one
concrete attribute (cause, order of events, who did/said it, where)
while keeping everything else accurate. Present the claim to the
user, who judges true/false, then reveal the citation. Distinct
generation pipeline from Ask mode (retrieve → mutate → verify the
mutation actually contradicts the source), not a variant of the
normal answer flow. Built after Ask mode, since it reuses its
RAG/citation pipeline. Calibration risk: too obvious and the user
stops checking; too subtle and it reads as a gotcha — needs testing,
not a one-shot prompt. Difficulty is flat only in v1.1 (same
mutation mechanic every time, session-only tally shown to user); the
data model reserves a difficulty field for future use, but no
user-facing toggle until adaptive mode (v2) is actually built — a
toggle with only one working option is dead UI. A full reversal of
this idea — the AI quizzing the user to verify they've actually read
the book, with dialogue traps — was considered and shelved in favor
of this direction; closer prior art exists there (ReadnQuiz,
AgentDock's chapter check-in quizzes) and it reverses who's being
verified. Kept as an option for a separate, distinct project
instead.

An optional lightweight "I've read up through X" progress marker is
worth considering later, to tailor relevance in either mode — not as
strict spoiler-gating.

## Corroboration layer (v2 candidate, not v1)

MiniCPM5-1B, run locally via Ollama, considered as a tool-calling
layer to check factual/historical claims the text makes against the
web. Scoped narrowly: useful for verifying facts, not for judging
literary interpretation — there's often nothing online to check an
original reading of a character's motivation against. Cut from v1:
a second model plus its still-immature tool-call parsing is
disproportionate risk for a portfolio build.

## Onboarding

1. Detect Ollama on launch. Missing → friendly, plain-language
   walkthrough to install it (not a bare link or technical
   instructions) — target users are readers, not developers, and
   shouldn't be expected to already know what Ollama is.
2. Show recommended default models (`llama3.1:8b`, `bge-m3`) with a
   friendly disclosure of what's happening and why it takes a
   while ("downloading the AI model that reads your books — this
   is a one-time step, may take a few minutes"). Confirm or let the
   user swap before pulling — no silent multi-GB downloads.
3. EPUB import (drag-drop or file picker) → DRM check → chunking/
   embedding with a friendly, plain-language wait state ("getting
   to know this book — indexing chapter 4 of 22…"), not just a raw
   progress bar. Indexing isn't instant; the UX job is to make the
   wait feel accounted for, not to pretend it's fast.
4. Land in Ask mode. No onboarding wizard needed beyond this — one
   persistent, concise disclosure of current mode and what it means
   (see UI/UX) carries the explanation without a multi-step tutorial.

## UI/UX

- Top bar: book dropdown (fast switching between indexed books) +
  Ask/Verify mode tabs, both visible and switchable at a glance.
- Ask mode and Verify mode must be visually distinct (color/layout),
  so Verify mode's deliberately planted false claims don't bleed
  distrust into Ask mode's sincere answers.
- Command palette (Ctrl/Cmd+K) as a power-user accelerant for
  book/mode switching, layered on top of the top bar — not a
  replacement for it, since a portfolio reviewer clicking around
  won't know the shortcut exists.
- Persistent disclosure at the top of the window naming the current
  mode and what it does in one line (e.g. "Ask mode — answers are
  cited, check them" / "Verify mode — one claim below may be
  false"). Always visible, not a one-time hint — this is the
  ongoing "friendly guide" for a non-technical, book-focused
  audience, and it's also what keeps Verify mode's planted false
  claims from bleeding distrust into Ask mode.
- Errors fail loud with a friendly, plain-language message — never
  silently. Specific error cases are resolved during implementation
  spec phases, not pre-enumerated here.

## Tooling & Process

- Linting/formatting: ESLint + Prettier (TS/Svelte), rustfmt for the
  Rust bridge layer.
- Line endings: `.gitattributes` normalizes to LF repo-wide
  (`* text=auto eol=lf`), with `*.bat text eol=crlf` as the
  deliberate exception — the existing macOS/Linux/Windows release
  matrix makes CRLF/LF drift a real risk, not theoretical.
- Testing: Vitest (unit), Playwright (e2e). No Gherkin/BDD layer —
  its payoff is non-technical stakeholders reading feature files,
  which doesn't apply to a solo project.
- Git hooks: husky + lint-staged on pre-commit (staged files only);
  full test suite on pre-push.
- CI (GitHub Actions) runs lint + full test suite on push, in
  addition to local hooks — this is what actually enforces the
  regression-prevention rule, since local pre-push hooks can be
  bypassed. Set up early, not retrofitted after drift happens.
- Testing scope: automate what's mechanically checkable (code
  correctness, UI flows, retrieval invocation, mutation-pipeline
  structure). Citation accuracy and answer/mutation quality are
  judged manually — that's a semantic judgment call, not a
  deterministic test, and isn't pretended to be automated.
- Commit checkpoints: commit at each completed logical unit (a spec
  phase, a working feature slice), not one large commit at the end —
  keeps a bad step revertible without losing unrelated progress.
- Claude Code must not alter core decisions (positioning, mode
  split, tech stack, rejected approaches) mid-build without
  explicitly flagging the change back to the user first — silent
  scope drift is not acceptable.

## License

MIT.

## Status

Direction and naming decided. Project scaffold and tooling are in place
(Tauri + Svelte shell, lint/format/test hooks, CI). No product features
yet.
