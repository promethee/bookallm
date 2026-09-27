// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ingestEpub, InMemoryRegistry } from '../ingest';
import { createOllamaClient } from '../ollama';
import { generateClaim } from './generate';
import type { ClaimStep, MutationResult } from './types';

/**
 * Manual check of claim generation against a real Ollama and a real book. Unlike
 * `answering`'s own real-world test, this needs no vector cache and no embedding model:
 * picking a source chunk is local selection over the book's own chunks, not a search.
 * Skipped unless `OLLAMA_URL` and `EPUB_PATH` are set:
 *
 *   OLLAMA_URL=http://127.0.0.1:11434 EPUB_PATH=path/to/book.epub \
 *     pnpm exec vitest run real-claim --reporter=verbose --disable-console-intercept
 *
 * `CHAT_MODEL` picks the chat model (default `llama3.1:8b`). `CLAIM_COUNT` (default 20)
 * how many claims to request in a row. Failures do not stop the run: every attempt is
 * printed with each step's raw model reply (from `onStep`), and a tally at the end counts
 * what the reader would have seen, so a before/after comparison of prompt or pipeline
 * changes has numbers, not impressions.
 *
 * The only automated checks are the shape every successful result must have: a non-empty
 * claim, a citation naming one of the book's own chunks, and (when changed) one of the
 * four known attribute kinds - not whether the claim is actually good, which is for a
 * person to judge from the printed transcript against the source chunk it names.
 */
const baseUrl = process.env.OLLAMA_URL;
const epubPath = process.env.EPUB_PATH;
const chatModel = process.env.CHAT_MODEL ?? 'llama3.1:8b';
const claimCount = Number(process.env.CLAIM_COUNT) || 20;

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

function describeStep(step: ClaimStep): string {
  switch (step.stage) {
    case 'pick':
      return `  pick     ${step.chunkId}`;
    case 'extract':
      return `  extract  ${step.kind ?? '-'} ${step.outcome} (${step.ms} ms): ${oneLine(step.raw)}`;
    case 'mutate':
      return `  mutate#${step.attempt} ${step.kind ?? '-'} ${step.outcome}${step.reason ? ` (${step.reason})` : ''} (${step.ms} ms): ${oneLine(step.raw)}`;
    case 'verify':
      return `  verify#${step.attempt} ${step.outcome} (${step.ms} ms): ${oneLine(step.raw)}`;
  }
}

/** Counters for the end-of-run summary. */
interface Tally {
  offeredTrue: number;
  offeredChanged: Record<string, number>;
  failed: Record<string, number>;
  /** Mutation attempt number (0-based) at which a change was confirmed. */
  confirmedAtAttempt: Record<number, number>;
  extractNone: Record<string, number>;
  rejected: Record<string, number>;
  /** Attempts that picked more than one chunk (a fresh-passage attempt). */
  freshPassageAttempts: number;
  chapters: Record<string, number>;
  seconds: number[];
}

const bump = <K extends string | number>(record: Record<K, number>, key: K) => {
  record[key] = (record[key] ?? 0) + 1;
};

function recordAttempt(
  tally: Tally,
  result: MutationResult,
  steps: ClaimStep[],
  seconds: number,
) {
  tally.seconds.push(seconds);
  if (result.status === 'ok') {
    const { claim } = result;
    if (claim.isTrue) tally.offeredTrue += 1;
    else bump(tally.offeredChanged, claim.changedAttribute ?? '?');
    bump(tally.chapters, claim.citation.locator.chapterTitle);
  } else if (result.status === 'failed') {
    bump(tally.failed, result.error.code);
  } else {
    bump(tally.failed, 'aborted');
  }
  for (const step of steps) {
    if (step.stage === 'verify' && step.outcome === 'confirmed')
      bump(tally.confirmedAtAttempt, step.attempt);
    if (step.stage === 'extract' && step.outcome !== 'claim')
      bump(
        tally.extractNone,
        `${step.kind ?? '?'}${step.outcome === 'too-short' ? ' (too short)' : ''}`,
      );
    if (step.stage === 'mutate' && step.outcome === 'rejected')
      bump(tally.rejected, step.reason ?? '?');
    if (step.stage === 'verify' && step.outcome === 'not-confirmed')
      bump(tally.rejected, 'still-true');
  }
  if (steps.filter((step) => step.stage === 'pick').length > 1)
    tally.freshPassageAttempts += 1;
}

