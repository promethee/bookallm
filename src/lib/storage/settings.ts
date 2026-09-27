import {
  DEFAULT_BASE_URL,
  DEFAULT_MODELS,
  isIdleUnload,
  type IdleUnload,
} from '../ollama/defaults';
import { isLanguage, type Language } from '../i18n/language';

/** The settings the app remembers between launches. */
export interface Settings {
  /** Undefined until the reader has chosen one (that is what "first launch" means). */
  language?: Language;
  chatModel: string;
  embeddingModel: string;
  ollamaUrl: string;
  /** Hash of the active book, if any. */
  activeBook?: string;
  /**
   * True once the hardware acceleration check has been resolved on this install: either
   * it found acceleration, or the reader acknowledged the warning. Absent (the default)
   * means the check has not yet been resolved, so it runs again on the next launch.
   */
  hardwareCheckResolved?: boolean;
  /** How long Ollama keeps models loaded after their last use; absent means the default. */
  idleUnload?: IdleUnload;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  chatModel: DEFAULT_MODELS.chat,
  embeddingModel: DEFAULT_MODELS.embedding,
  ollamaUrl: DEFAULT_BASE_URL,
};

/** Why saving does not work: storage is blocked or missing, or it is full. */
export type StorageProblem = 'unavailable' | 'full';

export interface SettingsStore {
  load(): Settings;
  /** Merges the change into the settings and remembers it; never throws. */
  save(patch: Partial<Settings>): void;
  /** Set when changes cannot be remembered. Settings still work for this session. */
  problem(): StorageProblem | undefined;
}

/** A web address the app accepts for Ollama: `http` or `https` with a host. */
export function isValidOllamaUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== ''
    );
  } catch {
    return false;
  }
}

const nonEmptyText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * Reads settings from anything that was saved, keeping each valid field and giving
 * every invalid or missing field its default. It never throws.
 */
export function parseSettings(raw: unknown): Settings {
  const source =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const settings: Settings = {
    chatModel: nonEmptyText(source.chatModel) ?? DEFAULT_SETTINGS.chatModel,
    embeddingModel:
      nonEmptyText(source.embeddingModel) ?? DEFAULT_SETTINGS.embeddingModel,
    ollamaUrl:
      typeof source.ollamaUrl === 'string' && isValidOllamaUrl(source.ollamaUrl)
        ? source.ollamaUrl.trim()
        : DEFAULT_SETTINGS.ollamaUrl,
  };
  if (isLanguage(source.language)) settings.language = source.language;
  const activeBook = nonEmptyText(source.activeBook);
  if (activeBook) settings.activeBook = activeBook;
  if (source.hardwareCheckResolved === true)
    settings.hardwareCheckResolved = true;
  if (isIdleUnload(source.idleUnload)) settings.idleUnload = source.idleUnload;
  return settings;
}

/** The part of the browser's storage this module uses. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'bookallm.settings';
const VERSION = 1;

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' || error.code === 22);

/**
 * Settings kept in `localStorage`. If storage is blocked, missing or full, they still
 * work in memory for the session and `problem()` says why they are not remembered.
 */
export class LocalStorageSettings implements SettingsStore {
  private storage: StorageLike | undefined;
  private storageProblem: StorageProblem | undefined;
  private current: Settings;

  constructor(
    getStorage: () => StorageLike | undefined = () => globalThis.localStorage,
  ) {
    try {
      this.storage = getStorage();
    } catch {
      // Some browsers throw when the storage is merely accessed (blocked cookies).
    }
    if (!this.storage) this.storageProblem = 'unavailable';
    this.current = this.read();
  }

  private read(): Settings {
    if (!this.storage) return { ...DEFAULT_SETTINGS };
    try {
      const text = this.storage.getItem(KEY);
      return text ? parseSettings(JSON.parse(text)) : { ...DEFAULT_SETTINGS };
    } catch (error) {
      // Damaged JSON is not a storage problem; a storage error is.
      if (!(error instanceof SyntaxError)) this.storageProblem = 'unavailable';
      return { ...DEFAULT_SETTINGS };
    }
  }

  load(): Settings {
    return { ...this.current };
  }

  save(patch: Partial<Settings>): void {
    this.current = parseSettings({ ...this.current, ...patch });
    if (!this.storage) return;
    try {
      this.storage.setItem(
        KEY,
        JSON.stringify({ version: VERSION, ...this.current }),
      );
    } catch (error) {
      this.storageProblem = isQuotaError(error) ? 'full' : 'unavailable';
    }
  }

  problem(): StorageProblem | undefined {
    return this.storageProblem;
  }
}

/** Settings kept only in memory: for tests, and when storage cannot be used. */
export class MemorySettings implements SettingsStore {
  private current: Settings = { ...DEFAULT_SETTINGS };

  constructor(private readonly reported?: StorageProblem) {}

  load(): Settings {
    return { ...this.current };
  }

  save(patch: Partial<Settings>): void {
    this.current = parseSettings({ ...this.current, ...patch });
  }

  problem(): StorageProblem | undefined {
    return this.reported;
  }
}
