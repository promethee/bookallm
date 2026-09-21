// @vitest-environment node
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexBook } from '../indexing';
import type { ChapterVectors } from '../indexing';
import { ingestEpub, InMemoryRegistry } from '../ingest';
import { createOllamaClient } from '../ollama';
import { MemoryVectorStore } from '../storage/memory-vectors';
import { RELEVANCE_CUTOFF } from './defaults';
import { retrievePassages } from './retrieve';
import type { RetrievalResult } from './types';

/**
 * Manual measurement of retrieval against a real Ollama and a real EPUB, used to choose
 * the relevance cutoff. Skipped unless `OLLAMA_URL` and `EPUB_PATH` are set:
 *
 *   OLLAMA_URL=http://127.0.0.1:11434 EPUB_PATH=path/to/pg1342.epub \
 *   CACHE_FILE=path/to/vectors.json FIRST_CHAPTER=3 LAST_CHAPTER=15 \
 *     pnpm exec vitest run real-retrieval --reporter=verbose --disable-console-intercept
 *
 * It indexes chapters `FIRST_CHAPTER` to `LAST_CHAPTER` (table-of-contents numbers) with
 * the real model, which takes a long time on a slow computer. `CACHE_FILE` keeps the
 * vectors between runs, so an interrupted run resumes and changing the questions costs no
 * more embedding of the book. `EMBED_MODEL` picks the model (default `bge-m3`).
 *
 * Then it asks questions of three kinds and prints the best scores:
 * - answered: the indexed chapters answer them (and the chapter that should come back is
 *   listed);
 * - unrelated: nothing to do with the book;
 * - absent: about the book's subject but not in the indexed chapters.
 * The cutoff belongs in the gap between the lowest answered score and the highest
 * unrelated one. The one assertion is that the two groups do not overlap.
 */
const baseUrl = process.env.OLLAMA_URL;
const epubPath = process.env.EPUB_PATH;
const cacheFile = process.env.CACHE_FILE;
const model = process.env.EMBED_MODEL ?? 'bge-m3';
const first = Number(process.env.FIRST_CHAPTER) || 1;
const last = Number(process.env.LAST_CHAPTER) || Infinity;

/** Vectors kept in memory and mirrored to a file after every saved chapter. */
class FileCachedStore extends MemoryVectorStore {
  constructor(private readonly file: string | undefined) {
    super();
  }

  async load(): Promise<void> {
    if (!this.file || !existsSync(this.file)) return;
    const records = JSON.parse(readFileSync(this.file, 'utf8')) as (Omit<
      ChapterVectors,
      'vectors'
    > & { vectors: number[] })[];
    for (const record of records)
      await super.saveChapter({
        ...record,
        vectors: Float32Array.from(record.vectors),
      });
  }

  override async saveChapter(record: ChapterVectors): Promise<void> {
    await super.saveChapter(record);
    if (!this.file) return;
    const all: (Omit<ChapterVectors, 'vectors'> & { vectors: number[] })[] = [];
    for (const name of await this.modelsWithVectors(record.hash))
      for (const { chapter } of await this.savedChapters(record.hash, name)) {
        const saved = (await this.loadChapter(record.hash, name, chapter))!;
        all.push({ ...saved, vectors: Array.from(saved.vectors) });
      }
    writeFileSync(`${this.file}.tmp`, JSON.stringify(all));
    renameSync(`${this.file}.tmp`, this.file);
  }
}

interface Answered {
  question: string;
  /** Table-of-contents chapter numbers where the answer is. */
  chapters: number[];
}

const ANSWERED: Answered[] = [
  { question: 'Who has taken Netherfield Park?', chapters: [3, 4] },
  {
    question: 'Why did Mr. Darcy refuse to dance at the assembly?',
    chapters: [5],
  },
  {
    question: 'What does Mr. Darcy say about Elizabeth at the ball?',
    chapters: [5],
  },
  { question: 'Where did Mr. Bingley’s fortune come from?', chapters: [6, 7] },
  { question: 'Who is Sir William Lucas?', chapters: [7] },
  {
    question: 'Why does Jane go to Netherfield on horseback in the rain?',
    chapters: [9],
  },
  {
    question: 'What is Mr. Bennet’s estate, and who will inherit it?',
    chapters: [9, 15],
  },
  {
    question: 'What does Charlotte Lucas advise about showing affection?',
    chapters: [8],
  },
  {
    question:
      'How do Miss Bingley and Mrs. Hurst treat Elizabeth at Netherfield?',
    chapters: [10, 11, 12],
  },
  { question: 'What does Mr. Collins write in his letter?', chapters: [15] },
];

