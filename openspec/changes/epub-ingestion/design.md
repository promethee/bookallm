# Design

## Context

Greenfield module in a working scaffold: Svelte + Vite frontend, Vitest (jsdom by default), no ingestion code, no specs yet. README constraints that shape the design: TypeScript is the working language and Rust stays a thin bridge; EPUB's manifest/TOC drives chunking; citations must be exact; the storage choice (SQLite vs flat files) is still open. Motivation and scope: see proposal.md; behavior: see the four delta specs.

## Goals / Non-Goals

**Goals:**
- A pure TypeScript module with no Tauri or DOM dependency, so the same code runs in the webview and in Node tests.
- Deterministic output: same bytes, same chapters, chunks and identifiers.
- A book/chunk shape that later changes (embeddings, retrieval, citations, Verify mode) can rely on without rework.

**Non-Goals:**
- UI, file picking, progress reporting, translated messages.
- On-disk persistence and the storage-technology decision.
- Embeddings, Ollama, retrieval, or any replace/merge behavior for duplicate books.
- Non-EPUB formats.

## Decisions

1. **Module and entry point.** Code lives in `src/lib/ingest/`. One entry, `ingestEpub(bytes, options)` with `options = { filename?, registry, chunking? }`, returns a result union: `existing` (registry entry), `new` (book), `possible-duplicate` (book + candidate entries), or `error` (typed code). Expected failures are returned, never thrown; any unexpected exception during parsing is caught and mapped to `malformed-epub`. Lower-level steps (DRM check, package parsing, text extraction, chunking) are exported separately so they can be unit-tested and reused.
2. **Pipeline order.** Hash the bytes → look up the registry (a hit returns `existing` immediately, skipping all parsing) → unzip → DRM check → container and package parsing → table of contents → chapter assembly → text extraction → chunking → classify as `new` or `possible-duplicate`. DRM runs before content parsing so encrypted content is reported as DRM, not as broken.
3. **Zip: `fflate`.** Small, ESM, works in browser and Node, and supports a filter so only XML/XHTML/NCX/OPF entries are decompressed (images and fonts are skipped, keeping memory low). Alternatives: JSZip (larger, async-only), Rust `epub` crate (contradicts the thin-Rust-bridge stance and adds a Rust recompile).
4. **XML and XHTML: `htmlparser2`** (`parseDocument` plus its DOM utilities, XML mode for package/NCX files). It runs unchanged in Node and the webview. Alternatives: `DOMParser` (absent in Node, so tests would need jsdom and would diverge from production), `epub.js` (DOM-bound, renders books rather than extracting chapter text).
5. **Hash: SHA-256 via WebCrypto** (`crypto.subtle.digest`) over the raw EPUB bytes, as a lowercase hex string; no dependency. The hash is the book id. A repackaged copy of the same book gets a different hash; the possible-duplicate flow covers that case.
6. **DRM rules** (checked in this order, first hit wins): a rights file in the container metadata folder → Adobe; an Apple protection file → Apple FairPlay; a Readium license file → Readium; an encryption description listing any algorithm outside the font-obfuscation allow-list (the IDPF and Adobe font algorithms) → unknown. Only the allow-listed algorithms are treated as non-DRM, so an unrecognised algorithm is rejected, which is the safe direction. No decryption code exists anywhere.
7. **Chapter assembly.** Reading order comes from the package spine; chapter titles and boundaries from the EPUB 3 navigation document, falling back to the EPUB 2 NCX, then to one chapter per spine document. Each entry resolves to a document and optional fragment (paths normalised and URL-decoded, relative to the navigation file). Text extraction records where element ids fall, so a fragment maps to a paragraph position. A chapter runs from its start to the next entry's start; documents no entry references extend the preceding chapter, and text before the first entry becomes a leading chapter. A fragment that cannot be found falls back to the start of its document. Two entries resolving to one position keep both chapters, the later one empty, so numbering matches the book.
8. **Text extraction.** Block-level elements and line breaks end a paragraph; whitespace inside a paragraph is collapsed; entities are decoded; navigation, script, style, head, and SVG content is dropped. Chapter text is its paragraphs joined by a blank line. A paragraph's index is its position in the chapter.
9. **Chunking.** Greedy packing of consecutive paragraphs: close a chunk once it reaches the target size, never exceed the maximum. Defaults are 1000 characters target and 1600 maximum, no overlap, so chunks are contiguous slices and locators stay exact. A paragraph longer than the maximum is split at sentence boundaries (`Intl.Segmenter` with the book's language, with a punctuation-based fallback if unavailable), and at whitespace only when one sentence exceeds the maximum, never inside a surrogate pair. Offsets are UTF-16 code-unit indexes into the chapter text, documented on the types so later stages use them consistently.
10. **Chunk shape and ids.** A chunk has `id`, `text`, and a locator with `chapterNumber` (1-based), `chapterTitle`, `paragraphStart`, `paragraphEnd`, `charStart`, `charEnd`. The id is `<first 16 hex chars of the book hash>:<chapter number>:<chunk position in chapter>`, so it is stable across re-imports and unique across books. Chapters expose their full text and can list their own chunks, which the later "surface the raw chapter" and chapter-filtered retrieval features need.
11. **Registry.** An async interface (`get`, `findByTitleOrFilename`, `add`, `list`, `remove`) so a future SQLite or file-backed store is a drop-in. An in-memory implementation ships now. A shared `normalizeForMatch` (Unicode-normalise, lowercase, trim, collapse whitespace) defines "matching" for titles and filenames, so every implementation agrees. A reusable contract-test suite is exported from `src/lib/ingest/testing/`; the later real store must pass the same suite.
12. **Errors.** `IngestError = { code: 'not-an-epub' | 'malformed-epub' | 'no-text-content' | 'drm-locked'; scheme?: 'adobe' | 'apple' | 'readium' | 'unknown' }`. No display strings in the core; the interface language setting maps codes to messages later.
13. **Tests.** Fixtures are built in test code with a small EPUB builder using `fflate`, so no binary files are committed. Ingestion test files declare the Node environment (docblock) since nothing needs a DOM. Chunking gets property-style checks over generated text (round trip, coverage, size bound, accents and emoji). Real-world EPUBs are checked manually, matching the README's stance that citation accuracy is a judgment call: an opt-in test that runs only when an `EPUB_PATH` environment variable points at a user-supplied file and prints chapter titles and a sample chunk.

## Risks / Trade-offs

- [Real EPUBs are messy: missing ids, odd TOC nesting, non-standard spine] → Layered fallbacks (fragment miss → document start, no TOC → per-document chapters) plus the manual real-book check before calling the change done.
- [Malicious or huge archives] → Only text entries are decompressed, and a cap on total decompressed text size maps to `malformed-epub`.
- [An unknown DRM scheme slips through] → Rejecting any non-font encryption algorithm covers most encrypted content; a scheme that leaves content readable is by definition not blocking ingestion.
- [Title/filename matching gives false positives] → It only produces a prompt-worthy `possible-duplicate`, never an overwrite, so the cost is one extra question.
- [Default chunk sizes may be wrong for retrieval quality] → They are configuration, not spec; retune during the embeddings change with real questions.
- [`Intl.Segmenter` support varies by webview] → Fallback splitter keeps behavior deterministic where it is missing.
- [Hash covers the whole file, so a re-zipped identical book looks new] → Handled by the possible-duplicate flow; no unsafe merge is attempted.

## Open Questions

- What a user's "yes, same book" answer should do to a possible duplicate (replace, keep both, link) is deferred to the import UI and storage changes; this change only reports the possibility and never replaces anything.