function printTally(tally: Tally) {
  const sorted = [...tally.seconds].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const max = sorted.at(-1) ?? 0;
  const format = (record: Record<string | number, number>) =>
    Object.entries(record)
      .map(([key, count]) => `${key}: ${count}`)
      .join(', ') || '-';
  const changed = Object.values(tally.offeredChanged).reduce(
    (sum, count) => sum + count,
    0,
  );
  const failed = Object.values(tally.failed).reduce(
    (sum, count) => sum + count,
    0,
  );
  console.log(
    [
      '',
      `=== tally: ${tally.seconds.length} attempts ===`,
      `offered true:        ${tally.offeredTrue}`,
      `offered changed:     ${changed} (${format(tally.offeredChanged)})`,
      `failed:              ${failed} (${format(tally.failed)})`,
      `confirmed at try #:  ${format(tally.confirmedAtAttempt)}`,
      `rejected changes:    ${format(tally.rejected)}`,
      `extraction NONE:     ${format(tally.extractNone)}`,
      `fresh passage tries: ${tally.freshPassageAttempts}`,
      `time per attempt:    median ${median.toFixed(1)} s, max ${max.toFixed(1)} s`,
      `claim chapters:      ${format(tally.chapters)}`,
    ].join('\n'),
  );
}

describe.skipIf(!baseUrl || !epubPath)(
  'real claim generation (manual check)',
  () => {
    it(
      'generates several claims in a row and prints each one, then a tally',
      { timeout: 60 * 60_000 },
      async () => {
        const client = createOllamaClient({ baseUrl });
        const ingested = await ingestEpub(
          new Uint8Array(readFileSync(epubPath!)),
          { registry: new InMemoryRegistry() },
        );
        if (ingested.status !== 'new') throw new Error('expected a new book');
        const { book } = ingested;
        console.log(
          `book: "${book.title}", ${book.chapters.length} chapters, ${book.chunks.length} chunks, model ${chatModel}`,
        );

        const tally: Tally = {
          offeredTrue: 0,
          offeredChanged: {},
          failed: {},
          confirmedAtAttempt: {},
          extractNone: {},
          rejected: {},
          freshPassageAttempts: 0,
          chapters: {},
          seconds: [],
        };
        const excludeChunkIds: string[] = [];
        for (let i = 0; i < claimCount; i++) {
          const steps: ClaimStep[] = [];
          const started = performance.now();
          const result = await generateClaim({
            book,
            model: chatModel,
            client,
            excludeChunkIds,
            onStep: (step) => steps.push(step),
          });
          const seconds = (performance.now() - started) / 1000;
          recordAttempt(tally, result, steps, seconds);

          const header = `\n=== attempt ${i + 1} (${seconds.toFixed(1)} s) ===`;
          const trace = steps.map(describeStep).join('\n');
          if (result.status !== 'ok') {
            console.log(
              `${header}\nFAILED: ${JSON.stringify(result)}\n${trace}`,
            );
            continue;
          }

          const { claim } = result;
          excludeChunkIds.push(claim.citation.chunkId);
          console.log(
            `${header}\n` +
              `${claim.isTrue ? 'TRUE' : `CHANGED (${claim.changedAttribute})`}: ${claim.claim}\n` +
              `citation: chapter ${claim.citation.locator.chapterNumber} "${claim.citation.locator.chapterTitle}"\n` +
              `${trace}\n` +
              `source: ${oneLine(claim.citation.text)}`,
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

        printTally(tally);
      },
    );
  },
);
