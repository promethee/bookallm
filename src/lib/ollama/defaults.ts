import type { InstallStep, Platform, RequiredModels } from './types';

/** Where Ollama listens unless configured otherwise. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';

/** README defaults: a general chat model and a multilingual embedding model. */
export const DEFAULT_MODELS: RequiredModels = {
  chat: 'llama3.1:8b',
  embedding: 'bge-m3',
};

/**
 * How long Ollama keeps a model loaded after the app last used it, as the reader can
 * choose it: minutes, or never unloaded. README: a configurable idle timeout, so the app
 * does not hold GPU memory and RAM indefinitely.
 */
export type IdleUnload = 5 | 10 | 30 | 'never';

export const IDLE_UNLOAD_CHOICES: readonly IdleUnload[] = [5, 10, 30, 'never'];

/** README: "sensible default, e.g. 10 min". */
export const IDLE_UNLOAD_DEFAULT: IdleUnload = 10;

export const isIdleUnload = (value: unknown): value is IdleUnload =>
  IDLE_UNLOAD_CHOICES.includes(value as IdleUnload);

/**
 * The `keep_alive` value Ollama expects for a choice: a duration such as `"10m"`, or a
 * negative number to keep the model loaded with no time limit.
 */
export function keepAliveFor(
  choice: IdleUnload = IDLE_UNLOAD_DEFAULT,
): string | number {
  return choice === 'never' ? -1 : `${choice}m`;
}

/** How long detection waits before deciding Ollama is unreachable. */
export const DETECTION_TIMEOUT_MS = 3000;

/** How long reading the installed models may take. */
export const LIST_MODELS_TIMEOUT_MS = 10_000;

/**
 * Oldest Ollama the app supports. Llama 3.1 needs 0.3.0 (its release notes), but the
 * embeddings endpoint `/api/embed` that later changes use is announced in the 0.3.4
 * release notes (2024-08-06), so 0.3.4 is the floor.
 * Source: https://github.com/ollama/ollama/releases/tag/v0.3.4
 */
export const MINIMUM_OLLAMA_VERSION = '0.3.4';

/**
 * Approximate download sizes in bytes, keyed by normalised model name. Only the
 * defaults are known; anything else is shown without a size.
 * - `bge-m3:latest`: 1,157,672,605 bytes as reported by Ollama's model list.
 * - `llama3.1:8b`: about 4.9 GB per https://ollama.com/library/llama3.1
 */
export const APPROX_MODEL_BYTES: Readonly<Record<string, number>> = {
  'bge-m3:latest': 1_157_672_605,
  'llama3.1:8b': 4_900_000_000,
};

/**
 * Official download pages, confirmed on https://ollama.com/download. The general page
 * is the fallback for an unknown platform.
 */
export const DOWNLOAD_URLS: Readonly<Record<Platform, string>> = {
  windows: 'https://ollama.com/download/windows',
  macos: 'https://ollama.com/download/mac',
  linux: 'https://ollama.com/download/linux',
  unknown: 'https://ollama.com/download',
};

/**
 * The `start` step is there because an unreachable Ollama may be installed but not
 * running; a browser cannot tell the two apart.
 */
export const INSTALL_STEPS: readonly InstallStep[] = [
  'download',
  'install',
  'start',
  'recheck',
];
