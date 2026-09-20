# Proposal

## Why

BookaLLM answers questions from a book's own text, so nothing else in the product (embeddings, Ask mode, Verify mode, citations) can start until an EPUB can be turned into structured, citable text. The README fixes the rules for this step (EPUB only, native chapter structure, DRM rejected, re-import detected by hash) but none of it exists in code yet. The tooling scaffold (see the archived `bootstrap-project` change) is ready to build on.

## What Changes

- Add an ingestion core that takes an EPUB's bytes and returns either a structured book (metadata, chapters, chunks, content hash) or a typed error.
- Read the EPUB's manifest, spine and table of contents to define chapters, instead of treating the book as flat text.
- Detect DRM before any content is read and reject with a distinct error; font obfuscation is not treated as DRM.
- Split each chapter's text into citable chunks that carry an exact locator back into the chapter text.
- Hash the EPUB's bytes and compare against a registry of known books to classify an import as existing, new, or a possible duplicate.
- Define the registry as an interface with an in-memory implementation and a reusable contract-test suite. The real store is a later change.
- Errors are stable codes; the friendly, translatable wording belongs to the UI.
- Out of scope: any UI (file picker, drag-drop, progress), on-disk persistence, embeddings, Ollama, and any replace/merge operation for duplicate books.

## Capabilities

### New Capabilities

- `epub-import`: accept an EPUB and produce a structured book (metadata, chapters from the TOC/spine); reject files that are not usable EPUBs.
- `drm-detection`: recognise DRM-locked EPUBs and reject them with a specific error, without treating font obfuscation as DRM.
- `chapter-chunking`: split chapters into citable chunks with exact locators into chapter text.
- `reimport-detection`: hash imports and classify them against a registry (existing, new, possible duplicate) without ever overwriting a book silently.

### Modified Capabilities

None (no specs exist yet).

## Impact

- New code under `src/lib/ingest/` with colocated Vitest tests; EPUB fixtures are generated in tests, no binary files committed.
- New runtime dependencies: a zip library and an HTML/XML parser (chosen in design.md).
- No Rust or `tauri.conf.json` change, no new Tauri plugins, so no Rust recompile.
- Later changes (import UI and onboarding, embeddings and retrieval, storage) consume this API; the shape of the book record and chunk locators is the contract they rely on.
