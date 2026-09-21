export {
  EMBED_BATCH_SIZE,
  EMBED_TIMEOUT_MS,
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
