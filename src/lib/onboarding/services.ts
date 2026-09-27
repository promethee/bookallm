import { detectPlatform, openExternal } from '../platform';
import { ingestEpub } from '../ingest';
import {
  createOllamaClient,
  type OllamaClient,
  type Platform,
} from '../ollama';
import { openStorage, type AppStorage } from '../storage';

/** Everything the controller needs from the outside world, so tests can supply fakes. */
export interface Services {
  storage: AppStorage;
  /** A client for Ollama at `baseUrl`, sending `keepAlive` with model-loading requests. */
  createClient(baseUrl: string, keepAlive?: string | number): OllamaClient;
  platform: Platform;
  openExternal(url: string): Promise<boolean>;
  /** The system's preferred languages, most preferred first. */
  systemLanguages: readonly string[];
  ingest: typeof ingestEpub;
  /** How often the waiting screens re-check, in milliseconds. */
  pollIntervalMs: number;
  /** Resolves once the screen has had a chance to paint. */
  nextFrame(): Promise<void>;
  /** The current time in milliseconds; replaceable so tests control the clock. */
  now(): number;
  /** A number in [0, 1); replaceable so tests control which claims Verify mode makes. */
  random(): number;
}

const paint = (): Promise<void> =>
  new Promise((resolve) => {
    // A hidden window pauses animation frames, so never wait on one for long.
    const fallback = setTimeout(resolve, 50);
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        clearTimeout(fallback);
        resolve();
      });
    }
  });

/** The real services for the running app; tests pass overrides. */
export async function createServices(
  overrides: Partial<Services> = {},
): Promise<Services> {
  return {
    storage: overrides.storage ?? (await openStorage()),
    createClient: (baseUrl, keepAlive) =>
      createOllamaClient({ baseUrl, keepAlive }),
    platform: detectPlatform(),
    openExternal,
    systemLanguages:
      typeof navigator === 'undefined' ? [] : navigator.languages,
    ingest: ingestEpub,
    pollIntervalMs: 3000,
    nextFrame: paint,
    now: () => Date.now(),
    random: () => Math.random(),
    ...overrides,
  };
}
