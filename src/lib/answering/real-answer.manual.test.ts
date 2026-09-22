// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingestEpub, InMemoryRegistry } from '../ingest';
import { createOllamaClient } from '../ollama';
import { retrievePassages } from '../retrieval';
import { MemoryVectorStore } from '../storage/memory-vectors';
import type { ChapterVectors } from '../indexing';
import { generateAnswer } from './generate';

/**
 * Manual check of answer generation against a real Ollama and real questions, reusing the
 * vector cache and the answered questions the `passage-retrieval` change already measured.
 * Skipped unless `OLLAMA_URL`, `EPUB_PATH` and `CACHE_FILE` are set:
 *
 *   OLLAMA_URL=http://127.0.0.1:11434 EPUB_PATH=path/to/pg1342.epub \
 *   CACHE_FILE=path/to/pride-vectors.json FIRST_CHAPTER=3 LAST_CHAPTER=15 \
 *     pnpm exec vitest run real-answer --reporter=verbose --disable-console-intercept
 *
 * `CACHE_FILE` must already hold a complete index for the chapters given (produced by
 * `passage-retrieval`'s `real-retrieval.manual.test.ts`, which this test does not redo);
 * if it does not, this fails with a clear message rather than silently indexing here.
 * `CHAT_MODEL` picks the chat model (default `llama3.1:8b`), `EMBED_MODEL` the embedding
 * model retrieval already used (default `bge-m3`).
 *
 * For each question the streamed answer and its resolved citations are printed for a
 * person to read: does the model stay inside the offered passages, are the markers
 * well-formed and resolvable, do the cited passages plausibly support the claim near
 * them. The only automated checks are the shape every answer must have: it names at
 * least one citation, and every citation resolves to an offered passage.
 */
const baseUrl = process.env.OLLAMA_URL;
const epubPath = process.env.EPUB_PATH;
const cacheFile = process.env.CACHE_FILE;
const embedModel = process.env.EMBED_MODEL ?? 'bge-m3';
const chatModel = process.env.CHAT_MODEL ?? 'llama3.1:8b';
const first = Number(process.env.FIRST_CHAPTER) || 1;
const last = Number(process.env.LAST_CHAPTER) || Infinity;

/** Questions reused verbatim from `passage-retrieval`'s real measurement, already known
 * to be answered within chapters 3–15 of the real Pride and Prejudice. A subset: enough
 * to read by eye without an unbounded run, since chat generation, while streamed, still
 * takes real time per answer on a slow machine. */
const QUESTIONS = [
  'Who has taken Netherfield Park?',
  'Why did Mr. Darcy refuse to dance at the assembly?',
  'Where did Mr. Bingley’s fortune come from?',
  'What does Charlotte Lucas advise about showing affection?',
  'What does Mr. Collins write in his letter?',
];

describe.skipIf(!baseUrl || !epubPath || !cacheFile)(
  'real answer generation (manual check)',
  () => {
    it(
      'streams a cited answer for each question and prints it for review',
      { timeout: 30 * 60_000 },
      async () => {
        if (!existsSync(cacheFile!))
          throw new Error(
            `CACHE_FILE ${cacheFile} does not exist. Run passage-retrieval's ` +
              'real-retrieval.manual.test.ts first to build it.',
          );

        const client = createOllamaClient({ baseUrl });
        const ingested = await ingestEpub(
          new Uint8Array(readFileSync(epubPath!)),
          { registry: new InMemoryRegistry() },
        );
        if (ingested.status !== 'new') throw new Error('expected a new book');
        const book = {
          ...ingested.book,
          chunks: ingested.book.chunks.filter(
            (chunk) =>
              chunk.locator.chapterNumber >= first &&
              chunk.locator.chapterNumber <= last,
          ),
        };

        const store = new MemoryVectorStore();
        const records = JSON.parse(readFileSync(cacheFile!, 'utf8')) as (Omit<
          ChapterVectors,
          'vectors'
        > & { vectors: number[] })[];
        for (const record of records)
          await store.saveChapter({
            ...record,
            vectors: Float32Array.from(record.vectors),
          });
        console.log(
          `book: "${book.title}", chapters ${first} to ${last === Infinity ? 'end' : last}, ${book.chunks.length} chunks, ${records.length} chapter records loaded from the cache`,
        );

        for (const question of QUESTIONS) {
          const retrieved = await retrievePassages({
            book,
            question,
            model: embedModel,
            client,
            store,
          });
          if (retrieved.status !== 'ok')
            throw new Error(
              `retrieval failed for "${question}": ${JSON.stringify(retrieved)}`,
            );
          console.log(
            `\n=== ${question} ===\nverdict: ${retrieved.verdict}, top score: ${retrieved.passages[0]?.score.toFixed(4)}`,
          );
          expect(retrieved.verdict).toBe('relevant');

          const started = performance.now();
          const generated = await generateAnswer({
            verdict: retrieved.verdict,
            question,
            passages: retrieved.passages,
            model: chatModel,
            client,
            language: 'en',
          });
          if (generated.status !== 'ok')
            throw new Error(
              `generation failed for "${question}": ${JSON.stringify(generated)}`,
            );

          try {
            for await (const chunk of generated.chunks)
              process.stdout.write(chunk);
            process.stdout.write('\n');
          } catch (error) {
            console.log(`\n[stream error] ${JSON.stringify(error)}`);
            throw error;
          }
          const seconds = (performance.now() - started) / 1000;

          const citations = generated.citations();
          console.log(
            `(${seconds.toFixed(1)} s, ${citations.length} citation(s))`,
          );
          for (const citation of citations) {
            console.log(
              `  [${citation.passageIndex}] -> chapter ${citation.locator.chapterNumber} "${citation.locator.chapterTitle}"`,
            );
          }

          expect(citations.length).toBeGreaterThan(0);
          for (const citation of citations) {
            expect(
              retrieved.passages.some((p) => p.chunkId === citation.chunkId),
            ).toBe(true);
          }
        }
      },
    );
  },
);
