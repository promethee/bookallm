import type {
  ChapterVectors,
  SavedChapter,
  VectorStore,
} from '../indexing/types';
import { assertChapterVectors, copyChapterVectors } from './vectors';

/** Vectors kept only in memory: for tests, and when the browser's storage cannot be used. */
export class MemoryVectorStore implements VectorStore {
  private readonly chapters = new Map<string, ChapterVectors>();

  private key(hash: string, model: string, chapter: number): string {
    return JSON.stringify([hash, model, chapter]);
  }

  private records(hash: string, model?: string): ChapterVectors[] {
    return [...this.chapters.values()]
      .filter(
        (record) =>
          record.hash === hash &&
          (model === undefined || record.model === model),
      )
      .sort((a, b) => a.chapter - b.chapter);
  }

  async savedChapters(hash: string, model: string): Promise<SavedChapter[]> {
    return this.records(hash, model).map(({ chapter, dimension }) => ({
      chapter,
      dimension,
    }));
  }

  async loadChapter(
    hash: string,
    model: string,
    chapter: number,
  ): Promise<ChapterVectors | undefined> {
    const record = this.chapters.get(this.key(hash, model, chapter));
    return record && copyChapterVectors(record);
  }

  async saveChapter(record: ChapterVectors): Promise<void> {
    assertChapterVectors(record);
    this.chapters.set(
      this.key(record.hash, record.model, record.chapter),
      copyChapterVectors(record),
    );
  }

  async discard(hash: string, model: string): Promise<void> {
    for (const record of this.records(hash, model))
      this.chapters.delete(this.key(hash, model, record.chapter));
  }

  async discardOtherModels(hash: string, keepModel: string): Promise<void> {
    for (const record of this.records(hash))
      if (record.model !== keepModel)
        this.chapters.delete(this.key(hash, record.model, record.chapter));
  }

  async modelsWithVectors(hash: string): Promise<string[]> {
    return [...new Set(this.records(hash).map((record) => record.model))];
  }
}
