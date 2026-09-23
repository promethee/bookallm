// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingestEpub, InMemoryRegistry } from '../ingest';
import { createOllamaClient } from '../ollama';
import { generateClaim } from './generate';

/**
 * Manual check of claim generation against a real Ollama and a real book. Unlike
 * `answering`'s own real-world test, this needs no vector cache and no embedding model:
 * picking a source chunk is local selection over the book's own chunks, not a search.
 * Skipped unless `OLLAMA_URL` and `EPUB_PATH` are set:
 *
 *   OLLAMA_URL=http://127.0.0.1:11434 EPUB_PATH=path/to/book.epub \
 *     pnpm exec vitest run real-claim --reporter=verbose --disable-console-intercept
 *
 * `CHAT_MODEL` picks the chat model (default `llama3.1:8b`). `CLAIM_COUNT` (default 5)
 * how many claims to generate in a row, so a person can read by eye whether the true/
 * changed split looks unpredictable across them, not just correct on any single one.
 *
 * For each claim, prints the claim text, whether it was offered true or changed (and
 * which attribute, when changed), the citation's chapter, and how long it took. The only
 * automated checks are the shape every result must have: a non-empty claim, a citation
 * naming one of the book's own chunks, and (when changed) one of the four known
 * attribute kinds - not whether the claim is actually good, which is for a person to
 * judge from the printed transcript against the source chunk it names.
 */
const baseUrl = process.env.OLLAMA_URL;
const epubPath = process.env.EPUB_PATH;
const chatModel = process.env.CHAT_MODEL ?? 'llama3.1:8b';
const claimCount = Number(process.env.CLAIM_COUNT) || 5;

describe.skipIf(!baseUrl || !epubPath)(
  'real claim generation (manual check)',
  () => {
    it(
      'generates several claims in a row and prints each one for review',
      { timeout: 30 * 60_000 },
      async () => {
        const client = createOllamaClient({ baseUrl });
        const ingested = await ingestEpub(
          new Uint8Array(readFileSync(epubPath!)),
          { registry: new InMemoryRegistry() },
        );
        if (ingested.status !== 'new') throw new Error('expected a new book');
        const { book } = ingested;
        console.log(
          `book: "${book.title}", ${book.chapters.length} chapters, ${book.chunks.length} chunks`,
        );

        const excludeChunkIds: string[] = [];
        for (let i = 0; i < claimCount; i++) {
          const started = performance.now();
          const result = await generateClaim({
            book,
            model: chatModel,
            client,
            excludeChunkIds,
          });
          const seconds = (performance.now() - started) / 1000;

          if (result.status !== 'ok') {
            console.log(
              `\n=== claim ${i + 1} ===\n(${seconds.toFixed(1)} s) FAILED: ${JSON.stringify(result)}`,
            );
            expect(result.status).toBe('ok');
            return;
          }

          const { claim } = result;
          excludeChunkIds.push(claim.citation.chunkId);
          console.log(
            `\n=== claim ${i + 1} (${seconds.toFixed(1)} s) ===\n` +
              `${claim.isTrue ? 'TRUE' : `CHANGED (${claim.changedAttribute})`}: ${claim.claim}\n` +
              `citation: chapter ${claim.citation.locator.chapterNumber} "${claim.citation.locator.chapterTitle}"\n` +
              `source: ${claim.citation.text}`,
          );

          expect(claim.claim.length).toBeGreaterThan(0);
          expect(
            book.chunks.some((chunk) => chunk.id === claim.citation.chunkId),
          ).toBe(true);
          if (!claim.isTrue) {
            expect(['cause', 'order', 'who', 'where']).toContain(
              claim.changedAttribute,
            );
          }
        }
      },
    );
  },
);
