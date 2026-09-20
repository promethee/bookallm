import type { Registry, RegistryEntry } from './types';

/**
 * How titles and filenames are compared: Unicode-normalised, lower-cased, with
 * surrounding whitespace removed and inner runs of whitespace collapsed. Every
 * registry implementation must use this so "matching" means the same everywhere.
 */
export const normalizeForMatch = (text: string): string =>
  text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Thrown by `Registry.add` when an entry with the same hash already exists. */
export class DuplicateHashError extends Error {
  constructor(readonly hash: string) {
    super(`A registry entry with hash ${hash} already exists`);
    this.name = 'DuplicateHashError';
  }
}

/** Registry kept in memory. Entries are copied in and out so callers cannot alter them. */
export class InMemoryRegistry implements Registry {
  private readonly entries = new Map<string, RegistryEntry>();

  async get(hash: string): Promise<RegistryEntry | undefined> {
    const entry = this.entries.get(hash);
    return entry && structuredClone(entry);
  }

  async findByTitleOrFilename(
    title: string,
    filename?: string,
  ): Promise<RegistryEntry[]> {
    const wantedTitle = normalizeForMatch(title);
    const wantedFilename = filename ? normalizeForMatch(filename) : '';
    return [...this.entries.values()]
      .filter((entry) => {
        // An empty title or filename never matches: untitled books are not duplicates.
        const sameTitle =
          wantedTitle !== '' && normalizeForMatch(entry.title) === wantedTitle;
        const sameFilename =
          wantedFilename !== '' &&
          entry.sourceFilename !== undefined &&
          normalizeForMatch(entry.sourceFilename) === wantedFilename;
        return sameTitle || sameFilename;
      })
      .map((entry) => structuredClone(entry));
  }

  async add(entry: RegistryEntry): Promise<void> {
    if (this.entries.has(entry.hash)) throw new DuplicateHashError(entry.hash);
    this.entries.set(entry.hash, structuredClone(entry));
  }

  async list(): Promise<RegistryEntry[]> {
    return [...this.entries.values()].map((entry) => structuredClone(entry));
  }

  async remove(hash: string): Promise<boolean> {
    return this.entries.delete(hash);
  }
}
