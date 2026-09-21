// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingestEpub, InMemoryRegistry } from '../ingest';
import { createOllamaClient } from '../ollama';
import { MemoryVectorStore } from '../storage/memory-vectors';
import { embedTexts } from './embed';
import { indexBook } from './indexer';
import { indexStatus } from './status';
import type { IndexProgress } from './types';

/**
 * Manual check of indexing against a real Ollama and a real EPUB. Skipped unless both
 * `OLLAMA_URL` and `EPUB_PATH` are set:
 *
 *   OLLAMA_URL=http://127.0.0.1:11434 EPUB_PATH=path/to/book.epub \
 *     pnpm exec vitest run real-index --reporter=verbose --disable-console-intercept
 *
 * `EMBED_MODEL` picks the embedding model (default `bge-m3`). `MAX_CHAPTERS` limits the
 * run to the first chapters: a whole novel can take hours on a slow computer (about 21
 * seconds per chunk was measured on a busy laptop without a graphics card), and it keeps
 * the machine busy, so this is never part of the normal run.
 * The results are printed for a person to read. The one assertion is a coarse guard
 * against a broken index: the opening sentence of a sample of chunks should find its own
 * chunk among the top 3 most similar. That checks the plumbing (order, ids, vectors of
 * the right chunk), not whether the model understands the book.
 */
const baseUrl = process.env.OLLAMA_URL;
const epubPath = process.env.EPUB_PATH;
const model = process.env.EMBED_MODEL ?? 'bge-m3';

/** Cosine similarity of two vectors of the same length. */
function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** The first sentence of a chunk, or its first 160 characters when there is no clear one. */
function openingSentence(text: string): string {
  const match = /^[\s\S]{20,240}?[.!?…](?=\s|$)/.exec(text.trim());
  return (match?.[0] ?? text.trim().slice(0, 160)).trim();
}

describe.skipIf(!baseUrl || !epubPath)('real indexing (manual check)', () => {
  it(
    'indexes a real book with the real model and finds chunks by their opening sentence',
    { timeout: 40 * 60_000 },
    async () => {
      const client = createOllamaClient({ baseUrl });
      const ingested = await ingestEpub(
        new Uint8Array(readFileSync(epubPath!)),
        {
          registry: new InMemoryRegistry(),
        },
      );
      if (ingested.status !== 'new') throw new Error('expected a new book');
      const limit = Number(process.env.MAX_CHAPTERS) || Infinity;
      const book = {
        ...ingested.book,
        chunks: ingested.book.chunks.filter(
          (chunk) => chunk.locator.chapterNumber <= limit,
        ),
      };
      const chapters = new Set(book.chunks.map((c) => c.locator.chapterNumber));
      console.log(
        `book: "${book.title}", ${book.chapters.length} chapters (${chapters.size} with text), ${book.chunks.length} chunks`,
      );

      // The first request also loads the model into memory, so time it on its own.
      const warmStart = performance.now();
      const warm = await embedTexts(client, model, ['warm up']);
      console.log(
        `first request (model load included): ${Math.round(performance.now() - warmStart)} ms, status ${warm.status}`,
      );
      expect(warm.status).toBe('ok');

      const store = new MemoryVectorStore();
      const started = performance.now();
      let lastChapter = 0;
      const result = await indexBook({
        book,
        model,
        client,
        store,
        onProgress: (progress: IndexProgress) => {
          if (progress.chapterPosition !== lastChapter) {
            lastChapter = progress.chapterPosition;
            console.log(
              `  chapter ${progress.chapterPosition}/${progress.chapterTotal}, chunks ${progress.chunksDone}/${progress.chunksTotal}, ${Math.round((performance.now() - started) / 1000)} s`,
            );
          }
        },
      });
      const seconds = (performance.now() - started) / 1000;
      console.log(
        `indexing result: ${JSON.stringify(result)} in ${seconds.toFixed(1)} s`,
      );
      expect(result).toEqual({ status: 'complete' });
      expect(await indexStatus(book, model, store)).toMatchObject({
        state: 'complete',
      });

      // Load every vector back, keyed by chunk id.
      const normalised = model.includes(':') ? model : `${model}:latest`;
      const vectors = new Map<string, Float32Array>();
      let dimension = 0;
      for (const { chapter } of await store.savedChapters(
        book.hash,
        normalised,
      )) {
        const record = (await store.loadChapter(
          book.hash,
          normalised,
          chapter,
        ))!;
        dimension = record.dimension;
        record.chunkIds.forEach((id, position) =>
          vectors.set(
            id,
            record.vectors.subarray(
              position * dimension,
              (position + 1) * dimension,
            ),
          ),
        );
      }
      console.log(
        `vectors: ${vectors.size} of ${book.chunks.length}, ${dimension} numbers each`,
      );
      expect(vectors.size).toBe(book.chunks.length);

      // Integrity proxy: a chunk's opening sentence should find that chunk in the top 3.
      const step = Math.max(1, Math.floor(book.chunks.length / 40));
      const sample = book.chunks.filter(
        (chunk, position) => position % step === 0 && chunk.text.length > 200,
      );
      const queries = await embedTexts(
        client,
        model,
        sample.map((chunk) => openingSentence(chunk.text)),
      );
      if (queries.status !== 'ok')
        throw new Error('could not embed the queries');

      let top1 = 0;
      let top3 = 0;
      const misses: string[] = [];
      sample.forEach((chunk, position) => {
        const ranked = book.chunks
          .map((other) => ({
            id: other.id,
            score: cosine(queries.vectors[position], vectors.get(other.id)!),
          }))
          .sort((a, b) => b.score - a.score);
        const rank = ranked.findIndex((entry) => entry.id === chunk.id);
        if (rank === 0) top1 += 1;
        if (rank < 3) top3 += 1;
        else
          misses.push(
            `${chunk.id} (rank ${rank + 1}): "${openingSentence(chunk.text).slice(0, 80)}"`,
          );
      });
      console.log(
        `integrity: ${sample.length} sampled chunks, top-1 ${top1}, top-3 ${top3} (${Math.round((100 * top3) / sample.length)}%)`,
      );
      for (const miss of misses) console.log(`  missed: ${miss}`);
      expect(top3 / sample.length).toBeGreaterThanOrEqual(0.8);
    },
  );
});
