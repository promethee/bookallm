export {
  EMBED_BATCH_SIZE,
  EMBED_MIN_TIMEOUT_MS,
  EMBED_TIMEOUT_PER_TEXT_MS,
  embedTimeoutMs,
  classifyEmbedError,
  embedTexts,
  validateEmbeddings,
  type EmbedOptions,
} from './embed';
export { indexBook, type IndexBookOptions, type IndexResult } from './indexer';
export { chunksByChapter, indexStatus, type IndexStatus } from './status';
export type {
  ChapterVectors,
  EmbedResult,
  IndexError,
  IndexErrorCode,
  IndexProgress,
  SavedChapter,
  VectorStore,
} from './types';
