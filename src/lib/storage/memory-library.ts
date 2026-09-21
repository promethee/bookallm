import { toRegistryEntry } from '../ingest/classify';
import { InMemoryRegistry } from '../ingest/registry';
import type { Book } from '../ingest/types';
import type { VectorStore } from '../indexing/types';
import type { BookLibrary } from './library';
import { MemoryVectorStore } from './memory-vectors';

/** A registry whose removals also remove the stored content, like the persistent one. */
class MemoryRegistry extends InMemoryRegistry {
  constructor(
    private readonly books: Map<string, Book>,
    private readonly vectors: MemoryVectorStore,
  ) {
    super();
  }

  override async remove(hash: string): Promise<boolean> {
    this.books.delete(hash);
    for (const model of await this.vectors.modelsWithVectors(hash))
      await this.vectors.discard(hash, model);
    return super.remove(hash);
  }
}

/**
 * A library kept only in memory: for tests, and as the fallback when the browser's
 * storage cannot be used (the reader is told nothing will be remembered).
 */
export class MemoryLibrary implements BookLibrary {
  private readonly books = new Map<string, Book>();
  private readonly memoryVectors = new MemoryVectorStore();
  readonly vectors: VectorStore = this.memoryVectors;
  readonly registry = new MemoryRegistry(this.books, this.memoryVectors);

  async saveBook(book: Book): Promise<void> {
    // Adding the entry is the only step that can fail, and it does so before anything is stored.
    await this.registry.add(toRegistryEntry(book));
    this.books.set(book.hash, structuredClone(book));
  }

  async getBook(hash: string): Promise<Book | undefined> {
    const book = this.books.get(hash);
    return book && structuredClone(book);
  }

  close(): void {}
}