const UNRELATED = [
  'How does photosynthesis work?',
  'What is the capital of Japan?',
  'How do I install a Python package?',
  'What is the boiling point of water at sea level?',
  'Who won the football world cup in 2018?',
  'What is a good recipe for chocolate cake?',
];

const ABSENT = [
  'What happens when Elizabeth visits Pemberley?',
  'Who does Lydia run away with?',
  'How does Elizabeth answer Mr. Darcy’s first proposal of marriage?',
  'What does Lady Catherine de Bourgh say to Elizabeth in her garden?',
];

const snippet = (text: string) => text.replace(/\s+/g, ' ').slice(0, 90);

describe.skipIf(!baseUrl || !epubPath)(
  'real retrieval (manual measurement)',
  () => {
    it(
      'measures best scores for answered, unrelated and absent questions',
      { timeout: 4 * 60 * 60_000 },
      async () => {
        const client = createOllamaClient({ baseUrl });
        const ingested = await ingestEpub(
          new Uint8Array(readFileSync(epubPath!)),
          {
            registry: new InMemoryRegistry(),
          },
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
        console.log(
          `book: "${book.title}", chapters ${first} to ${last === Infinity ? 'end' : last}, ${book.chunks.length} chunks`,
        );

        const store = new FileCachedStore(cacheFile);
        await store.load();
        const started = performance.now();
        let lastChunks = -1;
        const indexed = await indexBook({
          book,
          model,
          client,
          store,
          onProgress: (progress) => {
            if (
              progress.chunksDone !== lastChunks &&
              progress.chunksDone % 10 === 0
            ) {
              lastChunks = progress.chunksDone;
              console.log(
                `  indexed ${progress.chunksDone}/${progress.chunksTotal} chunks, ${Math.round((performance.now() - started) / 1000)} s`,
              );
            }
          },
        });
        console.log(`indexing: ${JSON.stringify(indexed)}`);
        expect(indexed).toEqual({ status: 'complete' });

        // A cutoff below any possible score, so the verdict never hides a passage here.
        const ask = async (question: string) => {
          const result: RetrievalResult = await retrievePassages({
            book,
            question,
            model,
            client,
            store,
            limit: 3,
            cutoff: -2,
          });
          if (result.status !== 'ok')
            throw new Error(`search failed: ${JSON.stringify(result)}`);
          return result.passages;
        };

        const report = (
          label: string,
          question: string,
          passages: Awaited<ReturnType<typeof ask>>,
        ) => {
          console.log(`[${label}] ${question}`);
          for (const passage of passages)
            console.log(
              `    ${passage.score.toFixed(4)}  ch ${passage.locator.chapterNumber}  ${snippet(passage.text)}`,
            );
        };

        const answeredBest: number[] = [];
        let chapterHits = 0;
        for (const { question, chapters } of ANSWERED) {
          const passages = await ask(question);
          report('answered', question, passages);
          answeredBest.push(passages[0].score);
          if (passages.some((p) => chapters.includes(p.locator.chapterNumber)))
            chapterHits += 1;
        }
        const unrelatedBest: number[] = [];
        for (const question of UNRELATED) {
          const passages = await ask(question);
          report('unrelated', question, passages);
          unrelatedBest.push(passages[0].score);
        }
        const absentBest: number[] = [];
        for (const question of ABSENT) {
          const passages = await ask(question);
          report('absent', question, passages);
          absentBest.push(passages[0].score);
        }

        const lowestAnswered = Math.min(...answeredBest);
        const highestUnrelated = Math.max(...unrelatedBest);
        const range = (values: number[]) =>
          `${Math.min(...values).toFixed(4)} to ${Math.max(...values).toFixed(4)}`;
        console.log('--- summary (best score per question) ---');
        console.log(
          `answered:  ${range(answeredBest)}  (${chapterHits}/${ANSWERED.length} found in an expected chapter within the top 3)`,
        );
        console.log(`unrelated: ${range(unrelatedBest)}`);
        console.log(`absent:    ${range(absentBest)}`);
        console.log(
          `gap between the lowest answered (${lowestAnswered.toFixed(4)}) and the highest unrelated (${highestUnrelated.toFixed(4)}): ${(lowestAnswered - highestUnrelated).toFixed(4)}; midpoint ${((lowestAnswered + highestUnrelated) / 2).toFixed(4)}`,
        );
        expect(lowestAnswered).toBeGreaterThan(highestUnrelated);
        // The cutoff in use sits in that gap, so the verdict agrees with the measurement.
        expect(lowestAnswered).toBeGreaterThanOrEqual(RELEVANCE_CUTOFF);
        expect(highestUnrelated).toBeLessThan(RELEVANCE_CUTOFF);
      },
    );
  },
);
