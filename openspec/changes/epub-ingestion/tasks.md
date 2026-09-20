# Tasks

## 1. Foundations

- [x] 1.1 Add `fflate` and `htmlparser2` as dependencies; verify `pnpm install --frozen-lockfile` succeeds and `pnpm peers check` reports no issues
- [x] 1.2 Define the shared types in `src/lib/ingest/types.ts` (book, chapter, chunk with locator, registry entry, error codes and DRM schemes, ingest result union, options), documenting that offsets are UTF-16 indexes; verify `pnpm typecheck` passes
- [x] 1.3 Write a test-only EPUB builder in `src/lib/ingest/testing/epub-builder.ts` that produces EPUB 2 and EPUB 3 archives with configurable metadata, spine, table of contents, extra files and encryption description; verify a builder test unzips its output and finds the expected entries
- [x] 1.4 Commit checkpoint: "Add ingestion types and EPUB test builder"

## 2. EPUB import (package parsing)

- [x] 2.1 Implement archive reading that decompresses only text entries and enforces a total-size cap; verify tests cover a valid archive, a non-zip input (`not-an-epub`), and an over-cap archive (`malformed-epub`)
- [x] 2.2 Implement container and package parsing (metadata, manifest, spine) with the `not-an-epub` and `malformed-epub` cases; verify tests for the missing-container, missing-package, empty-spine and missing-document scenarios pass
- [x] 2.3 Verify metadata extraction with tests for EPUB 3, EPUB 2 and a missing title (empty title, no error)
- [x] 2.4 Commit checkpoint: "Add EPUB package parsing"

## 3. DRM detection

- [x] 3.1 Implement DRM detection (rights file, Apple protection file, Readium license, non-font encryption algorithms, font-obfuscation allow-list); verify one test per scheme scenario and one for unknown encryption
- [x] 3.2 Verify a font-obfuscation-only EPUB imports normally and that a DRM EPUB with unparseable content returns `drm-locked`, not `malformed-epub`
- [x] 3.3 Commit checkpoint: "Add DRM detection"

## 4. Chapters and text

- [x] 4.1 Implement text extraction (paragraph boundaries, entity decoding, whitespace collapsing, skipping navigation/script/style/SVG, recording element ids); verify tests for markup and entities, non-content elements, and identical output on repeated runs
- [x] 4.2 Implement table-of-contents reading (EPUB 3 navigation document, EPUB 2 NCX, nesting flattened, path normalisation); verify tests for both formats and nested entries
- [x] 4.3 Implement chapter assembly (fragment boundaries, multi-document spans, leading text, no-TOC fallback, empty chapters keep their number); verify a test for each scenario in the epub-import spec
- [x] 4.4 Return `no-text-content` when no chapter has text; verify with an image-only fixture
- [x] 4.5 Commit checkpoint: "Add chapter assembly and text extraction"

## 5. Chunking

- [x] 5.1 Implement paragraph-aware chunking with target and maximum sizes, sentence-level splitting (`Intl.Segmenter` plus fallback), surrogate-safe hard splits, defaults documented in code; verify unit tests for paragraph-aligned, oversized-paragraph and configured-size scenarios
- [x] 5.2 Add locators (chapter number, title, paragraph range, character range) and stable chunk ids; verify a test that every chunk's text equals its chapter text at its range, and a test that ids repeat across two runs
- [x] 5.3 Verify with property-style tests over generated text (including accented and emoji text) that ranges never cross chapters, cover every non-whitespace character, and never exceed the maximum size
- [x] 5.4 Expose chapter lookup (full text and own chunks); verify chapter 7 returns no chunk from another chapter, and an empty chapter keeps its number with no chunks
- [x] 5.5 Commit checkpoint: "Add chapter chunking"

## 6. Hash and re-import detection

- [x] 6.1 Implement the content hash (SHA-256 over the bytes, lowercase hex); verify identical bytes match and a one-byte change differs
- [x] 6.2 Implement `normalizeForMatch` and the in-memory registry behind the registry interface; verify with the exported contract-test suite (add and find, duplicate hash rejected, remove leaves no trace)
- [x] 6.3 Implement classification (`existing`, `new`, `possible-duplicate` by title or filename); verify tests for same-title-different-case, same-filename-different-title, no match, and that no existing entry is modified
- [x] 6.4 Commit checkpoint: "Add re-import detection"

## 7. Orchestration

- [x] 7.1 Implement `ingestEpub` (hash, registry lookup, DRM check, parse, chunk, classify) with catch-all mapping to `malformed-epub`; verify an integration test per outcome (`existing` produces no chunks, `new`, `possible-duplicate`, each error code)
- [x] 7.2 Verify a DRM-locked EPUB produces no chapters, chunks or registry entry, and that a repeated ingest of the same bytes yields identical books
- [x] 7.3 Export the public API from `src/lib/ingest/index.ts`; verify `pnpm typecheck` and `pnpm lint` pass with no unused exports flagged
- [x] 7.4 Commit checkpoint: "Add ingestEpub entry point"

## 8. Real-book check and wrap-up

- [x] 8.1 Add an opt-in test that runs only when `EPUB_PATH` is set and prints title, chapter titles and one sample chunk; verify `pnpm test` still passes with the variable unset
- [ ] 8.2 Download one public-domain EPUB (one English, one French if size allows) from a legal public source such as Project Gutenberg into the scratchpad, never into the repo, after stating filename, source and size and getting the user's yes; run the opt-in test on it and manually compare chapter count, titles and one sampled chunk against the book's text; record the result in the change's final summary
- [ ] 8.3 Verify `pnpm check` passes end to end and CI is green on the pushed branch
- [ ] 8.4 Commit checkpoint: "Finish epub-ingestion", then archive the change
