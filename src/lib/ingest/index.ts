export { ingestEpub } from './ingest';
export {
  classifyImport,
  toRegistryEntry,
  type Classification,
} from './classify';
export {
  DEFAULT_MAX_SIZE,
  DEFAULT_TARGET_SIZE,
  chunkBook,
  chunkChapter,
} from './chunk';
export { hashBytes } from './hash';
export { chunksOfChapter, getChapter } from './lookup';
export {
  DuplicateHashError,
  InMemoryRegistry,
  normalizeForMatch,
} from './registry';
export type {
  Book,
  Chapter,
  Chunk,
  ChunkLocator,
  ChunkingOptions,
  DrmScheme,
  IngestError,
  IngestErrorCode,
  IngestOptions,
  IngestResult,
  Registry,
  RegistryEntry,
} from './types';
