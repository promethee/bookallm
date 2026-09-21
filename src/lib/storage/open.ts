import { openLibrary, type BookLibrary } from './library';
import { MemoryLibrary } from './memory-library';
import {
  LocalStorageSettings,
  type SettingsStore,
  type StorageLike,
  type StorageProblem,
} from './settings';

/** Everything the app saves, ready to use. Never throws when the browser blocks storage. */
export interface AppStorage {
  settings: SettingsStore;
  library: BookLibrary;
  /** Set when books could not be opened and are only kept for this session. */
  booksProblem: 'unavailable' | undefined;
}

export interface OpenStorageOptions {
  getStorage?: () => StorageLike | undefined;
  openLibrary?: () => Promise<BookLibrary>;
  /** Asks the browser not to evict our data; defaults to `navigator.storage.persist()`. */
  requestPersistence?: () => Promise<unknown>;
}

const browserPersistence = async (): Promise<unknown> =>
  typeof navigator !== 'undefined' ? navigator.storage?.persist?.() : undefined;

/**
 * Opens settings and the book library. If the browser's storage cannot be used, the app
 * falls back to memory for that part and the problem is reported so the reader can be
 * told that changes will not be remembered.
 */
export async function openStorage(
  options: OpenStorageOptions = {},
): Promise<AppStorage> {
  const settings = new LocalStorageSettings(options.getStorage);

  let library: BookLibrary;
  let booksProblem: AppStorage['booksProblem'];
  try {
    library = await (options.openLibrary ?? openLibrary)();
  } catch {
    library = new MemoryLibrary();
    booksProblem = 'unavailable';
  }

  // Best effort only: some webviews evict unprotected data, so ask them not to.
  void (options.requestPersistence ?? browserPersistence)().catch(
    () => undefined,
  );

  return { settings, library, booksProblem };
}

/** The one problem to tell the reader about, if any. */
export function storageProblem(
  storage: AppStorage,
): StorageProblem | undefined {
  return storage.booksProblem ?? storage.settings.problem();
}
