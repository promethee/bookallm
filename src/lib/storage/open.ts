import { openLibrary, type BookLibrary } from './library';
import { MemoryLibrary } from './memory-library';
import { openPluginDatabase } from './plugin-database';
import type { SqlDatabase } from './sql';
import { openSqliteLibrary } from './sqlite-library';
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
  /** Replaces the choice below entirely. */
  openLibrary?: () => Promise<BookLibrary>;
  /** Defaults to detecting the desktop app's webview. */
  isTauri?: boolean;
  /** The desktop app's database; defaults to the SQL plugin's. */
  openSqlDatabase?: () => Promise<SqlDatabase>;
  /** Asks the browser not to evict our data; defaults to `navigator.storage.persist()`. */
  requestPersistence?: () => Promise<unknown>;
}

/**
 * The desktop app keeps its library in a SQLite file in its data folder; the browser
 * build, which cannot, keeps it in the webview's IndexedDB.
 */
function libraryOpener(
  options: OpenStorageOptions,
): () => Promise<BookLibrary> {
  const isTauri =
    options.isTauri ??
    (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  if (!isTauri) return openLibrary;
  const openDatabase = options.openSqlDatabase ?? openPluginDatabase;
  return async () => openSqliteLibrary(await openDatabase());
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
    library = await (options.openLibrary ?? libraryOpener(options))();
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
