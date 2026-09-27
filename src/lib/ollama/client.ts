import { DEFAULT_BASE_URL, DETECTION_TIMEOUT_MS } from './defaults';
import type { OllamaClientOptions } from './types';

/** The address and network access shared by every Ollama call. */
export interface OllamaClient {
  /** Where Ollama listens, without a trailing slash. */
  readonly baseUrl: string;
  /** How long detection may take before Ollama counts as unreachable. */
  readonly timeoutMs: number;
  /** Sent as `keep_alive` by requests that load a model; see `OllamaClientOptions`. */
  readonly keepAlive?: string | number;
  /** Sends a request to a path on Ollama, e.g. `/api/version`. */
  request(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * Creates the client used by detection, model checking and pulling. Every call goes to
 * the same address, so a custom address applies everywhere.
 */
export function createOllamaClient(
  options: OllamaClientOptions = {},
): OllamaClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  // Bound so calling it detached from `globalThis` does not throw in a browser.
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    baseUrl,
    timeoutMs: options.timeoutMs ?? DETECTION_TIMEOUT_MS,
    keepAlive: options.keepAlive,
    request: (path, init) => send(`${baseUrl}${path}`, init),
  };
}
